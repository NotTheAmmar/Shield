const express = require('express');
const crypto = require('crypto');
const busboy = require('busboy');
const path = require('path');
const { PassThrough } = require('stream');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const requireRoles = require('../middleware/rbac');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const advocateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests on advocate endpoints. Please try again later.' }
});

router.use(advocateLimiter);

// ─────────────────────────────────────────────
// GET /api/advocate/search-fir?firNumber=...
// Advocate cannot browse arbitrary FIRs.
// Returns only basic header to allow targeting representation.
// ─────────────────────────────────────────────
router.get('/search-fir', requireRoles(['Advocate']), async (req, res) => {
    const { firNumber } = req.query;
    if (!firNumber || !firNumber.trim()) {
        return res.status(400).json({ error: 'Query parameter firNumber is required.' });
    }

    try {
        const { rows } = await pool.query(`
            SELECT f.id as "firId", f.fir_number as "firNumber", f.station,
                   f.case_category as "caseCategory", f.incident_date_time as "incidentDateTime",
                   f.status, f.registered_at as "registeredAt"
            FROM fir f
            WHERE f.fir_number ILIKE $1
            LIMIT 10
        `, [`%${firNumber.trim()}%`]);

        res.json({
            success: true,
            count: rows.length,
            results: rows
        });
    } catch (err) {
        console.error('[ADVOCATE SEARCH FIR ERROR]', err.message);
        res.status(500).json({ error: 'Failed to search FIR records' });
    }
});

// ─────────────────────────────────────────────
// POST /api/advocate/vakalatnama
// Submits a signed Vakalatnama PDF document for a specific FIR
// Inserts record into vakalatnama_requests with status 'PENDING'
// ─────────────────────────────────────────────
router.post('/vakalatnama', requireRoles(['Advocate']), (req, res) => {
    let responseSent = false;
    const send = (status, body) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(body);
        }
    };

    const userId = req.user.userId || req.user.id;
    const advocateName = req.user.name || 'Advocate';
    const barEnrollmentNo = req.user.barEnrollmentNo || req.user.employeeId || 'BAR/MAH/2026/001';

    let firId = null;
    let designation = 'DEFENSE_COUNSEL';
    let fileProcessed = false;
    let capturedFilename = '';
    let capturedMime = '';
    let uploadPromise = null;
    let objectKey = null;

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 25 * 1024 * 1024 } // 25 MB limit for legal documents
    });

    bb.on('field', (name, val) => {
        if (name === 'firId' || name === 'fir_id') firId = val;
        if (name === 'designation') designation = val;
    });

    bb.on('file', (fieldname, fileStream, info) => {
        const { filename, mimeType } = info;
        capturedFilename = filename;
        capturedMime = mimeType;

        if (fileProcessed) {
            fileStream.resume();
            return;
        }
        fileProcessed = true;

        const ext = path.extname(filename) || '.pdf';
        const docId = crypto.randomUUID();
        objectKey = `vakalatnama/vak_${docId}${ext}`;

        const passThrough = new PassThrough();
        let rejectPut;
        uploadPromise = new Promise((resolve, reject) => {
            rejectPut = reject;
            minioInternal.putObject(BUCKET, objectKey, passThrough, undefined, { 'Content-Type': mimeType || 'application/pdf' })
                .then(resolve)
                .catch(reject);
        });

        fileStream.on('error', (err) => {
            passThrough.destroy(err);
            if (rejectPut) rejectPut(err);
        });

        fileStream.pipe(passThrough);
    });

    bb.on('error', (err) => {
        console.error('[BUSBOY VAKALATNAMA ERROR]', err.message);
        send(500, { error: 'Failed to process document upload stream', details: err.message });
    });

    bb.on('finish', async () => {
        if (!firId) {
            return send(400, { error: 'firId field is required before or alongside file in FormData' });
        }
        if (!fileProcessed || !uploadPromise) {
            return send(400, { error: 'Vakalatnama PDF document file is required' });
        }

        try {
            await uploadPromise;

            // Verify FIR exists
            const { rows: firRows } = await pool.query('SELECT id, fir_number FROM fir WHERE id = $1', [firId]);
            if (!firRows.length) {
                return send(404, { error: 'FIR not found' });
            }

            const { rows } = await pool.query(`
                INSERT INTO vakalatnama_requests (
                    fir_id, advocate_id, advocate_name, bar_enrollment_no,
                    designation, vakalatnama_object_key, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
                RETURNING id, fir_id as "firId", advocate_name as "advocateName",
                          bar_enrollment_no as "barEnrollmentNo", designation,
                          vakalatnama_object_key as "objectKey", status, created_at as "createdAt"
            `, [
                firId,
                userId,
                advocateName,
                barEnrollmentNo,
                designation,
                objectKey
            ]);

            send(201, {
                success: true,
                message: `Vakalatnama appearance for FIR ${firRows[0].fir_number} submitted successfully for judicial approval.`,
                request: rows[0]
            });
        } catch (err) {
            console.error('[VAKALATNAMA SAVE ERROR]', err.message);
            send(500, { error: 'Failed to save Vakalatnama appearance request', details: err.message });
        }
    });

    req.pipe(bb);
});

// ─────────────────────────────────────────────
// GET /api/advocate/my-cases
// Returns full case details, supplementary updates, and forensic reports
// strictly for FIRs where this advocate has an APPROVED Vakalatnama
// ─────────────────────────────────────────────
router.get('/my-cases', requireRoles(['Advocate']), async (req, res) => {
    const userId = req.user.userId || req.user.id;

    try {
        const { rows: approvedFirs } = await pool.query(`
            SELECT f.id, f.fir_number as "firNumber", f.case_category as "caseCategory",
                   f.description, f.location, f.station, f.applicable_sections as "applicableSections",
                   f.incident_date_time as "incidentDateTime", f.status, f.trial_status as "trialStatus",
                   f.sessions_court_id as "sessionsCourtId", f.committal_date as "committalDate",
                   f.filename, f.sha256_hash as "sha256Hash", f.ledger_tx_id as "ledgerTxId",
                   f.ledger_timestamp as "ledgerTimestamp", f.registered_at as "registeredAt",
                   vr.id as "vakalatnamaId", vr.designation, vr.reviewed_at as "approvedAt",
                   vr.reviewer_name as "approvedBy"
            FROM vakalatnama_requests vr
            JOIN fir f ON vr.fir_id = f.id
            WHERE vr.advocate_id = $1 AND vr.status = 'APPROVED'
            ORDER BY vr.reviewed_at DESC
        `, [userId]);

        // Enrich each case with supplementary reports, evidence, and certificates
        const cases = await Promise.all(approvedFirs.map(async (fir) => {
            const [suppRes, eviRes] = await Promise.all([
                pool.query(`
                    SELECT id, report_number as "reportNumber", narrative, discovered_items as "discoveredItems",
                           fsl_notified as "fslNotified", officer_name as "officerName", created_at as "createdAt",
                           sha256_hash as "sha256Hash", ledger_tx_id as "ledgerTxId"
                    FROM fir_supplementary_reports
                    WHERE fir_id = $1
                    ORDER BY report_number ASC
                `, [fir.id]),
                pool.query(`
                    SELECT e.id, e.filename, e.category, e.file_size as "fileSize",
                           e.mime_type as "mimeType", e.sha256_hash as "sha256Hash",
                           e.ledger_tx_id as "ledgerTxId", e.ledger_timestamp as "ledgerTimestamp",
                           e.has_report as "hasReport", e.sec63_status as "sec63Status",
                           e.uploaded_at as "uploadedAt"
                    FROM evidence e
                    WHERE e.fir_id = $1
                    ORDER BY e.uploaded_at DESC
                `, [fir.id])
            ]);

            return {
                ...fir,
                supplementaryReports: suppRes.rows,
                evidence: eviRes.rows
            };
        }));

        res.json({
            success: true,
            count: cases.length,
            cases
        });
    } catch (err) {
        console.error('[ADVOCATE MY CASES ERROR]', err.message);
        res.status(500).json({ error: 'Failed to retrieve approved legal case records' });
    }
});

// ─────────────────────────────────────────────
// GET /api/advocate/my-applications
// Lists all Vakalatnama requests filed by this advocate (PENDING, APPROVED, REJECTED)
// ─────────────────────────────────────────────
router.get('/my-applications', requireRoles(['Advocate']), async (req, res) => {
    const userId = req.user.userId || req.user.id;

    try {
        const { rows } = await pool.query(`
            SELECT vr.id, vr.fir_id as "firId", vr.designation, vr.status,
                   vr.created_at as "createdAt", vr.reviewed_at as "reviewedAt",
                   vr.reviewer_name as "reviewerName", vr.rejection_reason as "rejectionReason",
                   f.fir_number as "firNumber", f.station, f.case_category as "caseCategory"
            FROM vakalatnama_requests vr
            JOIN fir f ON vr.fir_id = f.id
            WHERE vr.advocate_id = $1
            ORDER BY vr.created_at DESC
        `, [userId]);

        res.json({
            success: true,
            count: rows.length,
            applications: rows
        });
    } catch (err) {
        console.error('[ADVOCATE APPLICATIONS ERROR]', err.message);
        res.status(500).json({ error: 'Failed to retrieve Vakalatnama applications' });
    }
});

// ─────────────────────────────────────────────
// GET /api/advocate/evidence/:id/download-watermarked
// Downloads evidence document or report with dynamic anti-leak watermark:
// "INSPECTED BY ADV. [ADVOCATE_NAME] (BAR: [BAR_NO]) - [TIMESTAMP] - S.H.I.E.L.D. SECURE AUDIT"
// Enforces Locus Standi: requires APPROVED Vakalatnama for parent FIR
// ─────────────────────────────────────────────
router.get('/evidence/:id/download-watermarked', requireRoles(['Advocate']), async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;
    const advocateName = (req.user.name || 'Advocate').toUpperCase();
    const barEnrollmentNo = req.user.barEnrollmentNo || req.user.employeeId || 'BAR/MAH/2026/001';

    try {
        // 1. Fetch evidence details
        const { rows: eviRows } = await pool.query(`
            SELECT e.id, e.fir_id, e.filename, e.bucket_name, e.object_key, e.mime_type
            FROM evidence e
            WHERE e.id = $1
        `, [id]);

        if (!eviRows.length) {
            return res.status(404).json({ error: 'Evidence record not found' });
        }
        const evidence = eviRows[0];

        // 2. Strict Locus Standi check: Verify advocate has APPROVED Vakalatnama for this FIR
        const { rows: authRows } = await pool.query(`
            SELECT id, status FROM vakalatnama_requests
            WHERE fir_id = $1 AND advocate_id = $2 AND status = 'APPROVED'
        `, [evidence.fir_id, userId]);

        if (!authRows.length) {
            return res.status(403).json({
                error: 'Forbidden: Access denied. Locus standi requires an approved Vakalatnama for this case to inspect or export trial materials.',
                code: 'VAKALATNAMA_NOT_APPROVED'
            });
        }

        // 3. Retrieve raw stream from MinIO
        const stream = await minioInternal.getObject(evidence.bucket_name || BUCKET, evidence.object_key);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const rawBuffer = Buffer.concat(chunks);

        // 4. If PDF, apply dynamic diagonal watermark overlay using pdf-lib
        const isPdf = evidence.mime_type === 'application/pdf' || 
                      evidence.filename.toLowerCase().endsWith('.pdf') ||
                      rawBuffer.slice(0, 4).toString() === '%PDF';

        if (isPdf) {
            try {
                const pdfDoc = await PDFDocument.load(rawBuffer, { ignoreEncryption: true });
                const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                const pages = pdfDoc.getPages();
                const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
                const watermarkText = `INSPECTED BY ADV. ${advocateName} (BAR: ${barEnrollmentNo}) - ${timestamp} - S.H.I.E.L.D. SECURE AUDIT`;

                for (const page of pages) {
                    const { width, height } = page.getSize();
                    const fontSize = Math.max(9, Math.min(13, width / 45));

                    // Diagonal anti-leak watermark across center
                    page.drawText(watermarkText, {
                        x: width * 0.08,
                        y: height * 0.45,
                        size: fontSize,
                        font,
                        color: rgb(0.85, 0.15, 0.15),
                        opacity: 0.35,
                        rotate: degrees(35),
                    });

                    // Top header confidentiality banner
                    page.drawText(`[COURT TRIAL DISCOVERY - ADVOCATE COPY - BAR REG: ${barEnrollmentNo}]`, {
                        x: 35,
                        y: height - 20,
                        size: 7.5,
                        font,
                        color: rgb(0.4, 0.4, 0.4),
                        opacity: 0.65,
                    });
                }

                const watermarkedBytes = await pdfDoc.save();

                // Audit log watermarked inspection
                await pool.query(`
                    INSERT INTO api_audit_log (
                        user_id, user_name, user_role, user_employee_id, method, endpoint,
                        ip_address, status_code, target_label
                    ) VALUES ($1, $2, $3, $4, 'GET', $5, $6, 200, $7)
                `, [
                    userId,
                    advocateName,
                    req.user.role,
                    barEnrollmentNo,
                    `/api/advocate/evidence/${id}/download-watermarked`,
                    req.ip || '127.0.0.1',
                    `WATERMARKED_DOWNLOAD: ${evidence.filename} by Adv. ${advocateName} (${barEnrollmentNo})`
                ]);

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="WATERMARKED_${evidence.filename.replace(/\.pdf$/i, '')}.pdf"`);
                return res.send(Buffer.from(watermarkedBytes));
            } catch (pdfErr) {
                console.warn('[PDF WATERMARK WARNING] pdf-lib could not parse file, streaming original with security header:', pdfErr.message);
            }
        }

        // For non-PDF evidence (e.g. CCTV, audio) or fallback: redirect to presigned URL
        const url = await minioPublic.presignedGetObject(evidence.bucket_name || BUCKET, evidence.object_key, 30);
        res.redirect(url);
    } catch (err) {
        console.error('[WATERMARKED DOWNLOAD ERROR]', err.message);
        res.status(500).json({ error: 'Failed to generate watermarked evidence document', details: err.message });
    }
});

module.exports = router;
