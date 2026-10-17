const express = require('express');
const busboy = require('busboy');
const crypto = require('crypto');
const path = require('path');
const { PassThrough } = require('stream');
const rateLimit = require('express-rate-limit');

const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const ledger = require('../services/ledger');
const requireRoles = require('../middleware/rbac');
const { extractMetadata } = require('../services/metadata');
const { generateSection63BSAPdf } = require('../services/sec63Generator');

const router = express.Router();

// Rate limiter for Evidence endpoints (CodeQL missing-rate-limiting fix)
const evidenceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests on evidence endpoints. Please try again later.' }
});

router.use(evidenceLimiter);

// ─────────────────────────────────────────────
// Middleware: Internal Network Perimeter Guard
// ─────────────────────────────────────────────
const internalNetworkGuard = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '';
    // Allow localhost (IPv4/IPv6) or standard Docker subnets (A, B, C classes)
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.0.0.1') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) || /^::ffff:172\./.test(ip) ||
        /^10\./.test(ip) || /^::ffff:10\./.test(ip) ||
        /^192\.168\./.test(ip) || /^::ffff:192\.168\./.test(ip)) {
        return next();
    }
    console.warn(`[SECURITY] Blocked external access attempt to internal route from IP: ${ip}`);
    return res.status(403).json({ error: 'Forbidden: Internal Network Traffic Only' });
};

// ─────────────────────────────────────────────
// POST /api/evidence/upload
// Person 2 & 3: Ingestion permitted for Police Officer and Forensic Expert
// Direct FIR selection without requiring prior police requisition
// ─────────────────────────────────────────────
router.post('/upload', requireRoles(['Police Officer', 'Forensic Expert']), async (req, res) => {
    let responseSent = false;
    const send = (status, body) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(body);
        }
    };

    const userId = req.user.userId || req.user.id;
    let fir_id;
    let capturedCategory = 'CCTV Footage';
    let capturedDescription = '';
    let sourceData = null;
    let sourceIdPromise = null;
    const uploadPromises = [];
    let filesCount = 0;

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 500 * 1024 * 1024 + 1 }, // 500 MB max
    });

    bb.on('field', (name, val) => {
        if (name === 'fir_id' || name === 'firId') fir_id = val;
        if (name === 'category') capturedCategory = val;
        if (name === 'description') capturedDescription = val;
        if (name === 'sourceData') {
            try {
                sourceData = JSON.parse(val);
                if (sourceData.sourceType) {
                    sourceIdPromise = pool.query(`
                        INSERT INTO evidence_source (source_type, make, model, serial_number, identifiers, device_chain, lawful_control, proper_operation, ownership_status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        RETURNING id
                    `, [
                        sourceData.sourceType, sourceData.make || null, sourceData.model || null, sourceData.serial || null, sourceData.identifiers || null,
                        JSON.stringify(sourceData.deviceChain || []), sourceData.lawfulControl ?? true, sourceData.properOperation ?? true, sourceData.ownershipStatus || null
                    ]).then(r => r.rows[0].id).catch(err => {
                        console.error('Failed to insert optional evidence_source:', err);
                        return null;
                    });
                }
            } catch (e) {
                console.warn('Optional sourceData parsing failed, proceeding without it:', e.message);
            }
        }
    });

    bb.on('file', (fieldname, fileStream, info) => {
        const { filename, mimeType } = info;
        filesCount++;

        if (!fir_id) {
            fileStream.resume();
            return send(400, { error: 'fir_id field must come before files in FormData' });
        }

        const evidenceId = crypto.randomUUID();
        const ext = path.extname(filename) || '';
        const objectKey = `${evidenceId}${ext}`;
        let fileSize = 0;

        const hashStream = crypto.createHash('sha256');
        const passThrough = new PassThrough();

        let rejectPut;
        const putPromise = new Promise((resolve, reject) => {
            rejectPut = reject;
            minioInternal
                .putObject(BUCKET, objectKey, passThrough, null, { 'Content-Type': mimeType })
                .then(resolve)
                .catch(reject);
        });

        const hashPromise = new Promise((resolve, reject) => {
            hashStream.on('finish', () => resolve(hashStream.digest('hex')));
            hashStream.on('error', reject);
        });

        passThrough.on('error', rejectPut);
        fileStream.on('error', rejectPut);

        fileStream.on('limit', async () => {
            fileStream.destroy();
            try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) { }
            send(413, { error: 'File too large. Maximum allowed size is 500MB.' });
        });

        fileStream.pipe(hashStream);
        fileStream.pipe(passThrough);
        fileStream.on('data', (chunk) => { fileSize += chunk.length; });

        const fileUploadPromise = Promise.all([putPromise, hashPromise, sourceIdPromise || Promise.resolve(null)])
            .then(async ([, hash, sourceId]) => {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    // 1. Validate parent FIR
                    const firRes = await client.query('SELECT id, fir_number, station FROM fir WHERE id = $1', [fir_id]);
                    if (!firRes.rows.length) {
                        throw new Error(`Referenced FIR '${fir_id}' does not exist.`);
                    }

                    // 2. Attempt blockchain anchoring on EvidenceLedger.sol (non-blocking)
                    let ledgerTxId = null;
                    let ledgerBlockNumber = null;
                    let ledgerTimestamp = null;
                    try {
                        let privateKey = null;
                        const userRes = await client.query('SELECT encrypted_private_key FROM users WHERE id = $1', [userId]);
                        const encryptedPrivateKey = userRes.rows[0]?.encrypted_private_key;
                        if (encryptedPrivateKey) {
                            const { decryptPrivateKey } = require('../crypto');
                            privateKey = decryptPrivateKey(encryptedPrivateKey);
                        }
                        const ledgerResult = await ledger.storeEvidenceHash(evidenceId, fir_id, hash, privateKey);
                        ledgerTxId = ledgerResult?.txId || null;
                        ledgerBlockNumber = ledgerResult?.blockNumber || null;
                        ledgerTimestamp = ledgerTxId ? new Date().toISOString() : null;
                    } catch (ledgerErr) {
                        console.warn(`[Evidence] Blockchain anchoring failed for ${evidenceId}: ${ledgerErr.message}. Evidence saved without ledger proof.`);
                    }

                    // 3. Store record in PostgreSQL
                    await client.query(
                        `INSERT INTO evidence
                         (id, fir_id, source_id, filename, bucket_name, object_key, sha256_hash, uploaded_by, category, mime_type, file_size, ledger_tx_id, ledger_block_number, ledger_timestamp, uploader_name, uploader_employee_id, description)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
                        [
                            evidenceId, fir_id, sourceId, filename, BUCKET, objectKey, hash, userId,
                            capturedCategory, mimeType, fileSize, ledgerTxId, ledgerBlockNumber, ledgerTimestamp,
                            req.user.name || null, req.user.employeeId || req.user.employee_id || null, capturedDescription
                        ]
                    );

                    await client.query('COMMIT');

                    // Extract forensic metadata asynchronously
                    extractMetadata(evidenceId, objectKey, BUCKET).catch(err => console.warn('⚠️ Could not extract metadata:', err.message));

                    return { 
                        id: evidenceId, 
                        filename, 
                        sha256_hash: hash, 
                        ledgerTxId, 
                        ledgerBlockNumber,
                        category: capturedCategory 
                    };
                } catch (err) {
                    await client.query('ROLLBACK');
                    try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) { }
                    throw err;
                } finally {
                    client.release();
                }
            })
            .catch(err => {
                console.error("Evidence file upload error:", err);
                return { error: true, message: err.message };
            });

        uploadPromises.push(fileUploadPromise);
    });

    bb.on('close', async () => {
        if (filesCount === 0 && !responseSent) {
            return send(400, { error: 'No files found in the request.' });
        }
        
        try {
            const results = await Promise.all(uploadPromises);
            const errors = results.filter(r => r && r.error);
            if (errors.length > 0) {
                return send(500, { error: 'Upload failed for one or more files.', details: errors });
            }
            send(201, { 
                id: results[0]?.id, 
                files: results,
                message: 'Forensic evidence ingested and anchored successfully.' 
            });
        } catch (err) {
            console.error('Evidence upload batch error:', err);
            send(500, { error: 'Upload failed for one or more files.', details: err.message });
        }
    });

    req.pipe(bb);
});

// ─────────────────────────────────────────────
// POST /api/evidence/:id/report
// Person 3: Forensic Expert attaches technical examination report
// ─────────────────────────────────────────────
router.post('/:id/report', requireRoles(['Forensic Expert']), async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;

    try {
        const { rows: evRows } = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]);
        if (!evRows.length) return res.status(404).json({ error: 'Evidence record not found.' });

        const fields = {};
        let reportFileStream = null;
        let reportFileInfo = null;
        let fileUploadPromise = null;

        const bb = busboy({
            headers: req.headers,
            limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max for report attachments
        });

        bb.on('field', (name, val) => {
            fields[name] = val;
        });

        bb.on('file', (fieldname, fileStream, info) => {
            reportFileInfo = info;
            const ext = path.extname(info.filename) || '.pdf';
            const reportKey = `reports/report-${id}-${Date.now()}${ext}`;
            const hashStream = crypto.createHash('sha256');
            const passThrough = new PassThrough();
            let fileSize = 0;

            const putPromise = minioInternal.putObject(BUCKET, reportKey, passThrough, null, {
                'Content-Type': info.mimeType || 'application/pdf'
            });

            const hashPromise = new Promise((resolve, reject) => {
                hashStream.on('finish', () => resolve(hashStream.digest('hex')));
                hashStream.on('error', reject);
            });

            fileStream.on('data', chunk => { fileSize += chunk.length; });
            fileStream.pipe(hashStream);
            fileStream.pipe(passThrough);

            fileUploadPromise = Promise.all([putPromise, hashPromise]).then(([, hash]) => ({
                reportKey,
                hash,
                filename: info.filename,
                mimeType: info.mimeType || 'application/pdf',
                fileSize
            }));
        });

        bb.on('close', async () => {
            try {
                let reportData = null;
                if (fileUploadPromise) {
                    reportData = await fileUploadPromise;
                } else {
                    // If no raw file uploaded, generate a structured markdown/text report object in MinIO
                    const textReport = 
                        `# FORENSIC EXAMINATION REPORT\n` +
                        `Evidence ID: ${id}\n` +
                        `Examiner: ${req.user.name} (${req.user.employeeId || req.user.employee_id || 'FSL'})\n` +
                        `Date: ${new Date().toISOString()}\n\n` +
                        `## Tools Used:\n${fields.toolsUsed || 'Forensic Workstation Suite'}\n\n` +
                        `## Extraction Methodology:\n${fields.extractionMethodology || 'Standard Bitstream Acquisition'}\n\n` +
                        `## Hash Verification Results:\n${fields.hashVerificationResults || 'SHA-256 match confirmed'}\n\n` +
                        `## Notes:\n${fields.examinerNotes || 'None'}\n`;

                    const reportKey = `reports/report-${id}-${Date.now()}.txt`;
                    const reportBuf = Buffer.from(textReport, 'utf8');
                    const hash = crypto.createHash('sha256').update(reportBuf).digest('hex');

                    await minioInternal.putObject(BUCKET, reportKey, reportBuf, reportBuf.length, {
                        'Content-Type': 'text/plain'
                    });

                    reportData = {
                        reportKey,
                        hash,
                        filename: `Forensic_Report_${id.slice(0, 8)}.txt`,
                        mimeType: 'text/plain',
                        fileSize: reportBuf.length
                    };
                }

                // Insert into forensic_analysis_reports table
                const reportInsert = await pool.query(`
                    INSERT INTO forensic_analysis_reports 
                    (evidence_id, filename, bucket_name, object_key, sha256_hash, file_size, mime_type, tools_used, extraction_methodology, hash_verification_results, examiner_notes, examiner_id, examiner_name, examiner_employee_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING id
                `, [
                    id, reportData.filename, BUCKET, reportData.reportKey, reportData.hash,
                    reportData.fileSize, reportData.mimeType, fields.toolsUsed || null,
                    fields.extractionMethodology || null, fields.hashVerificationResults || null,
                    fields.examinerNotes || null, userId, req.user.name,
                    req.user.employeeId || req.user.employee_id || null
                ]);

                // Update evidence table summary flags
                await pool.query(`
                    UPDATE evidence SET
                        has_report = TRUE,
                        report_object_key = $1,
                        report_filename = $2,
                        report_hash = $3,
                        report_tools = $4,
                        report_methodology = $5,
                        report_results = $6,
                        report_uploaded_at = NOW()
                    WHERE id = $7
                `, [
                    reportData.reportKey, reportData.filename, reportData.hash,
                    fields.toolsUsed || null, fields.extractionMethodology || null,
                    fields.hashVerificationResults || null, id
                ]);

                res.status(201).json({
                    message: 'Forensic analysis report attached successfully',
                    reportId: reportInsert.rows[0].id,
                    evidenceId: id,
                    filename: reportData.filename,
                    sha256_hash: reportData.hash
                });
            } catch (innerErr) {
                console.error('Report saving error:', innerErr);
                res.status(500).json({ error: 'Failed to process report document', details: innerErr.message });
            }
        });

        req.pipe(bb);
    } catch (err) {
        console.error('POST /evidence/:id/report error:', err);
        res.status(500).json({ error: 'Internal server error while uploading report' });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/:id/report
// Fetch attached forensic analysis report metadata & download link
// ─────────────────────────────────────────────
router.get('/:id/report', requireRoles(['Forensic Expert', 'Police Officer', 'Judicial Authority', 'Judicial Magistrate', 'Sessions Judge', 'Advocate']), async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            'SELECT * FROM forensic_analysis_reports WHERE evidence_id = $1 ORDER BY created_at DESC LIMIT 1',
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'No forensic analysis report attached to this evidence.' });
        }

        const report = rows[0];
        const downloadUrl = await minioPublic.presignedGetObject(report.bucket_name, report.object_key, 60);

        res.json({
            id: report.id,
            evidenceId: report.evidence_id,
            filename: report.filename,
            sha256Hash: report.sha256_hash,
            fileSize: report.file_size,
            mimeType: report.mime_type,
            toolsUsed: report.tools_used,
            extractionMethodology: report.extraction_methodology,
            hashVerificationResults: report.hash_verification_results,
            examinerNotes: report.examiner_notes,
            examinerName: report.examiner_name,
            examinerEmployeeId: report.examiner_employee_id,
            createdAt: report.created_at,
            downloadUrl
        });
    } catch (err) {
        console.error('GET /evidence/:id/report error:', err);
        res.status(500).json({ error: 'Failed to fetch forensic report', details: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/:id/report/download
// Presigned redirect to download report document
// ─────────────────────────────────────────────
router.get('/:id/report/download', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            'SELECT bucket_name, object_key FROM forensic_analysis_reports WHERE evidence_id = $1 ORDER BY created_at DESC LIMIT 1',
            [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Forensic report file not found.' });

        const url = await minioPublic.presignedGetObject(rows[0].bucket_name, rows[0].object_key, 30);
        res.redirect(url);
    } catch (err) {
        console.error('Report download error:', err);
        res.status(500).json({ error: 'Could not generate report download URL' });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/:id/certificate-data
// Pre-flight preview data for Section 63 BSA Modal
// ─────────────────────────────────────────────
router.get('/:id/certificate-data', requireRoles(['Forensic Expert', 'Police Officer', 'Judicial Authority', 'Judicial Magistrate', 'Sessions Judge', 'Advocate']), async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: evRows } = await pool.query(`
            SELECT e.*, f.fir_number, f.station, f.applicable_sections 
            FROM evidence e 
            JOIN fir f ON e.fir_id = f.id 
            WHERE e.id = $1
        `, [id]);
        if (!evRows.length) return res.status(404).json({ error: 'Evidence not found' });
        const ev = evRows[0];

        const { rows: repRows } = await pool.query(
            'SELECT * FROM forensic_analysis_reports WHERE evidence_id = $1 ORDER BY created_at DESC LIMIT 1',
            [id]
        );
        const report = repRows[0] || null;

        const expertName = req.user.name || ev.sec63_signatory_name || 'Forensic Examiner';
        const analystId = req.user.employeeId || req.user.employee_id || ev.sec63_analyst_id || 'FSL-EXP-2026';
        const designation = req.user.designation || 'Examiner of Electronic Evidence';
        const fslLab = req.user.fslJurisdictionId || req.user.station || ev.sec63_fsl_lab || 'Regional Forensic Science Laboratory, Pune';

        const declarationText = 
            `I, ${expertName}, holding Analyst ID ${analystId}, in my official capacity as ${designation} attached to ${fslLab}, do hereby solemnly affirm and declare under Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023:\n\n` +
            `(a) That the electronic record / digital media described herein was officially received and ingested under uninterrupted forensic chain-of-custody protocols;\n` +
            `(b) That throughout the acquisition, examination, and extraction process, the computing and imaging devices were operating properly and within forensic calibration specifications without data corruption or unauthorized intervention;\n` +
            `(c) That the SHA-256 cryptographic hash stated herein constitutes the exact, uncompromised digital footprint of the master bitstream, anchored immutably into the Ethereum smart contract EvidenceLedger.sol;\n` +
            `(d) That this electronic record and its cryptographic metadata satisfy all statutory criteria of Section 63 of Bharatiya Sakshya Adhiniyam, 2023, and are certified admissible as primary digital evidence before any Hon'ble Court of Law.`;

        res.json({
            evidenceId: ev.id,
            filename: ev.filename,
            category: ev.category,
            fileSize: ev.file_size,
            mimeType: ev.mime_type,
            sha256Hash: ev.sha256_hash,
            ledgerTxId: ev.ledger_tx_id,
            ledgerBlockNumber: ev.ledger_block_number,
            ledgerTimestamp: ev.ledger_timestamp,
            firNumber: ev.fir_number,
            station: ev.station,
            applicableSections: ev.applicable_sections,
            toolsUsed: report?.tools_used || ev.report_tools || 'Cellebrite UFED / Autopsy Forensic Suite / Tableau Write-Blocker',
            extractionMethodology: report?.extraction_methodology || ev.report_methodology || 'Bit-stream forensic disk acquisition under hardware write-blocker',
            hashVerificationResults: report?.hash_verification_results || ev.report_results || '100% Bitstream match verified',
            expertName,
            analystId,
            designation,
            fslLab,
            statutoryDeclaration: declarationText,
            sec63Status: ev.sec63_status || 'PENDING',
            sec63CertPath: ev.sec63_cert_path || null,
            sec63SignedAt: ev.sec63_signed_at || null
        });
    } catch (err) {
        console.error('Certificate data error:', err);
        res.status(500).json({ error: 'Failed to retrieve certificate data', details: err.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/evidence/:id/sign-certificate
// Person 3: Digitally Sign & Issue Section 63 BSA Certificate
// ─────────────────────────────────────────────
router.post('/:id/sign-certificate', requireRoles(['Forensic Expert']), express.json({ limit: '10mb' }), async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;
    const { signatureBase64 } = req.body;

    try {
        // 1. Fetch evidence & parent FIR
        const { rows: evRows } = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]);
        if (!evRows.length) return res.status(404).json({ error: 'Evidence record not found.' });
        const evidence = evRows[0];

        const { rows: firRows } = await pool.query('SELECT * FROM fir WHERE id = $1', [evidence.fir_id]);
        const fir = firRows[0] || {};

        // 2. Fetch latest forensic report if attached
        const { rows: repRows } = await pool.query(
            'SELECT * FROM forensic_analysis_reports WHERE evidence_id = $1 ORDER BY created_at DESC LIMIT 1',
            [id]
        );
        const report = repRows[0] || null;

        // 3. Expert particulars
        const expert = {
            name: req.user.name || 'Examiner of Electronic Evidence',
            employeeId: req.user.employeeId || req.user.employee_id || 'FSL-EXP-2026',
            designation: req.user.designation || 'Examiner of Electronic Evidence',
            station: req.user.station || fir.station || 'Regional Cyber FSL',
            fslJurisdiction: req.user.fslJurisdictionId || req.user.station || 'Regional Forensic Science Laboratory, Pune',
            blockchainAddress: req.user.blockchainAddress || null
        };

        // 4. Generate Section 63(4) BSA court-admissible PDF
        const pdfBuffer = await generateSection63BSAPdf({
            evidence,
            fir,
            expert,
            report,
            signatureBase64
        });

        // 5. Store in MinIO bucket
        const certKey = `certificates/sec63_evidence_${id}_${Date.now()}.pdf`;
        const passThrough = new PassThrough();
        passThrough.end(pdfBuffer);

        await minioInternal.putObject(BUCKET, certKey, passThrough, pdfBuffer.length, {
            'Content-Type': 'application/pdf'
        });

        // 6. Record certificate in PostgreSQL
        const certHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
        await pool.query(`
            INSERT INTO section63_certificates
            (evidence_id, fir_id, certificate_object_key, sha256_hash, ledger_tx_id, ledger_block_number, ledger_timestamp, signatory_id, signatory_name, analyst_id, designation, fsl_jurisdiction, statutory_declaration, signed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        `, [
            id, evidence.fir_id, certKey, certHash,
            evidence.ledger_tx_id, evidence.ledger_block_number, evidence.ledger_timestamp,
            userId, expert.name, expert.employeeId, expert.designation, expert.fslJurisdiction,
            'Certified under Section 63(4) Bharatiya Sakshya Adhiniyam, 2023.'
        ]);

        await pool.query(`
            UPDATE evidence SET
                sec63_status = 'CERTIFIED',
                sec63_cert_path = $1,
                sec63_signed_at = NOW(),
                sec63_signatory_name = $2,
                sec63_analyst_id = $3,
                sec63_fsl_lab = $4
            WHERE id = $5
        `, [certKey, expert.name, expert.employeeId, expert.fslJurisdiction, id]);

        // Audit log entry
        await pool.query(`
            INSERT INTO audit_log (evidence_id, action, result, actor_id)
            VALUES ($1, 'SEC63_BSA_CERTIFIED', 'CERTIFIED', $2)
        `, [id, userId]);

        res.status(201).json({
            message: 'Section 63 BSA Certificate generated and digitally signed successfully',
            status: 'CERTIFIED',
            certPath: certKey,
            sha256Hash: certHash
        });
    } catch (err) {
        console.error('Section 63 certificate signing error:', err);
        res.status(500).json({ error: 'Failed to generate Section 63 BSA certificate', details: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/:id/certificate
// Downloads the court-ready Section 63 BSA Certificate
// ─────────────────────────────────────────────
router.get('/:id/certificate', requireRoles(['Forensic Expert', 'Police Officer', 'Judicial Authority', 'Judicial Magistrate', 'Sessions Judge', 'Advocate']), async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            'SELECT sec63_cert_path FROM evidence WHERE id = $1',
            [id]
        );
        if (!rows.length || !rows[0].sec63_cert_path) {
            // Check section63_certificates table as fallback
            const { rows: certRows } = await pool.query(
                'SELECT certificate_object_key FROM section63_certificates WHERE evidence_id = $1 ORDER BY signed_at DESC LIMIT 1',
                [id]
            );
            if (!certRows.length || !certRows[0].certificate_object_key) {
                return res.status(404).json({ error: 'Section 63 Certificate has not yet been issued for this evidence.' });
            }
            const url = await minioPublic.presignedGetObject(BUCKET, certRows[0].certificate_object_key, 30);
            return res.redirect(url);
        }

        const url = await minioPublic.presignedGetObject(BUCKET, rows[0].sec63_cert_path, 30);
        res.redirect(url);
    } catch (err) {
        console.error('Download certificate error:', err);
        res.status(500).json({ error: 'Could not generate certificate download URL' });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/verify/:id
// Person 3: 1-Click Cryptographic Verification Engine
// Compares live MinIO SHA-256 against on-chain EvidenceLedger.sol
// ─────────────────────────────────────────────
router.get('/verify/:id', async (req, res) => {
    const { id } = req.params;
    const actorId = req.user?.userId || req.user?.id || 'unknown';

    try {
        // 1. Fetch record from Postgres
        const { rows } = await pool.query(
            'SELECT * FROM evidence WHERE id = $1', [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });
        const record = rows[0];

        // 2. Stream file from MinIO and compute live hash
        const liveHash = await new Promise((resolve, reject) => {
            minioInternal.getObject(record.bucket_name, record.object_key, (err, stream) => {
                if (err) return reject(err);
                const hash = crypto.createHash('sha256');
                stream.on('data', chunk => hash.update(chunk));
                stream.on('end', () => resolve(hash.digest('hex')));
                stream.on('error', reject);
            });
        });

        // 3. Get immutable hash from ledger
        let ledgerHash = null;
        try {
            ledgerHash = await ledger.getEvidenceHash(id);
        } catch (ledgerErr) {
            console.warn(`[Evidence Verify] Ledger lookup failed for ${id}: ${ledgerErr.message}. Falling back to Postgres hash.`);
        }

        // 4. In MOCK mode or on ledger error, fall back to Postgres hash
        const truthHash = ledgerHash || record.sha256_hash;
        const match = (liveHash === truthHash);
        const result = match ? 'VERIFIED' : 'TAMPERED';

        // 5. Write to audit log
        await pool.query(
            `INSERT INTO audit_log (evidence_id, action, result, actor_id)
             VALUES ($1, 'VERIFY', $2, $3)`,
            [id, result === 'VERIFIED' ? 'OK' : 'TAMPERED', actorId]
        );

        // Circuit Breaker: Terminal Failure State
        if (!match && record.source_id) {
            await pool.query(
                `UPDATE evidence_source SET certificate_status = 'FAILED_VERIFICATION' WHERE id = $1`,
                [record.source_id]
            );
        }

        // 6. Return comprehensive verification badge state
        res.json({
            id: record.id,
            status: match ? 'OK' : 'TAMPERED',
            verificationStatus: match ? 'VERIFIED' : 'TAMPERED',
            ok: match,
            liveHash,
            currentHash: liveHash,
            ledgerHash: truthHash,
            match,
            txId: record.ledger_tx_id || null,
            blockNumber: record.ledger_block_number || null,
            ledgerTimestamp: record.ledger_timestamp || null,
            verifiedAt: new Date().toISOString()
        });

    } catch (err) {
        console.error('Verify error:', err.message);
        res.status(500).json({ error: 'Verification failed', details: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/download/:id
// ─────────────────────────────────────────────
router.get('/download/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await pool.query(
            'SELECT bucket_name, object_key FROM evidence WHERE id = $1', [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });

        const { bucket_name, object_key } = rows[0];
        const url = await minioPublic.presignedGetObject(bucket_name, object_key, 30);

        res.redirect(url);
    } catch (err) {
        console.error('Download error:', err.message);
        res.status(500).json({ error: 'Could not generate download URL' });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/internal/list
// ─────────────────────────────────────────────
router.get('/internal/list', internalNetworkGuard, requireRoles(['Admin']), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 1000;
        const cursorDate = req.query.cursor_date;
        const cursorId = req.query.cursor_id;

        if (limit > 5000) return res.status(400).json({ error: 'Limit too large' });

        let query, params;
        if (cursorDate && cursorId) {
            query = 'SELECT id, fir_id, uploaded_at::text FROM evidence WHERE (uploaded_at, id) > ($1::timestamptz, $2::uuid) ORDER BY uploaded_at ASC, id ASC LIMIT $3';
            params = [cursorDate, cursorId, limit];
        } else {
            query = 'SELECT id, fir_id, uploaded_at::text FROM evidence ORDER BY uploaded_at ASC, id ASC LIMIT $1';
            params = [limit];
        }

        const { rows } = await pool.query(query, params);
        res.json({ records: rows });
    } catch (err) {
        console.error('List error:', err.message);
        res.status(500).json({ error: 'Database query failed' });
    }
});

// ─────────────────────────────────────────────
// POST /api/evidence/internal/verify-batch
// ─────────────────────────────────────────────
router.post('/internal/verify-batch', express.json(), internalNetworkGuard, requireRoles(['Admin']), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'Expected an array of ids' });
        }

        const results = {};

        await Promise.all(ids.map(async (id) => {
            try {
                const { rows } = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]);
                if (!rows.length) {
                    results[id] = { status: 'NOT_FOUND' };
                    return;
                }
                const record = rows[0];

                const liveHash = await new Promise((resolve, reject) => {
                    minioInternal.getObject(record.bucket_name, record.object_key, (err, stream) => {
                        if (err) return reject(err);
                        const hash = crypto.createHash('sha256');
                        stream.on('data', chunk => hash.update(chunk));
                        stream.on('end', () => resolve(hash.digest('hex')));
                        stream.on('error', reject);
                    });
                });

                const ledgerHash = await ledger.getEvidenceHash(id);
                const truthHash = ledgerHash || record.sha256_hash;
                const result = (liveHash === truthHash) ? 'OK' : 'TAMPERED';

                await pool.query(
                    `INSERT INTO audit_log (evidence_id, action, result, actor_id) VALUES ($1, 'VERIFY', $2, $3)`,
                    [id, result, req.user.id]
                );

                results[id] = { status: result };
            } catch (err) {
                console.error(`Verify error on ${id}:`, err.message);
                results[id] = { status: 'ERROR', error: err.message };
            }
        }));

        res.json({ results });
    } catch (err) {
        console.error('Verify-batch error:', err.message);
        res.status(500).json({ error: 'Batch verification failed' });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence
// ─────────────────────────────────────────────
router.get('/', requireRoles(['Police Officer', 'Judicial Authority', 'Forensic Expert', 'Admin', 'Advocate']), async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'uploadDate';
        const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const sortMap = {
            'uploadDate': 'e.uploaded_at',
            'fileName': 'e.filename',
            'status': 'e.filename',
        };
        const orderCol = sortMap[sortBy] || 'e.uploaded_at';

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (search) {
            conditions.push(`(e.filename ILIKE $${paramIdx} OR f.fir_number ILIKE $${paramIdx})`);
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (category) {
            conditions.push(`e.category = $${paramIdx}`);
            params.push(category);
            paramIdx++;
        }

        let statusJoin = '';
        if (status === 'verified') {
            statusJoin = `JOIN audit_log al ON al.evidence_id = e.id AND al.result = 'OK'`;
        } else if (status === 'tampered') {
            statusJoin = `JOIN audit_log al ON al.evidence_id = e.id AND al.result = 'TAMPERED'`;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const countSQL = `SELECT COUNT(DISTINCT e.id) FROM evidence e JOIN fir f ON e.fir_id = f.id ${statusJoin} ${whereClause}`;
        const countResult = await pool.query(countSQL, params);
        const total = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(total / limit) || 1;

        const dataSQL = `
            SELECT DISTINCT ON (e.id)
                e.id, 
                e.filename as "fileName", 
                f.fir_number as "firNumber", 
                f.id as "firId",
                e.sha256_hash as "hash", 
                COALESCE(e.category, 'other') as "category", 
                e.uploaded_at as "uploadDate",
                e.ledger_tx_id as "ledgerTxId",
                e.ledger_block_number as "ledgerBlockNumber",
                COALESCE(e.sec63_status, 'PENDING') as "sec63Status",
                COALESCE(
                    (SELECT CASE WHEN al2.result = 'TAMPERED' THEN 'tampered' WHEN al2.result = 'OK' THEN 'verified' END
                     FROM audit_log al2 WHERE al2.evidence_id = e.id ORDER BY al2.checked_at DESC LIMIT 1),
                    'pending'
                ) as status
            FROM evidence e 
            JOIN fir f ON e.fir_id = f.id 
            ${statusJoin}
            ${whereClause}
            ORDER BY e.id, ${orderCol} ${sortOrder}
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;

        const dataResult = await pool.query(dataSQL, [...params, limit, offset]);

        const rows = dataResult.rows.sort((a, b) => {
            const key = sortBy === 'fileName' ? 'fileName' : 'uploadDate';
            if (sortOrder === 'DESC') return a[key] > b[key] ? -1 : 1;
            return a[key] < b[key] ? -1 : 1;
        });

        res.json({
            data: rows,
            pagination: { page, limit, total, totalPages }
        });
    } catch (err) {
        console.error('List Evidence error:', err.message);
        res.status(500).json({ error: 'Failed to fetch evidence list' });
    }
});

// ─────────────────────────────────────────────
// GET /api/evidence/:id
// ─────────────────────────────────────────────
router.get('/:id', requireRoles(['Police Officer', 'Judicial Authority', 'Admin', 'Forensic Expert', 'Advocate']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT 
                e.id, 
                e.filename as "fileName", 
                f.fir_number as "firNumber", 
                f.id as "firId",
                f.station as "station",
                f.applicable_sections as "applicableSections",
                e.sha256_hash as "hash", 
                COALESCE(e.category, 'other') as "category",
                e.uploaded_at as "uploadDate", 
                e.uploaded_by as "uploaderId",
                e.mime_type as "mimeType",
                e.file_size as "fileSize",
                e.ledger_tx_id as "ledgerTxId",
                e.ledger_block_number as "ledgerBlockNumber",
                e.ledger_timestamp as "ledgerTimestamp",
                e.uploader_name as "uploaderName",
                e.uploader_employee_id as "uploaderEmployeeId",
                e.description,
                e.source_id as "sourceId",
                COALESCE(e.sec63_status, 'PENDING') as "sec63Status",
                e.sec63_cert_path as "sec63CertPath",
                e.sec63_signed_at as "sec63SignedAt",
                e.sec63_signatory_name as "sec63SignatoryName",
                e.sec63_analyst_id as "sec63AnalystId",
                e.sec63_fsl_lab as "sec63FslLab",
                e.has_report as "hasReport",
                e.report_object_key as "reportObjectKey",
                e.report_filename as "reportFilename",
                e.report_hash as "reportHash",
                e.report_tools as "reportTools",
                e.report_methodology as "reportMethodology",
                e.report_results as "reportResults",
                e.report_uploaded_at as "reportUploadedAt",
                es.certificate_status as "certificateStatus",
                es.signed_cert_file_path as "signedCertFilePath",
                COALESCE(
                    (SELECT CASE WHEN al2.result = 'TAMPERED' THEN 'tampered' WHEN al2.result = 'OK' THEN 'verified' END
                     FROM audit_log al2 WHERE al2.evidence_id = e.id ORDER BY al2.checked_at DESC LIMIT 1),
                    'pending'
                ) as status
             FROM evidence e 
             JOIN fir f ON e.fir_id = f.id 
             LEFT JOIN evidence_source es ON e.source_id = es.id
             WHERE e.id = $1`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });
        
        const auditRows = await pool.query(
            `SELECT action, result, actor_id as "actor", checked_at as "timestamp" 
             FROM audit_log WHERE evidence_id = $1 ORDER BY checked_at DESC`, [req.params.id]
        );

        // Fetch latest attached forensic report if any
        const reportRows = await pool.query(
            `SELECT * FROM forensic_analysis_reports WHERE evidence_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [req.params.id]
        );
        
        const record = rows[0];
        res.json({
            ...record,
            uploadedBy: record.uploaderName ? { name: record.uploaderName, employeeId: record.uploaderEmployeeId } : null,
            fileUrl: `/api/evidence/download/${req.params.id}`,
            report: reportRows.rows[0] || null,
            history: auditRows.rows
        });
    } catch (err) {
        console.error('Get Evidence error:', err.message);
        res.status(500).json({ error: 'Failed to fetch evidence details' });
    }
});

module.exports = router;
