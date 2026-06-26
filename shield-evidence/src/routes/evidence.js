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
    let responseSent = false;
    const send = (status, body) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(body);
        }
    };

    const userId = req.user.userId || req.user.id;
    let fir_id;
    let capturedCategory = 'other', capturedDescription = '';
    let sourceData = null;
    let sourceIdPromise = null;
    const uploadPromises = [];
    let filesCount = 0;

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 500 * 1024 * 1024 },
    });

    bb.on('field', (name, val) => {
        if (name === 'fir_id') fir_id = val;
        if (name === 'category') capturedCategory = val;
        if (name === 'description') capturedDescription = val;
        if (name === 'sourceData') {
            try {
                sourceData = JSON.parse(val);
                // Validate required fields
                if (!sourceData.sourceType || !sourceData.deviceChain || sourceData.lawfulControl === undefined || sourceData.properOperation === undefined) {
                    return send(400, { error: 'Missing mandatory Section 63 fields in sourceData' });
                }
                
                sourceIdPromise = pool.query(`
                    INSERT INTO evidence_source (source_type, make, model, serial_number, identifiers, device_chain, lawful_control, proper_operation, ownership_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id
                `, [
                    sourceData.sourceType, sourceData.make || null, sourceData.model || null, sourceData.serial || null, sourceData.identifiers || null,
                    JSON.stringify(sourceData.deviceChain), sourceData.lawfulControl, sourceData.properOperation, sourceData.ownershipStatus || null
                ]).then(res => res.rows[0].id).catch(err => {
                    console.error('Failed to insert evidence_source:', err);
                    throw err;
                });
            } catch (e) {
                send(400, { error: 'Invalid sourceData JSON' });
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
        if (!sourceIdPromise) {
            fileStream.resume();
            return send(400, { error: 'sourceData field must come before files in FormData' });
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

        const fileUploadPromise = Promise.all([putPromise, hashPromise, sourceIdPromise])
            .then(async ([, hash, sourceId]) => {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    // Attempt blockchain anchoring (non-blocking — don't fail the upload if blockchain is down)
                    let ledgerTxId = null;
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
                        ledgerTimestamp = ledgerTxId ? new Date().toISOString() : null;
                    } catch (ledgerErr) {
                        console.warn(`[Evidence] Blockchain anchoring failed for ${evidenceId}: ${ledgerErr.message}. Evidence will be saved without ledger proof.`);
                    }

                    await client.query(
                        `INSERT INTO evidence
                         (id, fir_id, source_id, filename, bucket_name, object_key, sha256_hash, uploaded_by, category, mime_type, file_size, ledger_tx_id, ledger_timestamp, uploader_name, uploader_employee_id, description)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                        [evidenceId, fir_id, sourceId, filename, BUCKET, objectKey, hash, userId, capturedCategory, mimeType, fileSize, ledgerTxId, ledgerTimestamp, req.user.name || null, req.user.employee_id || req.user.employeeId || null, capturedDescription]
                    );

                    await client.query('COMMIT');

                    extractMetadata(evidenceId, objectKey, BUCKET).catch(err => console.warn('⚠️ Could not extract metadata:', err.message));

                    return { id: evidenceId, filename, sha256_hash: hash, ledgerTxId };
                } catch (err) {
                    await client.query('ROLLBACK');
                    try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) { }
                    throw err;
                } finally {
                    client.release();
                }
            })
            .catch(err => {
                console.error("File upload promise rejected:", err);
                return { error: true, message: err.message, stack: err.stack };
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
            // After all files are processed, we have the sourceId from the promise
            const sourceId = await sourceIdPromise;
            send(201, { id: results[0]?.id, sourceId, files: results });
        } catch (err) {
            console.error('Batch upload failed:', err);
            send(500, { error: 'Upload failed for one or more files.', details: err.message });
        }
    });

    req.pipe(bb);
});


// ─────────────────────────────────────────────
// GET /api/evidence/verify/:id
// ─────────────────────────────────────────────
router.get('/verify/:id', async (req, res) => {
    const { id } = req.params;
    const actorId = req.user.userId || req.user.id;

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
        const ledgerHash = await ledger.getEvidenceHash(id);

        // 4. In MOCK mode, ledger returns null → fall back to Postgres hash
        const truthHash = ledgerHash || record.sha256_hash;
        const result = (liveHash === truthHash) ? 'OK' : 'TAMPERED';

        // 5. Write to audit log (Flaw #6)
        await pool.query(
            `INSERT INTO audit_log (evidence_id, action, result, actor_id)
       VALUES ($1, 'VERIFY', $2, $3)`,
            [id, result, actorId]
        );

        // Circuit Breaker: Terminal Failure State
        if (result === 'TAMPERED' && record.source_id) {
            await pool.query(
                `UPDATE evidence_source SET certificate_status = 'FAILED_VERIFICATION' WHERE id = $1`,
                [record.source_id]
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
router.get('/', requireRoles(['Police Officer', 'Judicial Authority', 'Forensic Expert', 'Admin']), async (req, res) => {
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
router.get('/:id', requireRoles(['Police Officer', 'Judicial Authority', 'Admin', 'Forensic Expert']), async (req, res) => {
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
                e.source_id as "sourceId",
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
