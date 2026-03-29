const express = require('express');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// GET /api/audit
router.get('/', requireRoles(['Judicial Authority']), async (req, res) => {
    try {
        // Fetch verification audit logs
        const { rows } = await pool.query(
            `SELECT a.id, a.action, a.result, a.actor_id, a.checked_at as timestamp, 
             e.filename as "targetLabel", e.id as "targetId", 'EVIDENCE' as "targetType"
             FROM audit_log a
             LEFT JOIN evidence e ON a.evidence_id = e.id
             ORDER BY a.checked_at DESC
             LIMIT 100`
        );
        res.json({ auditLog: rows });
    } catch (err) {
        console.error('[AUDIT LOG]', err.message);
        res.status(500).json({ error: 'Failed to fetch audit records' });
    }
});

module.exports = router;
