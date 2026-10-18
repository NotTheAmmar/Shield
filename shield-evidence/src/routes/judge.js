const express = require('express');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const judgeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests on judge trial endpoints. Please try again later.' }
});

router.use(judgeLimiter);

// ─────────────────────────────────────────────
// GET /api/judge/trial-roster
// Trial court roster for Sessions Judges under Person 4
// Restricted to Sessions Judge (and Judicial Authority)
// ─────────────────────────────────────────────
router.get('/trial-roster', requireRoles(['Sessions Judge', 'Judicial Authority']), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT f.id, f.fir_number as "firNumber", f.case_category as "caseCategory",
                   f.description, f.location, f.station, f.applicable_sections as "applicableSections",
                   f.incident_date_time as "incidentDateTime", f.status, f.trial_status as "trialStatus",
                   f.sessions_court_id as "sessionsCourtId", f.committal_date as "committalDate",
                   f.filename, f.sha256_hash as "sha256Hash", f.ledger_tx_id as "ledgerTxId",
                   f.ledger_timestamp as "ledgerTimestamp", f.registered_at as "registeredAt",
                   (SELECT COUNT(*) FROM evidence WHERE fir_id = f.id)::int as "evidenceCount",
                   (SELECT COUNT(*) FROM fir_supplementary_reports WHERE fir_id = f.id)::int as "supplementaryCount",
                   (
                       SELECT COALESCE(json_agg(json_build_object(
                           'id', vr.id,
                           'advocateName', vr.advocate_name,
                           'barEnrollmentNo', vr.bar_enrollment_no,
                           'designation', vr.designation
                       )), '[]'::json)
                       FROM vakalatnama_requests vr
                       WHERE vr.fir_id = f.id AND vr.status = 'APPROVED'
                   ) as "approvedAdvocates"
            FROM fir f
            WHERE f.status IN ('COMMITTED_FOR_TRIAL', 'UNDER_TRIAL', 'DISPOSED', 'JUDGED')
            ORDER BY f.committal_date DESC NULLS LAST, f.registered_at DESC
        `);

        res.json({
            success: true,
            count: rows.length,
            roster: rows
        });
    } catch (err) {
        console.error('[TRIAL ROSTER ERROR]', err.message);
        res.status(500).json({ error: 'Failed to retrieve trial roster' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/judge/fir/:id/status
// Updates case trial lifecycle status: COMMITTED_FOR_TRIAL ➔ UNDER_TRIAL ➔ DISPOSED / JUDGED
// Restricted to Sessions Judge (and Judicial Authority)
// ─────────────────────────────────────────────
router.patch('/fir/:id/status', requireRoles(['Sessions Judge', 'Judicial Authority']), express.json(), async (req, res) => {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const userId = req.user.userId || req.user.id;
    const judgeName = req.user.name || 'Sessions Judge';

    const validStatuses = ['COMMITTED_FOR_TRIAL', 'UNDER_TRIAL', 'DISPOSED', 'JUDGED'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: `Invalid status. Permitted values: [${validStatuses.join(', ')}]`
        });
    }

    try {
        const { rows: firRows } = await pool.query('SELECT id, fir_number, status FROM fir WHERE id = $1', [id]);
        if (!firRows.length) {
            return res.status(404).json({ error: 'Case record not found' });
        }

        const { rows: updated } = await pool.query(`
            UPDATE fir
            SET status = $1,
                trial_status = $1
            WHERE id = $2
            RETURNING id, fir_number as "firNumber", status, trial_status as "trialStatus",
                      sessions_court_id as "sessionsCourtId", committal_date as "committalDate"
        `, [status, id]);

        // Audit log
        await pool.query(`
            INSERT INTO api_audit_log (
                user_id, user_name, user_role, user_employee_id, method, endpoint,
                ip_address, status_code, target_label
            ) VALUES ($1, $2, $3, $4, 'PATCH', $5, $6, 200, $7)
        `, [
            userId,
            judgeName,
            req.user.role,
            req.user.employeeId || null,
            `/api/judge/fir/${id}/status`,
            req.ip || '127.0.0.1',
            `TRIAL_STATUS_UPDATE: ${updated[0].firNumber} -> ${status}${remarks ? ` (${remarks})` : ''}`
        ]);

        res.json({
            success: true,
            message: `Case ${updated[0].firNumber} trial status updated to ${status}`,
            fir: updated[0],
            remarks: remarks || null
        });
    } catch (err) {
        console.error('[TRIAL STATUS UPDATE ERROR]', err.message);
        res.status(500).json({ error: 'Failed to update trial status' });
    }
});

module.exports = router;
