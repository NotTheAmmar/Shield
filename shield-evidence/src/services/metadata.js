const { exiftool } = require('exiftool-vendored');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const PDFDocument = require('pdfkit');

// ── Configuration ─────────────────────────────────────────────
const PROCESSING_DIR = path.join(os.tmpdir(), 'shield-metadata');
if (!fs.existsSync(PROCESSING_DIR)) {
    fs.mkdirSync(PROCESSING_DIR, { recursive: true });
}

// ── Social Media Signature Detection ──────────────────────────
const SOCIAL_MEDIA_SIGNATURES = [
    { pattern: /WhatsApp/i, platform: 'WhatsApp' },
    { pattern: /Instagram/i, platform: 'Instagram' },
    { pattern: /fbmd/i, platform: 'Facebook' },
    { pattern: /Telegram/i, platform: 'Telegram' },
    { pattern: /Signal/i, platform: 'Signal' },
    { pattern: /Twitter/i, platform: 'Twitter/X' },
];

function detectSocialMedia(metadata) {
    const searchFields = [
        metadata.Software || '',
        metadata.Comment || '',
        metadata.UserComment || '',
        metadata.ImageDescription || '',
        metadata.ProcessingSoftware || '',
        metadata.CreatorTool || '',
        JSON.stringify(metadata.XMP || {}),
    ].join(' ');

    for (const sig of SOCIAL_MEDIA_SIGNATURES) {
        if (sig.pattern.test(searchFields)) return sig.platform;
    }

    if (metadata.JFIFVersion && !metadata.Make && !metadata.Model && !metadata.GPSLatitude) {
        if (metadata.MIMEType?.includes('jpeg')) return 'Unknown (Likely Social Media)';
    }

    return null;
}

function isRawCameraImage(metadata) {
    return !!(metadata.Make || metadata.Model || metadata.LensModel);
}

// ── Core Extraction Logic ─────────────────────────────────────
async function extractMetadata(evidenceId, objectKey, bucketName = BUCKET) {
    const jobFile = path.join(PROCESSING_DIR, `job-${crypto.randomUUID()}`);
    console.log(`🔬 Processing evidence metadata: ${evidenceId}`);

    try {
        const { rows: [evidence] } = await pool.query(
            'SELECT sha256_hash, filename, fir_id FROM evidence WHERE id = $1',
            [evidenceId]
        );
        if (!evidence) throw new Error(`Evidence ${evidenceId} not found in DB`);

        const minioStream = await minioInternal.getObject(bucketName, objectKey);
        const hasher = crypto.createHash('sha256');
        const writeStream = fs.createWriteStream(jobFile);

        await new Promise((resolve, reject) => {
            minioStream.on('data', (chunk) => {
                hasher.update(chunk);
                writeStream.write(chunk);
            });
            minioStream.on('end', () => {
                writeStream.end();
                resolve();
            });
            minioStream.on('error', reject);
            writeStream.on('error', reject);
        });

        const computedHash = hasher.digest('hex');

        if (computedHash !== evidence.sha256_hash) {
            console.error(`🚨 STORAGE TAMPERING DETECTED: ${evidenceId}`);
            fs.unlinkSync(jobFile);
            await pool.query(
                `INSERT INTO evidence_forensic_log (evidence_id, flags, details, actor)
                 VALUES ($1, $2, $3, 'METADATA_EXTRACTOR')`,
                [
                    evidenceId,
                    '{STORAGE_TAMPERING}',
                    JSON.stringify({
                        expected_hash: evidence.sha256_hash,
                        computed_hash: computedHash,
                        detected_at: new Date().toISOString()
                    })
                ]
            );
            return;
        }

        let metadata = {};
        try {
            metadata = await exiftool.read(jobFile);
        } catch (exifErr) {
            console.warn(`⚠️  ExifTool couldn't read ${evidenceId}: ${exifErr.message}`);
        }

        const gpsLat = metadata.GPSLatitude || null;
        const gpsLng = metadata.GPSLongitude || null;
        const cameraMake = metadata.Make || null;
        const cameraModel = metadata.Model || null;
        const mimeType = metadata.MIMEType || null;

        let originalDate = null;
        const rawDate = metadata.DateTimeOriginal || metadata.CreateDate || metadata.MediaCreateDate;
        if (rawDate) {
            const dateStr = typeof rawDate === 'string' ? rawDate : rawDate?.rawValue || String(rawDate);
            const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) originalDate = normalized;
        }

        const fileStat = fs.statSync(jobFile);
        const gpsPoint = (gpsLat !== null && gpsLng !== null)
            ? `ST_SetSRID(ST_Point(${parseFloat(gpsLng)}, ${parseFloat(gpsLat)}), 4326)`
            : 'NULL';

        await pool.query(
            `INSERT INTO evidence_metadata 
             (evidence_id, gps_location, camera_make, camera_model, original_date, file_size, mime_type, all_metadata)
             VALUES ($1, ${gpsPoint}, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (evidence_id) DO NOTHING`,
            [evidenceId, cameraMake, cameraModel, originalDate, fileStat.size, mimeType, JSON.stringify(metadata)]
        );

        console.log(`✅ Metadata extracted for ${evidenceId}`);
        await runForensicValidation(evidenceId, metadata, gpsLat, gpsLng, originalDate, evidence.fir_id, mimeType);

    } catch (err) {
        console.error(`❌ Metadata extraction failed for ${evidenceId}: ${err.message}`);
    } finally {
        try {
            if (fs.existsSync(jobFile)) fs.unlinkSync(jobFile);
        } catch (e) {
            console.error(`⚠️  Cleanup failed for ${jobFile}: ${e.message}`);
        }
    }
}

// ── Forensic Mismatch Validator ───────────────────────────────
async function runForensicValidation(evidenceId, metadata, gpsLat, gpsLng, originalDate, firId, mimeType) {
    const flags = [];
    const details = {};

    if (gpsLat !== null && gpsLng !== null) {
        try {
            const { rows: gpsJurisdictions } = await pool.query(
                `SELECT id, name FROM jurisdictions
                 WHERE ST_Contains(boundary, ST_SetSRID(ST_Point($1, $2), 4326))`,
                [parseFloat(gpsLng), parseFloat(gpsLat)]
            );

            const { rows: [fir] } = await pool.query(
                'SELECT jurisdiction_id, location, registered_at FROM fir WHERE id = $1',
                [firId]
            );

            if (fir && fir.jurisdiction_id && gpsJurisdictions.length > 0) {
                const matchFound = gpsJurisdictions.some(j => j.id === fir.jurisdiction_id);
                if (!matchFound) {
                    flags.push('LOCATION_MISMATCH');
                    details.location = {
                        gps_jurisdiction: gpsJurisdictions.map(j => j.name),
                        fir_jurisdiction_id: fir.jurisdiction_id,
                        gps_coords: { lat: gpsLat, lng: gpsLng }
                    };
                }
            }

            if (originalDate && fir) {
                const exifTime = new Date(originalDate);
                const firTime = new Date(fir.registered_at);

                if (exifTime > firTime) {
                    flags.push('TIME_SUSPICIOUS');
                    details.timeline = {
                        reason: 'Evidence EXIF date is AFTER FIR registration',
                        exif_date: originalDate,
                        fir_registered: fir.registered_at
                    };
                }

                const tenYearsMs = 10 * 365.25 * 24 * 60 * 60 * 1000;
                if ((firTime.getTime() - exifTime.getTime()) > tenYearsMs) {
                    if (!flags.includes('TIME_SUSPICIOUS')) flags.push('TIME_SUSPICIOUS');
                    details.timeline_age = {
                        reason: 'Evidence EXIF date is >10 years before FIR',
                        exif_date: originalDate,
                        fir_registered: fir.registered_at
                    };
                }
            }
        } catch (err) {
            console.error(`⚠️  Forensic validation error: ${err.message}`);
        }
    }

    if (mimeType && mimeType.includes('image') && !mimeType.includes('png')) {
        const platform = detectSocialMedia(metadata);
        if (platform) {
            flags.push('SOCIAL_MEDIA_WIPE');
            details.social_media = { platform, note: 'Metadata was stripped by social media platform, not manual tampering' };
        } else if (isRawCameraImage(metadata)) {
            const hasGPS = !!(metadata.GPSLatitude);
            const hasDateTime = !!(metadata.DateTimeOriginal || metadata.CreateDate);
            if (!hasGPS && !hasDateTime) {
                flags.push('METADATA_STRIPPED');
                details.stripping = {
                    reason: 'Camera-originated image missing GPS and DateTime — possible selective stripping',
                    camera: `${metadata.Make || '?'} ${metadata.Model || '?'}`
                };
            }
        } else if (!metadata.Make && !metadata.Model && !metadata.Software &&
                   !metadata.GPSLatitude && !metadata.DateTimeOriginal) {
            flags.push('METADATA_STRIPPED');
            details.stripping = { reason: 'Image has zero EXIF metadata and no social media signature' };
        }
    }

    if (flags.length > 0) {
        const pgFlags = `{${flags.join(',')}}`;
        await pool.query(
            `INSERT INTO evidence_forensic_log (evidence_id, flags, details, actor)
             VALUES ($1, $2, $3, 'METADATA_EXTRACTOR')`,
            [evidenceId, pgFlags, JSON.stringify(details)]
        );
    }
}

// ── PDF Generation ────────────────────────────────────────────
async function generatePdfReport(jobData) {
    const { evidenceId, jobId } = jobData;
    console.log(`📄 Generating PDF report for evidence ${evidenceId}, job ${jobId}`);

    try {
        const chainData = await getChainOfCustody(evidenceId);
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        const pdfPromise = new Promise((resolve) => doc.on('end', resolve));

        doc.fontSize(20).font('Helvetica-Bold').text('SHIELD — Forensic Evidence Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        doc.fontSize(14).font('Helvetica-Bold').text('1. Evidence Details');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`File: ${chainData.evidence.fileName}`);
        doc.text(`SHA-256: ${chainData.evidence.hash}`);
        doc.text(`Uploaded: ${chainData.evidence.uploadDate}`);
        doc.text(`Uploaded By: ${chainData.evidence.uploadedBy || 'Unknown'}`);
        doc.moveDown(1);

        doc.fontSize(14).font('Helvetica-Bold').text('2. Linked FIR');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`FIR Number: ${chainData.fir.firNumber}`);
        doc.text(`Category: ${chainData.fir.category}`);
        doc.text(`Location: ${chainData.fir.location}`);
        doc.text(`Officer: ${chainData.fir.reportingOfficer}`);
        doc.text(`Registered: ${chainData.fir.registeredAt}`);
        doc.moveDown(1);

        if (chainData.metadata) {
            doc.fontSize(14).font('Helvetica-Bold').text('3. Extracted Metadata');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            if (chainData.metadata.gpsLat && chainData.metadata.gpsLng) {
                doc.text(`GPS: ${chainData.metadata.gpsLat}, ${chainData.metadata.gpsLng}`);
            }
            doc.text(`Camera: ${chainData.metadata.cameraMake || '—'} ${chainData.metadata.cameraModel || '—'}`);
            doc.text(`Original Date: ${chainData.metadata.originalDate || '—'}`);
            doc.text(`MIME Type: ${chainData.metadata.mimeType || '—'}`);
            doc.text(`File Size: ${chainData.metadata.fileSize ? (chainData.metadata.fileSize / 1024 / 1024).toFixed(2) + ' MB' : '—'}`);
            doc.moveDown(1);
        }

        if (chainData.forensicFlags.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('4. Forensic Flags (Append-Only Ledger)');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            for (const flag of chainData.forensicFlags) {
                doc.text(`⚠ [${flag.loggedAt}] ${flag.flags.join(', ')} — Actor: ${flag.actor}`);
                if (flag.details && Object.keys(flag.details).length > 0) {
                    doc.text(`  Details: ${JSON.stringify(flag.details)}`, { indent: 20 });
                }
            }
            doc.moveDown(1);
        }

        if (chainData.verificationHistory.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('5. Integrity Verification History');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            for (const v of chainData.verificationHistory) {
                doc.text(`[${v.checkedAt}] ${v.action}: ${v.result} — By: ${v.actorId || 'System'}`);
            }
            doc.moveDown(1);
        }

        if (chainData.accessLog.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('6. API Access Audit Trail');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            for (const a of chainData.accessLog) {
                doc.text(`[${a.accessedAt}] ${a.method} ${a.endpoint} — IP: ${a.ipAddress} — Status: ${a.statusCode}`);
            }
        }

        doc.end();
        await pdfPromise;

        const reportsBucket = 'reports';
        const exists = await minioInternal.bucketExists(reportsBucket).catch(() => false);
        if (!exists) await minioInternal.makeBucket(reportsBucket);

        const pdfKey = `chain-of-custody-${evidenceId}-${Date.now()}.pdf`;
        const pdfBuffer = Buffer.concat(chunks);
        await minioInternal.putObject(reportsBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
            'Content-Type': 'application/pdf'
        });

        await pool.query(
            `UPDATE report_jobs SET status = 'READY', download_url = $1, completed_at = NOW() WHERE id = $2`,
            [pdfKey, jobId]
        );

    } catch (err) {
        console.error(`❌ PDF generation failed for ${evidenceId}: ${err.message}`);
        await pool.query(
            `UPDATE report_jobs SET status = 'FAILED', completed_at = NOW() WHERE id = $1`,
            [jobId]
        );
    }
}

// ── Chain of Custody Data Fetcher ─────────────────────────────
async function getChainOfCustody(evidenceId) {
    const { rows: [evidence] } = await pool.query(
        `SELECT e.id, e.filename as "fileName", e.sha256_hash as hash, e.uploaded_at as "uploadDate",
                e.uploaded_by as "uploadedBy", e.fir_id as "firId"
         FROM evidence e WHERE e.id = $1`, [evidenceId]
    );
    if (!evidence) throw new Error('Evidence not found');

    const { rows: [fir] } = await pool.query(
        `SELECT fir_number as "firNumber", case_category as category, location,
                reporting_officer as "reportingOfficer", registered_at as "registeredAt",
                jurisdiction_id as "jurisdictionId"
         FROM fir WHERE id = $1`, [evidence.firId]
    );

    const { rows: metaRows } = await pool.query(
        `SELECT ST_Y(gps_location) as "gpsLat", ST_X(gps_location) as "gpsLng",
                camera_make as "cameraMake", camera_model as "cameraModel",
                original_date as "originalDate", file_size as "fileSize",
                mime_type as "mimeType", all_metadata as "allMetadata"
         FROM evidence_metadata WHERE evidence_id = $1`, [evidenceId]
    );

    const { rows: flags } = await pool.query(
        `SELECT flags, details, actor, logged_at as "loggedAt"
         FROM evidence_forensic_log WHERE evidence_id = $1
         ORDER BY logged_at ASC`, [evidenceId]
    );

    const { rows: verifications } = await pool.query(
        `SELECT action, result, actor_id as "actorId", checked_at as "checkedAt"
         FROM audit_log WHERE evidence_id = $1
         ORDER BY checked_at ASC`, [evidenceId]
    );

    const { rows: accessLog } = await pool.query(
        `SELECT method, endpoint, ip_address as "ipAddress", status_code as "statusCode",
                accessed_at as "accessedAt"
         FROM api_audit_log WHERE endpoint LIKE $1
         ORDER BY accessed_at ASC LIMIT 50`,
        [`%${evidenceId}%`]
    );

    return {
        evidence,
        fir: fir || {},
        metadata: metaRows[0] || null,
        forensicFlags: flags,
        verificationHistory: verifications,
        accessLog,
    };
}

// Cleanup on shutdown
process.on('SIGTERM', async () => {
    try {
        await exiftool.end();
    } catch (e) { }
});

module.exports = {
    extractMetadata,
    generatePdfReport,
    getChainOfCustody
};
