const express = require('express');
const crypto = require('crypto');
const busboy = require('busboy');
const path = require('path');
const { PassThrough } = require('stream');
const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const requireRoles = require('../middleware/rbac');
const ledger = require('../services/ledger');

const router = express.Router();

// ─────────────────────────────────────────────
// POST /api/fir/create
// ─────────────────────────────────────────────
// Accepts multipart/form-data with fields:
//   firNumber (required), incidentType, dateTime, location, description, file
router.post('/create', requireRoles(['Police Officer']), (req, res) => {
    const reportingOfficer = req.user.userId || req.user.id || 'unknown';
    const firId = crypto.randomUUID();

    const fields = {};
    let responseSent = false;
    let capturedFilename, capturedMime;
    let fileSize = 0;
    let fileProcessed = false;

    const send = (status, body) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(body);
        }
    };

    const bb = busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024 } });

    bb.on('field', (name, val) => {
        fields[name] = val;
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

        const ext = path.extname(filename) || '';
        const objectKey = `fir-${firId}${ext}`;

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
            try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) {}
            send(413, { error: 'File too large. Maximum allowed size is 500MB.' });
        });

        fileStream.pipe(hashStream);
        fileStream.pipe(passThrough);
        fileStream.on('data', (chunk) => { fileSize += chunk.length; });

        Promise.all([putPromise, hashPromise])
            .then(async ([, hash]) => {
                const { firNumber, incidentType, dateTime, location, description } = fields;
                const caseCategory = fields.case_category || incidentType || '';
                const desc = description || '';
                const loc = location || '';

                if (!firNumber) {
                    try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) {}
                    return send(400, { error: 'Missing required field: firNumber' });
                }

                try {
                    // Attempt blockchain anchoring (non-blocking — don't fail the FIR if blockchain is down)
                    let ledgerTxId = null;
                    let ledgerTimestamp = null;
                    try {
                        let privateKey = null;
                        const userRes = await pool.query('SELECT encrypted_private_key FROM users WHERE id = $1', [reportingOfficer]);
                        const encryptedPrivateKey = userRes.rows[0]?.encrypted_private_key;
                        if (encryptedPrivateKey) {
                            const { decryptPrivateKey } = require('../crypto');
                            privateKey = decryptPrivateKey(encryptedPrivateKey);
                        }
                        const ledgerResult = await ledger.storeFIRHash(firId, hash, privateKey);
                        ledgerTxId = ledgerResult?.txId || null;
                        ledgerTimestamp = ledgerTxId ? new Date().toISOString() : null;
                    } catch (ledgerErr) {
                        console.warn(`[FIR] Blockchain anchoring failed for ${firId}: ${ledgerErr.message}. FIR will be saved without ledger proof.`);
                    }

                    await pool.query(
                        `INSERT INTO fir (id, case_category, description, location, reporting_officer, fir_number, filename, bucket_name, object_key, sha256_hash, mime_type, file_size, ledger_tx_id, ledger_timestamp)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                        [firId, caseCategory, desc, loc, reportingOfficer, firNumber, capturedFilename, BUCKET, objectKey, hash, capturedMime, fileSize, ledgerTxId, ledgerTimestamp]
                    );

                    send(201, {
                        status: 'success',
                        fir_id: firId,
                        firNumber: firNumber,
                        message: 'FIR registered successfully'
                    });
                } catch (err) {
                    try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) {}
                    console.error('Error creating FIR:', err.message);
                    send(500, { error: 'Failed to create FIR', details: err.message, stack: err.stack });
                }
            })
            .catch((err) => {
                console.error('FIR stream pipeline failed:', err.message);
                send(500, { error: 'File stream failed.' });
            });
    });

    bb.on('error', (err) => {
        console.error('Busboy parsing error:', err.message);
        send(500, { error: 'Failed to parse upload' });
    });

    bb.on('close', () => {
        if (!fileProcessed && !responseSent) {
            send(400, { error: 'No file found in the request.' });
        }
    });

    req.pipe(bb);
});

// ─────────────────────────────────────────────
// GET /api/fir/verify/:id
// ─────────────────────────────────────────────
router.get('/verify/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await pool.query('SELECT * FROM fir WHERE id = $1', [id]);
        if (!rows.length) return res.status(404).json({ error: 'FIR not found' });
        const record = rows[0];

        const liveHash = await new Promise((resolve, reject) => {
            minioInternal.getObject(record.bucket_name, record.object_key, (err, stream) => {
                if (err) return reject(err);
                const hashStream = crypto.createHash('sha256');
                stream.on('data', chunk => hashStream.update(chunk));
                stream.on('end', () => resolve(hashStream.digest('hex')));
                stream.on('error', reject);
            });
        });

        const ledgerHash = await ledger.getFIRHash(id);
        const truthHash = ledgerHash || record.sha256_hash;
        const match = (liveHash === truthHash);
        const status = match ? 'verified' : 'tampered';

        res.json({
            id: record.id,
            status,
            currentHash: liveHash,
            ledgerHash: truthHash,
            match,
            verifiedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('FIR Verify error:', err.message);
        res.status(500).json({ error: 'FIR Verification failed', details: err.message });
    }
});
// ─────────────────────────────────────────────
// GET /api/fir/:id/download
// ─────────────────────────────────────────────
router.get('/:id/download', async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await pool.query(
            'SELECT bucket_name, object_key FROM fir WHERE id = $1', [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'FIR not found' });
        
        const { bucket_name, object_key } = rows[0];
        if (!bucket_name || !object_key) return res.status(404).json({ error: 'FIR file not stored' });

        const url = await minioPublic.presignedGetObject(bucket_name, object_key, 30);
        res.redirect(url);
    } catch (err) {
        console.error('FIR Download error:', err.message);
        res.status(500).json({ error: 'Could not generate download URL' });
    }
});

// ─────────────────────────────────────────────
// GET /api/fir/list
// ─────────────────────────────────────────────
router.get('/list', requireRoles(['Police Officer', 'Judicial Authority']), async (req, res) => {
    try {
        const { search } = req.query;
        const conditions = [];
        const values = [];
        let idx = 1;

        if (search) {
            conditions.push(`(f.fir_number ILIKE $${idx} OR f.case_category ILIKE $${idx} OR f.description ILIKE $${idx} OR f.location ILIKE $${idx})`);
            values.push(`%${search}%`);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT f.id, f.fir_number as "firNumber", f.case_category as "incidentType", 
                    f.description, f.location, f.status, f.registered_at as "uploadDate",
                    (SELECT COUNT(*) FROM evidence WHERE fir_id = f.id)::int as "evidenceCount"
             FROM fir f ${where} ORDER BY f.registered_at DESC`,
            values
        );
        res.json({
            data: rows,
            pagination: { page: 1, limit: 1000, total: rows.length, totalPages: 1 }
        });
    } catch (err) {
        console.error('Error fetching FIRs:', err.message);
        res.status(500).json({ error: 'Failed to fetch FIRs' });
    }
});

// ─────────────────────────────────────────────
// GET /api/fir/:id
// ─────────────────────────────────────────────
router.get('/:id', requireRoles(['Police Officer', 'Judicial Authority']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, fir_number as "firNumber", case_category as "incidentType", 
                    description, location, status, registered_at as "uploadDate", 
                    reporting_officer as "reportingOfficer" 
             FROM fir WHERE id = $1`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'FIR not found' });
        
        const evidenceRows = await pool.query(
            `SELECT id, filename as "fileName", sha256_hash as "hash", 
                    uploaded_at as "uploadDate", COALESCE(category, 'other') as "category",
                    COALESCE(
                        (SELECT CASE WHEN al.result = 'TAMPERED' THEN 'tampered' WHEN al.result = 'OK' THEN 'verified' END
                         FROM audit_log al WHERE al.evidence_id = evidence.id ORDER BY al.checked_at DESC LIMIT 1),
                        'pending'
                    ) as status
             FROM evidence WHERE fir_id = $1 ORDER BY uploaded_at DESC`, [req.params.id]
        );
        
        res.json({
            ...rows[0],
            linkedEvidence: evidenceRows.rows
        });
    } catch (err) {
        console.error('Get FIR error:', err.message);
        res.status(500).json({ error: 'Failed to fetch FIR details' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/fir/:id/close
// ─────────────────────────────────────────────
router.patch('/:id/close', requireRoles(['Police Officer']), async (req, res) => {
    try {
        // 1. Check FIR exists and is not already CLOSED
        const { rows: firRows } = await pool.query(
            'SELECT id, status, fir_number FROM fir WHERE id = $1', [req.params.id]
        );
        if (!firRows.length) return res.status(404).json({ error: 'FIR not found' });
        if (firRows[0].status === 'CLOSED') return res.status(400).json({ error: 'FIR is already closed' });

        // 2. Check all linked evidence is verified
        const { rows: evidenceRows } = await pool.query(
            'SELECT id FROM evidence WHERE fir_id = $1', [req.params.id]
        );

        if (evidenceRows.length === 0) {
            return res.status(400).json({ error: 'Cannot close FIR with no linked evidence.' });
        }

        // Check for tampered evidence (latest audit result is TAMPERED)
        const { rows: tampered } = await pool.query(
            `SELECT e.id, e.filename FROM evidence e
             WHERE e.fir_id = $1
             AND EXISTS (
                 SELECT 1 FROM audit_log al 
                 WHERE al.evidence_id = e.id AND al.action = 'VERIFY' AND al.result = 'TAMPERED'
                 AND al.checked_at = (SELECT MAX(al2.checked_at) FROM audit_log al2 WHERE al2.evidence_id = e.id AND al2.action = 'VERIFY')
             )`, [req.params.id]
        );

        if (tampered.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot close FIR: Some evidence has been tampered with.',
                tamperedFiles: tampered.map(t => t.filename)
            });
        }

        // Check each evidence has a VERIFY audit_log entry with result = 'OK'
        const { rows: unverified } = await pool.query(
            `SELECT e.id, e.filename FROM evidence e
             WHERE e.fir_id = $1
             AND NOT EXISTS (
                 SELECT 1 FROM audit_log al 
                 WHERE al.evidence_id = e.id AND al.action = 'VERIFY' AND al.result = 'OK'
             )`, [req.params.id]
        );

        if (unverified.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot close FIR: All evidence must be verified first.',
                unverifiedFiles: unverified.map(u => u.filename)
            });
        }

        // 3. Close the FIR
        await pool.query(
            'UPDATE fir SET status = $1 WHERE id = $2',
            ['CLOSED', req.params.id]
        );

        res.json({ 
            message: 'FIR closed successfully',
            firNumber: firRows[0].fir_number,
            status: 'CLOSED'
        });
    } catch (err) {
        console.error('Close FIR error:', err.message);
        res.status(500).json({ error: 'Failed to close FIR' });
    }
});

module.exports = router;
