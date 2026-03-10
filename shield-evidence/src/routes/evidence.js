const express = require('express');
const busboy = require('busboy');
const crypto = require('crypto');
const path = require('path');
const { PassThrough } = require('stream');

const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const ledger = require('../services/ledger');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// ─────────────────────────────────────────────
// POST /api/evidence/upload
// ─────────────────────────────────────────────
// POST /api/evidence/upload
// ─────────────────────────────────────────────
router.post('/upload', requireRoles(['Police Officer', 'Super Admin']), (req, res) => {

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
    let fileProcessed = false;   // Flaw #22 — multi-file guard

    // ── Busboy init with file size limit (Flaw #18) ───────────────────
    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 500 * 1024 * 1024 },  // 500 MB hard cap
    });

    // ── Capture text fields first (Flaw #16) ──────────────────────────
    bb.on('field', (name, val) => {
        if (name === 'fir_id') fir_id = val;
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

        // Await BOTH MinIO confirmation AND hash digest (Flaw #13)
        Promise.all([putPromise, hashPromise])
            .then(async ([, hash]) => {
                // ── Postgres transaction (Flaw #4, #10, #20) ────────────
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    await client.query(
                        `INSERT INTO evidence
               (id, fir_id, filename, bucket_name, object_key, sha256_hash, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [evidenceId, fir_id, capturedFilename, BUCKET, objectKey, hash, userId]
                    );

                    // Lock hash into ImmuDB via shield-ledger (Flaw #1)
                    await ledger.storeHash(evidenceId, hash);

                    await client.query('COMMIT');
                    send(201, { id: evidenceId, sha256_hash: hash });
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

        res.json({ url });
    } catch (err) {
        console.error('Download error:', err.message);
        res.status(500).json({ error: 'Could not generate download URL' });
    }
});

module.exports = router;
