const express = require('express');
const crypto = require('crypto');
const busboy = require('busboy');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// ─────────────────────────────────────────────
// POST /api/fir/create
// ─────────────────────────────────────────────
// Accepts multipart/form-data with fields:
//   firNumber (required), incidentType, dateTime, location, description, file
router.post('/create', requireRoles(['Police Officer', 'Super Admin']), (req, res) => {
    // Use userId or id — gateway mock puts userId, real JWT may put id
    const reportingOfficer = req.user.userId || req.user.id || 'unknown';

    // Parse multipart form data using busboy
    const fields = {};
    let responseSent = false;

    const send = (status, body) => {
        if (!responseSent) {
            responseSent = true;
            res.status(status).json(body);
        }
    };

    const bb = busboy({ headers: req.headers });

    bb.on('field', (name, val) => {
        fields[name] = val;
    });

    // We accept a file but don't store it yet — FIR creation is metadata-only for now
    bb.on('file', (fieldname, fileStream, info) => {
        // Drain the file stream to prevent socket hang
        fileStream.resume();
    });

    bb.on('close', async () => {
        const { firNumber, incidentType, dateTime, location, description } = fields;

        // Also support legacy field names from the old backend
        const caseCategory = fields.case_category || incidentType || '';
        const desc = description || '';
        const loc = location || '';

        if (!firNumber) {
            return send(400, { error: 'Missing required field: firNumber' });
        }

        const firId = crypto.randomUUID();

        try {
            await pool.query(
                `INSERT INTO fir (id, case_category, description, location, reporting_officer, fir_number)
       VALUES ($1, $2, $3, $4, $5, $6)`,
                [firId, caseCategory, desc, loc, reportingOfficer, firNumber]
            );

            send(201, {
                status: 'success',
                fir_id: firId,
                firNumber: firNumber,
                message: 'FIR registered successfully'
            });
        } catch (err) {
            console.error('Error creating FIR:', err.message);
            send(500, { error: 'Failed to create FIR' });
        }
    });

    bb.on('error', (err) => {
        console.error('Busboy parsing error:', err.message);
        send(500, { error: 'Failed to parse upload' });
    });

    req.pipe(bb);
});
// ─────────────────────────────────────────────
// GET /api/fir/list
// ─────────────────────────────────────────────
router.get('/list', requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, fir_number as "firNumber", case_category, description, location, status, registered_at as "uploadDate" FROM fir ORDER BY registered_at DESC'
        );
        res.json({
            data: rows,
            pagination: { page: 1, limit: 1000, total: rows.length, totalPages: 1 } // Fake pagination matching gateway mock format
        });
    } catch (err) {
        console.error('Error fetching FIRs:', err.message);
        res.status(500).json({ error: 'Failed to fetch FIRs' });
    }
});

// ─────────────────────────────────────────────
// GET /api/fir/:id
// ─────────────────────────────────────────────
router.get('/:id', requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, fir_number as "firNumber", case_category as "category", description, location, status, registered_at as "uploadDate", reporting_officer as "uploadedBy" 
             FROM fir WHERE id = $1`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'FIR not found' });
        
        const evidenceRows = await pool.query(
            `SELECT id, filename as "fileName", bucket_name, object_key, sha256_hash as "hash", uploaded_at as "uploadDate", 'pending' as status
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

module.exports = router;
