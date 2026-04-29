/**
 * SHIELD Metadata Extraction Engine — BullMQ Worker
 * 
 * Event-driven EXIF extraction with:
 * - SHA-256 re-verification (tee stream to hasher during download)
 * - Ephemeral disk storage with UUID naming (no collisions)
 * - Immediate unlink on tampered payloads
 * - Smart EXIF stripping heuristic (SOCIAL_MEDIA_WIPE vs METADATA_STRIPPED)
 * - PostGIS spatial mismatch detection
 * - Timeline validation
 */

const { Worker, Queue } = require('bullmq');
const IORedis = require('ioredis');
const { exiftool } = require('exiftool-vendored');
const { Client: MinioClient } = require('minio');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────

const PROCESSING_DIR = '/processing';
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;   // 10 minutes
const STALE_FILE_AGE_MS = 30 * 60 * 1000;     // 30 minutes

const redisConnection = new IORedis({
    host: process.env.REDIS_HOST || 'shield-redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 5,
});

const minio = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'minio-store',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.BUCKET_NAME || 'evidence';

// ── PDF Report Queue ──────────────────────────────────────────
const pdfQueue = new Queue('pdf-generation', { connection: redisConnection });

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

    // WhatsApp JPEG signature: often has JFIF with specific thumbnail sizes
    if (metadata.JFIFVersion && !metadata.Make && !metadata.Model && !metadata.GPSLatitude) {
        // Images with JFIF but zero camera data are likely social media
        if (metadata.MIMEType?.includes('jpeg')) return 'Unknown (Likely Social Media)';
    }

    return null;
}

function isRawCameraImage(metadata) {
    return !!(metadata.Make || metadata.Model || metadata.LensModel);
}

// ── Core Extraction Logic ─────────────────────────────────────

async function processJob(job) {
    const { evidenceId, objectKey, bucketName } = job.data;
    const jobFile = path.join(PROCESSING_DIR, `job-${crypto.randomUUID()}`);

    console.log(`🔬 Processing evidence: ${evidenceId}`);

    try {
        // 1. Get expected hash from database
        const { rows: [evidence] } = await pool.query(
            'SELECT sha256_hash, filename, fir_id FROM evidence WHERE id = $1',
            [evidenceId]
        );
        if (!evidence) throw new Error(`Evidence ${evidenceId} not found in DB`);

        // 2. Stream from MinIO → disk, tee to SHA-256 hasher
        const minioStream = await minio.getObject(bucketName || BUCKET, objectKey);
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

        // 3. SHA-256 verification — IMMEDIATE unlink on mismatch
        if (computedHash !== evidence.sha256_hash) {
            console.error(`🚨 STORAGE TAMPERING DETECTED: ${evidenceId}`);
            console.error(`   Expected: ${evidence.sha256_hash}`);
            console.error(`   Computed: ${computedHash}`);

            // DELETE TAMPERED FILE IMMEDIATELY — before any DB write
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
            return; // HALT — do not extract metadata from tampered evidence
        }

        // 4. Run ExifTool against local file (seekable access for video moov atoms)
        let metadata = {};
        try {
            metadata = await exiftool.read(jobFile);
        } catch (exifErr) {
            console.warn(`⚠️  ExifTool couldn't read ${evidenceId}: ${exifErr.message}`);
        }

        // 5. Extract structured fields
        const gpsLat = metadata.GPSLatitude || null;
        const gpsLng = metadata.GPSLongitude || null;
        const cameraMake = metadata.Make || null;
        const cameraModel = metadata.Model || null;
        const mimeType = metadata.MIMEType || null;

        // Parse EXIF date as TIMESTAMP (no timezone — raw wall-clock time)
        let originalDate = null;
        const rawDate = metadata.DateTimeOriginal || metadata.CreateDate || metadata.MediaCreateDate;
        if (rawDate) {
            // exiftool-vendored returns ExifDateTime objects with .rawValue
            const dateStr = typeof rawDate === 'string' ? rawDate : rawDate?.rawValue || String(rawDate);
            // EXIF format: "2023:10:24 14:30:00" → "2023-10-24T14:30:00"
            const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) originalDate = normalized;
        }

        const fileStat = fs.statSync(jobFile);

        // 6. Insert metadata
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

        // 7. Run forensic validations
        await runForensicValidation(evidenceId, metadata, gpsLat, gpsLng, originalDate, evidence.fir_id, mimeType);

    } finally {
        // ALWAYS clean up, even on crashes
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

    // --- Location Validation (PostGIS polygon ID comparison) ---
    if (gpsLat !== null && gpsLng !== null) {
        try {
            // Find which jurisdiction the GPS coords fall into
            const { rows: gpsJurisdictions } = await pool.query(
                `SELECT id, name FROM jurisdictions
                 WHERE ST_Contains(boundary, ST_SetSRID(ST_Point($1, $2), 4326))`,
                [parseFloat(gpsLng), parseFloat(gpsLat)]
            );

            // Get the FIR's registered jurisdiction
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
                    console.warn(`🚩 LOCATION_MISMATCH: Evidence ${evidenceId} GPS not in FIR jurisdiction`);
                }
            }

            // --- Timeline Validation ---
            if (originalDate && fir) {
                const exifTime = new Date(originalDate);
                const firTime = new Date(fir.registered_at);

                // Flag if evidence was created AFTER the FIR was registered
                if (exifTime > firTime) {
                    flags.push('TIME_SUSPICIOUS');
                    details.timeline = {
                        reason: 'Evidence EXIF date is AFTER FIR registration',
                        exif_date: originalDate,
                        fir_registered: fir.registered_at
                    };
                    console.warn(`🚩 TIME_SUSPICIOUS: Evidence ${evidenceId} postdates FIR`);
                }

                // Flag if evidence is impossibly old (>10 years before FIR)
                const tenYearsMs = 10 * 365.25 * 24 * 60 * 60 * 1000;
                if ((firTime.getTime() - exifTime.getTime()) > tenYearsMs) {
                    if (!flags.includes('TIME_SUSPICIOUS')) flags.push('TIME_SUSPICIOUS');
                    details.timeline_age = {
                        reason: 'Evidence EXIF date is >10 years before FIR',
                        exif_date: originalDate,
                        fir_registered: fir.registered_at
                    };
                    console.warn(`🚩 TIME_SUSPICIOUS: Evidence ${evidenceId} impossibly old`);
                }
            }
        } catch (err) {
            console.error(`⚠️  Forensic validation error: ${err.message}`);
        }
    }

    // --- EXIF Stripping Detection (smart heuristic) ---
    if (mimeType && mimeType.includes('image') && !mimeType.includes('png')) {
        const platform = detectSocialMedia(metadata);
        if (platform) {
            flags.push('SOCIAL_MEDIA_WIPE');
            details.social_media = {
                platform,
                note: 'Metadata was stripped by social media platform, not manual tampering'
            };
            console.log(`ℹ️  SOCIAL_MEDIA_WIPE: Evidence from ${platform}`);
        } else if (isRawCameraImage(metadata)) {
            // Raw camera image — check if critical EXIF is selectively removed
            const hasGPS = !!(metadata.GPSLatitude);
            const hasDateTime = !!(metadata.DateTimeOriginal || metadata.CreateDate);
            if (!hasGPS && !hasDateTime) {
                flags.push('METADATA_STRIPPED');
                details.stripping = {
                    reason: 'Camera-originated image missing GPS and DateTime — possible selective stripping',
                    camera: `${metadata.Make || '?'} ${metadata.Model || '?'}`
                };
                console.warn(`🚩 METADATA_STRIPPED: Raw camera image ${evidenceId} missing critical EXIF`);
            }
        } else if (!metadata.Make && !metadata.Model && !metadata.Software &&
                   !metadata.GPSLatitude && !metadata.DateTimeOriginal) {
            // No camera data AND no social media signature — generic strip
            flags.push('METADATA_STRIPPED');
            details.stripping = { reason: 'Image has zero EXIF metadata and no social media signature' };
        }
    }

    // --- Persist flags (append-only) ---
    if (flags.length > 0) {
        const pgFlags = `{${flags.join(',')}}`;
        await pool.query(
            `INSERT INTO evidence_forensic_log (evidence_id, flags, details, actor)
             VALUES ($1, $2, $3, 'METADATA_EXTRACTOR')`,
            [evidenceId, pgFlags, JSON.stringify(details)]
        );
        console.log(`📋 Forensic flags logged for ${evidenceId}: ${flags.join(', ')}`);
    } else {
        console.log(`✅ No forensic issues for ${evidenceId}`);
    }
}

// ── Cleanup Watchdog ──────────────────────────────────────────

function startCleanupWatchdog() {
    setInterval(() => {
        try {
            const files = fs.readdirSync(PROCESSING_DIR);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(PROCESSING_DIR, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > STALE_FILE_AGE_MS) {
                        fs.unlinkSync(filePath);
                        console.warn(`🧹 Watchdog cleaned stale file: ${file}`);
                    }
                } catch (e) { /* file may have been deleted between readdir and stat */ }
            }
        } catch (e) {
            console.error(`❌ Cleanup watchdog error: ${e.message}`);
        }
    }, CLEANUP_INTERVAL_MS);

    console.log(`🧹 Cleanup watchdog started (every ${CLEANUP_INTERVAL_MS / 60000} min, stale > ${STALE_FILE_AGE_MS / 60000} min)`);
}

// ── PDF Generation Worker ─────────────────────────────────────

async function generatePdfReport(job) {
    const { evidenceId, jobId } = job.data;
    const PDFDocument = require('pdfkit');

    console.log(`📄 Generating PDF report for evidence ${evidenceId}, job ${jobId}`);

    try {
        // Fetch all chain-of-custody data
        const chainData = await getChainOfCustody(evidenceId);

        // Build PDF in memory
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        const pdfPromise = new Promise((resolve) => doc.on('end', resolve));

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('SHIELD — Forensic Evidence Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        // Evidence Details
        doc.fontSize(14).font('Helvetica-Bold').text('1. Evidence Details');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`File: ${chainData.evidence.fileName}`);
        doc.text(`SHA-256: ${chainData.evidence.hash}`);
        doc.text(`Uploaded: ${chainData.evidence.uploadDate}`);
        doc.text(`Uploaded By: ${chainData.evidence.uploadedBy || 'Unknown'}`);
        doc.moveDown(1);

        // FIR Details
        doc.fontSize(14).font('Helvetica-Bold').text('2. Linked FIR');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`FIR Number: ${chainData.fir.firNumber}`);
        doc.text(`Category: ${chainData.fir.category}`);
        doc.text(`Location: ${chainData.fir.location}`);
        doc.text(`Officer: ${chainData.fir.reportingOfficer}`);
        doc.text(`Registered: ${chainData.fir.registeredAt}`);
        doc.moveDown(1);

        // Extracted Metadata
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

        // Forensic Flags
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

        // Verification History
        if (chainData.verificationHistory.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('5. Integrity Verification History');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            for (const v of chainData.verificationHistory) {
                doc.text(`[${v.checkedAt}] ${v.action}: ${v.result} — By: ${v.actorId || 'System'}`);
            }
            doc.moveDown(1);
        }

        // API Access Log
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

        // Upload to MinIO reports bucket
        const reportsBucket = 'reports';
        const exists = await minio.bucketExists(reportsBucket).catch(() => false);
        if (!exists) await minio.makeBucket(reportsBucket);

        const pdfKey = `chain-of-custody-${evidenceId}-${Date.now()}.pdf`;
        const pdfBuffer = Buffer.concat(chunks);
        await minio.putObject(reportsBucket, pdfKey, pdfBuffer, pdfBuffer.length, {
            'Content-Type': 'application/pdf'
        });

        // Store the object key (NOT a pre-signed URL — browser can't reach minio-store)
        // The download will be proxied through /api/reports/download/:jobId
        await pool.query(
            `UPDATE report_jobs SET status = 'READY', download_url = $1, completed_at = NOW() WHERE id = $2`,
            [pdfKey, jobId]
        );

        console.log(`📄 PDF report ready for ${evidenceId}: ${pdfKey}`);

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

// ── Boot ──────────────────────────────────────────────────────

async function start() {
    console.log('═'.repeat(60));
    console.log('🔬 SHIELD Metadata Extraction Engine Starting...');
    console.log('═'.repeat(60));

    // Ensure processing dir exists
    fs.mkdirSync(PROCESSING_DIR, { recursive: true });

    // Start extraction worker
    const extractionWorker = new Worker('metadata-extraction', processJob, {
        connection: redisConnection,
        concurrency: 2,
        limiter: { max: 5, duration: 1000 },
    });

    extractionWorker.on('completed', (job) => {
        console.log(`✅ Job completed: ${job.id} (evidence: ${job.data.evidenceId})`);
    });

    extractionWorker.on('failed', (job, err) => {
        console.error(`❌ Job failed: ${job?.id} — ${err.message}`);
    });

    // Start PDF worker
    const pdfWorker = new Worker('pdf-generation', generatePdfReport, {
        connection: redisConnection,
        concurrency: 1,
    });

    pdfWorker.on('completed', (job) => {
        console.log(`📄 PDF job completed: ${job.id}`);
    });

    pdfWorker.on('failed', (job, err) => {
        console.error(`❌ PDF job failed: ${job?.id} — ${err.message}`);
    });

    // Start cleanup watchdog
    startCleanupWatchdog();

    console.log('🟢 Extraction worker ready. Waiting for jobs...');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await exiftool.end();
    await pool.end();
    process.exit(0);
});

start().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

// Export for reports route integration
module.exports = { getChainOfCustody };
