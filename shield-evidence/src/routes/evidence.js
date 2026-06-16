const express = require('express');
const busboy = require('busboy');
const crypto = require('crypto');
const path = require('path');
const { PassThrough } = require('stream');

const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const ledger = require('../services/ledger');
const requireRoles = require('../middleware/rbac');
const { extractMetadata } = require('../services/metadata');

const router = express.Router();


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
// ─────────────────────────────────────────────
// POST /api/evidence/upload
// ─────────────────────────────────────────────
router.post('/upload', requireRoles(['Police Officer']), (req, res) => {

    // ── Idempotent response lock (Flaw #25) ───────────────────────────
    let responseSent = false;
    const send = (status, body) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(body);
        }
    };

    // ── Get User ID from mockAuth middleware ──────────────────────────
    const userId = req.user.id;

    // ── Pre-generate UUID before any I/O (Flaw #12) ──────────────────
    const evidenceId = crypto.randomUUID();

    // ── Mutable state captured during busboy events ───────────────────
    let fir_id, capturedFilename, capturedMime;
    let capturedCategory = 'other', capturedDescription = '';
    let fileSize = 0;
    let fileProcessed = false;   // Flaw #22 — multi-file guard

    // ── Busboy init with file size limit (Flaw #18) ───────────────────
    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 500 * 1024 * 1024 },  // 500 MB hard cap
    });

    // ── Capture text fields first (Flaw #16) ──────────────────────────
    bb.on('field', (name, val) => {
        if (name === 'fir_id') fir_id = val;
        if (name === 'category') capturedCategory = val;
        if (name === 'description') capturedDescription = val;
    });

    // ── Handle file stream ────────────────────────────────────────────
    bb.on('file', (fieldname, fileStream, info) => {
        const { filename, mimeType } = info;
        capturedFilename = filename;
        capturedMime = mimeType;

        // Guard: only the first file is processed (Flaw #22)
        if (fileProcessed) {
            fileStream.resume();   // drain silently
            return;
        }
        fileProcessed = true;

        // Guard: fir_id must arrive before the file (Flaw #16, #21)
        if (!fir_id) {
            fileStream.resume();   // drain to avoid socket hang (Flaw #21)
            return send(400, { error: 'fir_id field must come before the file in FormData' });
        }

        // Build object key: UUID + original extension (Flaw #19)
        const ext = path.extname(filename) || '';
        const objectKey = `${evidenceId}${ext}`;

        // Build streaming pipeline
        const hashStream = crypto.createHash('sha256');
        const passThrough = new PassThrough();

        // MinIO upload promise (Flaw #17 — streams aren't Promises)
        let rejectPut;
        const putPromise = new Promise((resolve, reject) => {
            rejectPut = reject;
            minioInternal
                .putObject(BUCKET, objectKey, passThrough, null, { 'Content-Type': mimeType })
                .then(resolve)
                .catch(reject);
        });

        // Hash finalization promise (Flaw #17 — manual wrap)
        const hashPromise = new Promise((resolve, reject) => {
            hashStream.on('finish', () => resolve(hashStream.digest('hex')));
            hashStream.on('error', reject);
        });

        // Error handlers MUST reject() — not just log (Flaw #23)
        passThrough.on('error', rejectPut);
        fileStream.on('error', rejectPut);

        // Disk bomb: hit size limit → abort, clean up, 413 (Flaw #18)
        fileStream.on('limit', async () => {
            fileStream.destroy();   // triggers 'error' → rejectPut fires
            try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) { }
            send(413, { error: 'File too large. Maximum allowed size is 500MB.' });
        });

        // Pipe data through both hash and MinIO
        fileStream.pipe(hashStream);
        fileStream.pipe(passThrough);
        fileStream.on('data', (chunk) => { fileSize += chunk.length; });

        // Await BOTH MinIO confirmation AND hash digest (Flaw #13)
        Promise.all([putPromise, hashPromise])
            .then(async ([, hash]) => {
                // ── Postgres transaction (Flaw #4, #10, #20) ────────────
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    // Lock hash into blockchain via shield-ledger (Flaw #1)
                    // Best-effort: try to use the user's personal key for signing.
                    // Falls back to institutional signer if key is unavailable or
                    // encrypted with a different algorithm (CBC vs GCM mismatch).
                    let privateKey = null;
                    try {
                        const userRes = await client.query('SELECT encrypted_private_key FROM users WHERE id = $1', [userId]);
                        const encryptedPrivateKey = userRes.rows[0]?.encrypted_private_key;
                        if (encryptedPrivateKey) {
                            const { decryptPrivateKey } = require('../crypto');
                            privateKey = decryptPrivateKey(encryptedPrivateKey);
                        }
                    } catch (keyErr) {
                        console.warn(`[Upload] Could not decrypt user private key (using institutional signer): ${keyErr.message}`);
                    }
                    const ledgerResult = await ledger.storeHash(evidenceId, hash, privateKey);
                    const ledgerTxId = ledgerResult?.txId || null;
                    const ledgerTimestamp = ledgerTxId ? new Date().toISOString() : null;

                    await client.query(
                        `INSERT INTO evidence
               (id, fir_id, filename, bucket_name, object_key, sha256_hash, uploaded_by, category, mime_type, file_size, ledger_tx_id, ledger_timestamp, uploader_name, uploader_employee_id, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                        [evidenceId, fir_id, capturedFilename, BUCKET, objectKey, hash, userId, capturedCategory, capturedMime, fileSize, ledgerTxId, ledgerTimestamp, req.user.name || null, req.user.employee_id || req.user.employeeId || null, capturedDescription]
                    );

                    await client.query('COMMIT');

                    // Run metadata extraction asynchronously (non-blocking)
                    extractMetadata(evidenceId, objectKey, BUCKET)
                        .catch(err => console.warn('⚠️ Could not extract metadata:', err.message));

                    send(201, { id: evidenceId, sha256_hash: hash, ledgerTxId });
                } catch (err) {
                    await client.query('ROLLBACK');
                    try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) { }
                    console.error('Upload transaction failed:', err.message);
                    send(500, { error: 'Upload failed. Transaction rolled back.' });
                } finally {
                    client.release();  // NON-NEGOTIABLE (Flaw #20)
                }
            })
            .catch((err) => {
                console.error('Stream pipeline failed:', err.message);
                send(500, { error: 'File stream failed.' });   // Flaw #25
            });
    });

    // Guard: request ends with no file at all (Flaw #26)
    bb.on('close', () => {
        if (!fileProcessed && !responseSent) {
            send(400, { error: 'No file found in the request.' });
        }
    });

    // IGNITION — must be the LAST line (Flaw #24)
    req.pipe(bb);
});


// ─────────────────────────────────────────────
// GET /api/evidence/verify/:id
// ─────────────────────────────────────────────
router.get('/verify/:id', async (req, res) => {
    const { id } = req.params;
    const actorId = req.user.id;

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
                stream.on('error', reject);   // Flaw #9
            });
        });

        // 3. Get immutable hash from ledger — NOT Postgres (Flaw #2)
        const ledgerHash = await ledger.getHash(id);

        // 4. In MOCK mode, ledger returns null → fall back to Postgres hash
        const truthHash = ledgerHash || record.sha256_hash;
        const result = (liveHash === truthHash) ? 'OK' : 'TAMPERED';

        // 5. Write to audit log (Flaw #6)
        await pool.query(
            `INSERT INTO audit_log (evidence_id, action, result, actor_id)
       VALUES ($1, 'VERIFY', $2, $3)`,
            [id, result, actorId]
        );

        if (result === 'TAMPERED') {
            await pool.query(
                `INSERT INTO evidence_forensic_log (evidence_id, flags, details, actor)
                 VALUES ($1, $2, $3, $4)`,
                [id, ['INTEGRITY_COMPROMISED'], JSON.stringify({ liveHash, truthHash, message: 'Hash mismatch detected during verification' }), actorId]
            );
        }

        // 6. Return result
        res.json({ status: result });

    } catch (err) {
        console.error('Verify error:', err.message);
        res.status(500).json({ error: 'Verification failed', details: err.message, stack: err.stack });
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

        // Use PUBLIC client — browser-resolvable URL (Flaw #11)
        // 30 seconds — enough to start download, too short to leak (Flaw #14)
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
// Returns paginated evidence IDs using Keyset (Cursor) Pagination for infinite scale.
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
// Accepts an array of IDs and verifies them concurrently, preventing DDoS lockups.
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

                const ledgerHash = await ledger.getHash(id);
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
router.get('/', requireRoles(['Police Officer', 'Judicial Authority']), async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'uploadDate';
        const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // Map frontend sort keys to SQL columns
        const sortMap = {
            'uploadDate': 'e.uploaded_at',
            'fileName': 'e.filename',
            'status': 'e.filename', // no real status column, fallback
        };
        const orderCol = sortMap[sortBy] || 'e.uploaded_at';

        // Build WHERE clauses
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

        // Status filtering based on audit_log results
        let statusJoin = '';
        if (status === 'verified') {
            statusJoin = `JOIN audit_log al ON al.evidence_id = e.id AND al.result = 'OK'`;
        } else if (status === 'tampered') {
            statusJoin = `JOIN audit_log al ON al.evidence_id = e.id AND al.result = 'TAMPERED'`;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Count query
        const countSQL = `SELECT COUNT(DISTINCT e.id) FROM evidence e JOIN fir f ON e.fir_id = f.id ${statusJoin} ${whereClause}`;
        const countResult = await pool.query(countSQL, params);
        const total = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(total / limit) || 1;

        // Data query
        const dataSQL = `
            SELECT DISTINCT ON (e.id)
                e.id, 
                e.filename as "fileName", 
                f.fir_number as "firNumber", 
                f.id as "firId",
                e.sha256_hash as "hash", 
                COALESCE(e.category, 'other') as "category", 
                e.uploaded_at as "uploadDate",
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

        // Re-sort since DISTINCT ON requires ORDER BY e.id first
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
// MUST BE AT THE BOTTOM to prevent intercepting /upload, /verify/:id, etc.
router.get('/:id', requireRoles(['Police Officer', 'Judicial Authority']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT 
                e.id, 
                e.filename as "fileName", 
                f.fir_number as "firNumber", 
                f.id as "firId",
                e.sha256_hash as "hash", 
                COALESCE(e.category, 'other') as "category",
                e.uploaded_at as "uploadDate", 
                e.uploaded_by as "uploaderId",
                e.mime_type as "mimeType",
                e.file_size as "fileSize",
                e.ledger_tx_id as "ledgerTxId",
                e.ledger_timestamp as "ledgerTimestamp",
                e.uploader_name as "uploaderName",
                e.uploader_employee_id as "uploaderEmployeeId",
                e.description,
                COALESCE(
                    (SELECT CASE WHEN al2.result = 'TAMPERED' THEN 'tampered' WHEN al2.result = 'OK' THEN 'verified' END
                     FROM audit_log al2 WHERE al2.evidence_id = e.id ORDER BY al2.checked_at DESC LIMIT 1),
                    'pending'
                ) as status
             FROM evidence e 
             JOIN fir f ON e.fir_id = f.id 
             WHERE e.id = $1`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });
        
        const auditRows = await pool.query(
            `SELECT action, result, actor_id as "actor", checked_at as "timestamp" 
             FROM audit_log WHERE evidence_id = $1 ORDER BY checked_at DESC`, [req.params.id]
        );
        
        const record = rows[0];
        res.json({
            ...record,
            uploadedBy: record.uploaderName ? { name: record.uploaderName, employeeId: record.uploaderEmployeeId } : null,
            fileUrl: `/api/evidence/download/${req.params.id}`,
            history: auditRows.rows
        });
    } catch (err) {
        console.error('Get Evidence error:', err.message);
        res.status(500).json({ error: 'Failed to fetch evidence details' });
    }
});

module.exports = router;
