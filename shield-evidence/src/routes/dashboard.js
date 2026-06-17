const express = require('express');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', requireRoles(['Police Officer', 'Judicial Authority', 'Forensic Expert']), async (req, res) => {
    try {
        const firsCount = await pool.query('SELECT COUNT(*) FROM fir');
        const evidenceCount = await pool.query('SELECT COUNT(*) FROM evidence');
        
        // Count verified evidence pieces from audit log
        const verifiedCount = await pool.query(
            "SELECT COUNT(DISTINCT evidence_id) FROM audit_log WHERE result = 'OK'"
        );
        
        // Count tampered evidence pieces from audit log
        const tamperedCount = await pool.query(
            "SELECT COUNT(DISTINCT evidence_id) FROM audit_log WHERE result = 'TAMPERED'"
        );

        const recentActivity = await pool.query(
            `SELECT a.id, a.action, a.checked_at as timestamp, COALESCE(e.filename, 'System') as "targetLabel" 
             FROM audit_log a 
             LEFT JOIN evidence e ON a.evidence_id = e.id 
             ORDER BY a.checked_at DESC 
             LIMIT 5`
        );

        res.json({
            stats: {
                totalFirs: parseInt(firsCount.rows[0].count, 10),
                totalEvidence: parseInt(evidenceCount.rows[0].count, 10),
                verifiedCount: parseInt(verifiedCount.rows[0].count, 10),
                tamperedCount: parseInt(tamperedCount.rows[0].count, 10)
            },
            recentActivity: recentActivity.rows
        });
    } catch (err) {
        console.error('[DASHBOARD STATS]', err.message);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

module.exports = router;
