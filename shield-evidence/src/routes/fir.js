const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// ─────────────────────────────────────────────
// POST /api/fir/create
// ─────────────────────────────────────────────
router.post('/create', requireRoles(['Police Officer', 'Super Admin']), async (req, res) => {
    const { case_category, description, location } = req.body;
    const reportingOfficer = req.user.id; // Extracted safely from middleware

    if (!case_category || !description || !location) {
        return res.status(400).json({ error: 'Missing required fields: case_category, description, location' });
    }

    const firId = crypto.randomUUID();

    try {
        await pool.query(
            `INSERT INTO fir (id, case_category, description, location, reporting_officer)
       VALUES ($1, $2, $3, $4, $5)`,
            [firId, case_category, description, location, reportingOfficer]
        );

        res.status(201).json({
            status: 'success',
            fir_id: firId,
            message: 'FIR registered successfully'
        });
    } catch (err) {
        console.error('Error creating FIR:', err.message);
        res.status(500).json({ error: 'Failed to create FIR' });
    }
});

module.exports = router;
