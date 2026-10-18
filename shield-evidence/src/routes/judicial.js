const express = require('express');
const pool = require('../db');
const { minioPublic, BUCKET } = require('../config/minio');
const requireRoles = require('../middleware/rbac');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const judicialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests on judicial endpoints. Please try again later.' }
});

router.use(judicialLimiter);

// ─────────────────────────────────────────────
// GET /api/judicial/feed
// Pre-trial statutory 24-hr compliance queue under Section 176 BNSS 2023
// Restricted to Judicial Magistrate (and Judicial Authority)
// ─────────────────────────────────────────────
router.get('/feed', requireRoles(['Judicial Magistrate', 'Judicial Authority']), async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        
        // Fetch assigned police stations for this magistrate
        let assignedStations = [];
        if (req.user.assignedPoliceStations && Array.isArray(req.user.assignedPoliceStations)) {
            assignedStations = req.user.assignedPoliceStations;
        } else if (req.user.assigned_police_stations && Array.isArray(req.user.assigned_police_stations)) {
            assignedStations = req.user.assigned_police_stations;
        } else if (userId) {
            const { rows: uRows } = await pool.query(
                'SELECT assigned_police_stations FROM users WHERE id = $1', [userId]
            );
            if (uRows.length && uRows[0].assigned_police_stations) {
                const raw = uRows[0].assigned_police_stations;
                assignedStations = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
            }
        }

        const conditions = [];
        const values = [];
        let idx = 1;

        if (assignedStations.length > 0) {
            conditions.push(`(f.station = ANY($${idx}) OR f.jurisdiction_name = ANY($${idx}))`);
            values.push(assignedStations);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(`
            SELECT f.id, f.fir_number as "firNumber", f.case_category as "caseCategory",
                   f.description, f.location, f.station, f.applicable_sections as "applicableSections",
                   f.incident_date_time as "incidentDateTime", f.status, f.trial_status as "trialStatus",
                   f.sessions_court_id as "sessionsCourtId", f.committal_date as "committalDate",
                   f.filename, f.sha256_hash as "sha256Hash", f.ledger_tx_id as "ledgerTxId",
                   f.ledger_timestamp as "ledgerTimestamp", f.registered_at as "registeredAt",
                   (SELECT COUNT(*) FROM evidence WHERE fir_id = f.id)::int as "evidenceCount",
                   (SELECT COUNT(*) FROM fir_supplementary_reports WHERE fir_id = f.id)::int as "supplementaryCount"
            FROM fir f
            ${where}
            ORDER BY f.registered_at DESC
        `, values);

        // Inject computed Section 176 BNSS statutory 24-hr status & countdown fields
        const now = Date.now();
        const enriched = rows.map((row) => {
            const regTime = new Date(row.registeredAt).getTime();
            const hoursSinceFiling = parseFloat(((now - regTime) / (1000 * 60 * 60)).toFixed(2));
            const hoursRemaining = Math.max(0, parseFloat((24 - hoursSinceFiling).toFixed(2)));
            const statutory24hStatus = hoursSinceFiling <= 24 ? 'WITHIN_LIMIT' : 'EXPIRED';

            return {
                ...row,
                hours_since_filing: hoursSinceFiling,
                hours_remaining: hoursRemaining,
                statutory_24h_status: statutory24hStatus,
                statutory_deadline: new Date(regTime + 24 * 60 * 60 * 1000).toISOString()
            };
        });

        res.json({
            success: true,
            count: enriched.length,
            assignedStations,
            data: enriched
        });
    } catch (err) {
        console.error('[JUDICIAL FEED ERROR]', err.message);
        res.status(500).json({ error: 'Failed to retrieve judicial statutory feed' });
    }
});

// ─────────────────────────────────────────────
// POST /api/judicial/fir/:id/commit
// Commits a case to the Sessions Court for trial
// Restricted to Judicial Magistrate (and Judicial Authority)
// ─────────────────────────────────────────────
router.post('/fir/:id/commit', requireRoles(['Judicial Magistrate', 'Judicial Authority']), express.json(), async (req, res) => {
    const { id } = req.params;
    const { sessionsCourtId, committalRemarks } = req.body;
    const userId = req.user.userId || req.user.id;
    const targetCourt = sessionsCourtId || 'Sessions Court, Pune';

    try {
        const { rows: firRows } = await pool.query('SELECT id, fir_number, status FROM fir WHERE id = $1', [id]);
        if (!firRows.length) {
            return res.status(404).json({ error: 'FIR record not found' });
        }

        const { rows: updated } = await pool.query(`
            UPDATE fir
            SET status = 'COMMITTED_FOR_TRIAL',
                trial_status = 'COMMITTED_FOR_TRIAL',
                sessions_court_id = $1,
                committal_date = NOW(),
                committed_by = $2
            WHERE id = $3
            RETURNING id, fir_number as "firNumber", status, trial_status as "trialStatus",
                      sessions_court_id as "sessionsCourtId", committal_date as "committalDate"
        `, [targetCourt, userId, id]);

        // Audit log
        await pool.query(`
            INSERT INTO api_audit_log (
                user_id, user_name, user_role, user_employee_id, method, endpoint,
                ip_address, status_code, target_label
            ) VALUES ($1, $2, $3, $4, 'POST', $5, $6, 200, $7)
        `, [
            userId,
            req.user.name || 'Judicial Magistrate',
            req.user.role,
            req.user.employeeId || null,
            `/api/judicial/fir/${id}/commit`,
            req.ip || '127.0.0.1',
            `COMMITTED_FOR_TRIAL: ${updated[0].firNumber} -> ${targetCourt}`
        ]);

        res.json({
            success: true,
            message: `Case ${updated[0].firNumber} successfully committed to ${targetCourt} for trial`,
            fir: updated[0],
            committalRemarks: committalRemarks || null
        });
    } catch (err) {
        console.error('[CASE COMMITTAL ERROR]', err.message);
        res.status(500).json({ error: 'Failed to commit case to Sessions Court' });
    }
});

// ─────────────────────────────────────────────
// GET /api/judicial/vakalatnama/pending
// Lists all pending advocate Vakalatnama representation requests
// Restricted to Judicial Magistrate, Sessions Judge, and Judicial Authority
// ─────────────────────────────────────────────
router.get('/vakalatnama/pending', requireRoles(['Judicial Magistrate', 'Sessions Judge', 'Judicial Authority']), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT vr.id, vr.fir_id as "firId", vr.advocate_id as "advocateId",
                   vr.advocate_name as "advocateName", vr.bar_enrollment_no as "barEnrollmentNo",
                   vr.designation, vr.vakalatnama_object_key as "objectKey",
                   vr.status, vr.created_at as "createdAt",
                   f.fir_number as "firNumber", f.station, f.case_category as "caseCategory",
                   f.description as "firDescription", f.registered_at as "firRegisteredAt"
            FROM vakalatnama_requests vr
            JOIN fir f ON vr.fir_id = f.id
            WHERE vr.status = 'PENDING'
            ORDER BY vr.created_at ASC
        `);

        res.json({
            success: true,
            count: rows.length,
            requests: rows
        });
    } catch (err) {
        console.error('[PENDING VAKALATNAMA ERROR]', err.message);
        res.status(500).json({ error: 'Failed to retrieve pending Vakalatnama requests' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/judicial/vakalatnama/:id/review
// Approves or rejects an advocate Vakalatnama request
// Restricted to Judicial Magistrate, Sessions Judge, and Judicial Authority
// ─────────────────────────────────────────────
router.patch('/vakalatnama/:id/review', requireRoles(['Judicial Magistrate', 'Sessions Judge', 'Judicial Authority']), express.json(), async (req, res) => {
    const { id } = req.params;
    const { action, rejectionReason } = req.body;
    const userId = req.user.userId || req.user.id;
    const reviewerName = req.user.name || 'Presiding Judicial Officer';

    if (!['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Must be 'APPROVE' or 'REJECT'." });
    }

    try {
        const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const reason = action === 'REJECT' ? (rejectionReason || 'Rejected by judicial authority.') : null;

        const { rows } = await pool.query(`
            UPDATE vakalatnama_requests
            SET status = $1,
                reviewed_by = $2,
                reviewer_name = $3,
                reviewed_at = NOW(),
                rejection_reason = $4
            WHERE id = $5
            RETURNING id, fir_id as "firId", advocate_id as "advocateId", advocate_name as "advocateName",
                      bar_enrollment_no as "barEnrollmentNo", designation, status, reviewed_at as "reviewedAt",
                      rejection_reason as "rejectionReason"
        `, [status, userId, reviewerName, reason, id]);

        if (!rows.length) {
            return res.status(404).json({ error: 'Vakalatnama request not found' });
        }

        // Audit log
        await pool.query(`
            INSERT INTO api_audit_log (
                user_id, user_name, user_role, user_employee_id, method, endpoint,
                ip_address, status_code, target_label
            ) VALUES ($1, $2, $3, $4, 'PATCH', $5, $6, 200, $7)
        `, [
            userId,
            reviewerName,
            req.user.role,
            req.user.employeeId || null,
            `/api/judicial/vakalatnama/${id}/review`,
            req.ip || '127.0.0.1',
            `VAKALATNAMA_${status}: Adv. ${rows[0].advocateName} (${rows[0].barEnrollmentNo})`
        ]);

        res.json({
            success: true,
            message: `Vakalatnama representation ${status.toLowerCase()} by court.`,
            request: rows[0]
        });
    } catch (err) {
        console.error('[VAKALATNAMA REVIEW ERROR]', err.message);
        res.status(500).json({ error: 'Failed to review Vakalatnama request' });
    }
});

// ─────────────────────────────────────────────
// GET /api/judicial/vakalatnama/:id/document
// Downloads or presigns the uploaded Vakalatnama PDF for judicial inspection
// ─────────────────────────────────────────────
router.get('/vakalatnama/:id/document', requireRoles(['Judicial Magistrate', 'Sessions Judge', 'Judicial Authority', 'Advocate']), async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            'SELECT vakalatnama_object_key FROM vakalatnama_requests WHERE id = $1', [id]
        );
        if (!rows.length || !rows[0].vakalatnama_object_key) {
            return res.status(404).json({ error: 'Vakalatnama document not found' });
        }

        const url = await minioPublic.presignedGetObject(BUCKET, rows[0].vakalatnama_object_key, 60);
        res.redirect(url);
    } catch (err) {
        console.error('[VAKALATNAMA DOC ERROR]', err.message);
        res.status(500).json({ error: 'Failed to access Vakalatnama document' });
    }
});

module.exports = router;
