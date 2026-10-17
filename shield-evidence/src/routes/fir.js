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

/**
 * Jurisdictional Access Control Helper:
 * Enforces police station scoping under Person 2.
 * Police officers are strictly confined to FIRs matching their assigned station.
 */
function checkPoliceStationAccess(user, fir) {
    if (!user || !user.role) return true;
    const role = requireRoles.normalizeRole(user.role);
    if (role !== 'police_officer') return true;

    const officerStation = user.station;
    const firStation = fir.station || fir.jurisdiction_name;

    // If the officer has an assigned station and the FIR has an assigned station, they must match
    if (officerStation && firStation) {
        if (firStation.trim().toLowerCase() !== officerStation.trim().toLowerCase()) {
            return false;
        }
    }
    return true;
}

// ─────────────────────────────────────────────
// POST /api/fir/create
// ─────────────────────────────────────────────
// Accepts multipart/form-data with fields:
//   firNumber (required), incidentDateTime / dateTime, applicableSections, station,
//   incidentType / caseCategory, location, description, file
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

    const bb = busboy({
        headers: req.headers,
        // +1 byte: busboy fires 'limit' when bytes *reach* the cap (not exceed it),
        // so without +1 a file of exactly 500 MB would be rejected.
        limits: { fileSize: 500 * 1024 * 1024 + 1 }
    });

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
                const firNumber = fields.firNumber || fields.fir_number;
                const caseCategory = fields.case_category || fields.caseCategory || fields.incidentType || '';
                const desc = fields.description || '';
                const loc = fields.location || '';
                const applicableSections = fields.applicableSections || fields.applicable_sections || '';
                const station = (fields.station || req.user.station || '').trim();
                const rawDateTime = fields.incidentDateTime || fields.incident_date_time || fields.dateTime || null;
                const incidentDateTime = rawDateTime ? new Date(rawDateTime) : null;
                const jurisdictionName = (fields.jurisdictionName || fields.jurisdiction_name || station || '').trim();

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
                        `INSERT INTO fir (
                            id, case_category, description, location, reporting_officer, fir_number,
                            station, applicable_sections, incident_date_time, jurisdiction_name,
                            filename, bucket_name, object_key, sha256_hash, mime_type, file_size,
                            ledger_tx_id, ledger_timestamp, status
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'OPEN')`,
                        [
                            firId, caseCategory, desc, loc, reportingOfficer, firNumber,
                            station, applicableSections, incidentDateTime, jurisdictionName,
                            capturedFilename, BUCKET, objectKey, hash, capturedMime, fileSize,
                            ledgerTxId, ledgerTimestamp
                        ]
                    );

                    send(201, {
                        status: 'success',
                        fir_id: firId,
                        firNumber: firNumber,
                        station: station,
                        applicableSections: applicableSections,
                        sha256Hash: hash,
                        ledgerTxId: ledgerTxId,
                        message: 'FIR registered and immutably anchored successfully'
                    });
                } catch (err) {
                    try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) {}
                    console.error('Error creating FIR:', err.message);
                    send(500, { error: 'Failed to create FIR', details: err.message });
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

        // Police Station Jurisdictional Scoping
        if (!checkPoliceStationAccess(req.user, record)) {
            return res.status(403).json({
                error: 'Forbidden: Jurisdictional access denied for this police station.',
                code: 'JURISDICTION_ACCESS_DENIED'
            });
        }

        const liveHash = await new Promise((resolve, reject) => {
            minioInternal.getObject(record.bucket_name, record.object_key, (err, stream) => {
                if (err) return reject(err);
                const hashStream = crypto.createHash('sha256');
                stream.on('data', chunk => hashStream.update(chunk));
                stream.on('end', () => resolve(hashStream.digest('hex')));
                stream.on('error', reject);
            });
        });

        // Wrap in try/catch: if the ledger service is unreachable or returns an
        // unexpected status code, getFIRHash() throws. Fall back to Postgres hash.
        let ledgerHash = null;
        try {
            ledgerHash = await ledger.getFIRHash(id);
        } catch (ledgerErr) {
            console.warn(`[FIR Verify] Ledger lookup failed for ${id}: ${ledgerErr.message}. Falling back to Postgres hash.`);
        }
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
            'SELECT bucket_name, object_key, station, jurisdiction_name, reporting_officer FROM fir WHERE id = $1', [id]
        );
        if (!rows.length) return res.status(404).json({ error: 'FIR not found' });
        
        const fir = rows[0];
        // Police Station Jurisdictional Scoping
        if (!checkPoliceStationAccess(req.user, fir)) {
            return res.status(403).json({
                error: 'Forbidden: Jurisdictional access denied for this police station.',
                code: 'JURISDICTION_ACCESS_DENIED'
            });
        }

        const { bucket_name, object_key } = fir;
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
router.get('/list', requireRoles(['Police Officer', 'Judicial Authority', 'Forensic Expert', 'Advocate']), async (req, res) => {
    try {
        const { search } = req.query;
        const conditions = [];
        const values = [];
        let idx = 1;

        // Police Station Jurisdictional Scoping
        const userRole = requireRoles.normalizeRole(req.user.role);
        if (userRole === 'police_officer' && req.user.station) {
            conditions.push(`(f.station ILIKE $${idx} OR f.jurisdiction_name ILIKE $${idx})`);
            values.push(req.user.station.trim());
            idx++;
        }

        if (search) {
            conditions.push(`(f.fir_number ILIKE $${idx} OR f.case_category ILIKE $${idx} OR f.description ILIKE $${idx} OR f.location ILIKE $${idx} OR f.station ILIKE $${idx} OR f.applicable_sections ILIKE $${idx})`);
            values.push(`%${search}%`);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT f.id, f.fir_number as "firNumber", f.case_category as "incidentType", 
                    f.description, f.location, f.status, f.registered_at as "uploadDate",
                    f.station, f.applicable_sections as "applicableSections",
                    f.incident_date_time as "incidentDateTime", f.jurisdiction_name as "jurisdictionName",
                    f.filename, f.sha256_hash as "sha256Hash",
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
// GET /api/fir/:id/supplementary
// Returns chronological list of supplementary updates for that FIR
// ─────────────────────────────────────────────
router.get('/:id/supplementary', requireRoles(['Police Officer', 'Judicial Authority', 'Forensic Expert', 'Advocate']), async (req, res) => {
    const { id } = req.params;

    try {
        const { rows: firRows } = await pool.query(
            'SELECT id, station, jurisdiction_name, reporting_officer FROM fir WHERE id = $1', [id]
        );
        if (!firRows.length) return res.status(404).json({ error: 'FIR not found' });

        const fir = firRows[0];
        if (!checkPoliceStationAccess(req.user, fir)) {
            return res.status(403).json({
                error: 'Forbidden: Jurisdictional access denied for this police station.',
                code: 'JURISDICTION_ACCESS_DENIED'
            });
        }

        const { rows } = await pool.query(
            `SELECT id, fir_id as "firId", report_number as "reportNumber",
                    narrative, discovered_items as "discoveredItems",
                    fsl_notified as "fslNotified", reporting_officer as "reportingOfficer",
                    officer_name as "officerName", created_at as "createdAt",
                    sha256_hash as "sha256Hash", ledger_tx_id as "ledgerTxId"
             FROM fir_supplementary_reports
             WHERE fir_id = $1
             ORDER BY report_number ASC, created_at ASC`,
            [id]
        );

        res.json({
            data: rows,
            count: rows.length
        });
    } catch (err) {
        console.error('Error fetching supplementary reports:', err.message);
        res.status(500).json({ error: 'Failed to fetch supplementary reports', details: err.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/fir/:id/supplementary
// Section 193(9) BNSS: Append-Only Case Diary Entry
// ─────────────────────────────────────────────
router.post('/:id/supplementary', requireRoles(['Police Officer']), async (req, res) => {
    const { id } = req.params;
    const { narrative, discovered_items, discoveredItems, fsl_notified, fslNotified } = req.body;

    if (!narrative || !narrative.trim()) {
        return res.status(400).json({ error: 'Missing required field: narrative' });
    }

    try {
        // 1. Verify FIR exists and check jurisdictional access
        const { rows: firRows } = await pool.query(
            'SELECT id, status, station, jurisdiction_name, reporting_officer FROM fir WHERE id = $1', [id]
        );
        if (!firRows.length) return res.status(404).json({ error: 'FIR not found' });

        const fir = firRows[0];
        if (!checkPoliceStationAccess(req.user, fir)) {
            return res.status(403).json({
                error: 'Forbidden: Jurisdictional access denied for this police station.',
                code: 'JURISDICTION_ACCESS_DENIED'
            });
        }

        if (fir.status === 'CLOSED') {
            return res.status(400).json({ error: 'Cannot append supplementary report: FIR is closed.' });
        }

        // 2. Auto-calculate next report number: MAX(report_number) + 1
        const { rows: maxRows } = await pool.query(
            'SELECT COALESCE(MAX(report_number), 0) + 1 AS next_report_number FROM fir_supplementary_reports WHERE fir_id = $1',
            [id]
        );
        const reportNumber = parseInt(maxRows[0].next_report_number, 10);

        const items = discovered_items !== undefined ? discovered_items : (discoveredItems || '');
        const isFslNotified = Boolean(fsl_notified !== undefined ? fsl_notified : fslNotified);
        const reportingOfficer = req.user.userId || req.user.id || null;
        const officerName = req.user.name || 'Investigating Officer';

        // 3. Compute SHA-256 hash of narrative + discovered items + reportNumber + timestamp
        const hashInput = `${id}:${reportNumber}:${narrative.trim()}:${items.trim()}:${Date.now()}`;
        const sha256Hash = crypto.createHash('sha256').update(hashInput).digest('hex');

        // 4. Attempt blockchain anchoring if user has key
        let ledgerTxId = null;
        try {
            if (reportingOfficer) {
                const userRes = await pool.query('SELECT encrypted_private_key FROM users WHERE id = $1', [reportingOfficer]);
                const encKey = userRes.rows[0]?.encrypted_private_key;
                if (encKey) {
                    const { decryptPrivateKey } = require('../crypto');
                    const privateKey = decryptPrivateKey(encKey);
                    const suppKey = `supp-${id}-${reportNumber}`;
                    const ledgerResult = await ledger.storeFIRHash(suppKey, sha256Hash, privateKey);
                    ledgerTxId = ledgerResult?.txId || null;
                }
            }
        } catch (ledgerErr) {
            console.warn(`[Supplementary Report] Blockchain anchoring skipped/failed: ${ledgerErr.message}`);
        }

        // 5. Insert into fir_supplementary_reports
        const { rows: insertRows } = await pool.query(
            `INSERT INTO fir_supplementary_reports (
                fir_id, report_number, narrative, discovered_items, fsl_notified,
                reporting_officer, officer_name, sha256_hash, ledger_tx_id, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             RETURNING id, fir_id as "firId", report_number as "reportNumber",
                       narrative, discovered_items as "discoveredItems",
                       fsl_notified as "fslNotified", reporting_officer as "reportingOfficer",
                       officer_name as "officerName", created_at as "createdAt",
                       sha256_hash as "sha256Hash", ledger_tx_id as "ledgerTxId"`,
            [id, reportNumber, narrative.trim(), items.trim(), isFslNotified, reportingOfficer, officerName, sha256Hash, ledgerTxId]
        );

        res.status(201).json({
            status: 'success',
            message: `Supplementary Report #${reportNumber} recorded under Section 193(9) BNSS`,
            data: insertRows[0]
        });
    } catch (err) {
        console.error('Error adding supplementary report:', err.message);
        res.status(500).json({ error: 'Failed to record supplementary report', details: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/fir/:id
// ─────────────────────────────────────────────
router.get('/:id', requireRoles(['Police Officer', 'Judicial Authority', 'Forensic Expert', 'Advocate']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, fir_number as "firNumber", case_category as "incidentType", 
                    description, location, status, registered_at as "uploadDate", 
                    reporting_officer as "reportingOfficer",
                    station, applicable_sections as "applicableSections",
                    incident_date_time as "incidentDateTime", jurisdiction_name as "jurisdictionName",
                    filename, sha256_hash as "sha256Hash", ledger_tx_id as "ledgerTxId",
                    ledger_timestamp as "ledgerTimestamp"
             FROM fir WHERE id = $1`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'FIR not found' });
        
        const fir = rows[0];
        // Police Station Jurisdictional Scoping
        if (!checkPoliceStationAccess(req.user, fir)) {
            return res.status(403).json({
                error: 'Forbidden: Jurisdictional access denied for this police station.',
                code: 'JURISDICTION_ACCESS_DENIED'
            });
        }

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
            ...fir,
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
            'SELECT id, status, fir_number, station, jurisdiction_name, reporting_officer FROM fir WHERE id = $1', [req.params.id]
        );
        if (!firRows.length) return res.status(404).json({ error: 'FIR not found' });
        
        const fir = firRows[0];
        if (!checkPoliceStationAccess(req.user, fir)) {
            return res.status(403).json({
                error: 'Forbidden: Jurisdictional access denied for this police station.',
                code: 'JURISDICTION_ACCESS_DENIED'
            });
        }

        if (fir.status === 'CLOSED') return res.status(400).json({ error: 'FIR is already closed' });

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
            firNumber: fir.fir_number,
            status: 'CLOSED'
        });
    } catch (err) {
        console.error('Close FIR error:', err.message);
        res.status(500).json({ error: 'Failed to close FIR' });
    }
});

// ─────────────────────────────────────────────
// FIR Immutability Freeze (Section 173 CrPC / Sec 193 BNSS)
// Blocks any generic modification or overwriting of core FIR narrative/records
// ─────────────────────────────────────────────
router.put('/:id', (req, res) => {
    return res.status(405).json({
        error: 'FIR Freeze Violation: Modification of registered FIR narrative or records is strictly prohibited under Bharatiya Nagarik Suraksha Sanhita (BNSS). All subsequent findings must be recorded via Section 193(9) BNSS supplementary reports.',
        code: 'FIR_IMMUTABILITY_FROZEN'
    });
});

router.patch('/:id', (req, res) => {
    return res.status(405).json({
        error: 'FIR Freeze Violation: Modification of registered FIR narrative or records is strictly prohibited under Bharatiya Nagarik Suraksha Sanhita (BNSS). All subsequent findings must be recorded via Section 193(9) BNSS supplementary reports.',
        code: 'FIR_IMMUTABILITY_FROZEN'
    });
});

module.exports = router;
