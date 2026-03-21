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
                `INSERT INTO fir (id, case_category, description, location, reporting_officer)
       VALUES ($1, $2, $3, $4, $5)`,
                [firId, caseCategory, desc, loc, reportingOfficer]
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

module.exports = router;
