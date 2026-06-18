const express = require('express');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// Maps HTTP method+endpoint patterns to friendly action names
function classifyAction(method, endpoint) {
    if (endpoint.includes('/fir/create') && method === 'POST') return 'UPLOADED_FIR';
    if (endpoint.includes('/evidence/upload') && method === 'POST') return 'UPLOADED_EVIDENCE';
    if (endpoint.includes('/evidence/download') && method === 'GET') return 'DOWNLOADED_EVIDENCE';
    if (endpoint.includes('/evidence/verify') && method === 'GET') return 'VERIFY';
    if (endpoint.includes('/fir/') && endpoint.includes('/close') && method === 'PATCH') return 'CLOSED_FIR';
    if (endpoint.includes('/reset-password') || method === 'PASSWORD_RESET') return 'PASSWORD_RESET';
    return null; // not a meaningful action — filter out
}

// Friendly descriptions for each action
const ACTION_DESCRIPTIONS = {
    UPLOADED_FIR:       'Registered a new FIR',
    UPLOADED_EVIDENCE:  'Uploaded evidence file',
    DOWNLOADED_EVIDENCE:'Downloaded evidence file',
    VERIFY:             'Verified evidence integrity',
    CLOSED_FIR:         'Closed FIR',
    PASSWORD_RESET:     'Reset user password',
};

// GET /api/audit
router.get('/', requireRoles(['Judicial Authority']), async (req, res) => {
    const { userId, action, limit = 100 } = req.query;

    try {
        // ── Part 1: Evidence integrity verifications (audit_log table) ──────────────
        const auditConditions = ['1=1'];
        const auditValues = [];
        let idx = 1;

        if (userId) {
            auditConditions.push(`a.actor_id = $${idx++}`);
            auditValues.push(userId);
        }
        if (action && action === 'VERIFY') {
            // Only include VERIFY records when that filter is active
            auditConditions.push(`a.action = 'VERIFY'`);
        } else if (action && action !== 'VERIFY') {
            // VERIFY filter not active but a different action is — skip audit_log entirely
            auditConditions.push('1=0');
        }

        const auditWhere = `WHERE ${auditConditions.join(' AND ')}`;

        const auditRows = await pool.query(
            `SELECT 
                a.id::text,
                'VERIFY' as action,
                a.result,
                a.actor_id,
                COALESCE(u.name, NULLIF(al2.user_name, '')) as user_name,
                CASE 
                    WHEN a.actor_id::text = '00000000-0000-0000-0000-000000000000' THEN NULL
                    ELSE a.actor_id
                END as actor_id_fallback,
                COALESCE(u.role, al2.user_role) as user_role,
                COALESCE(u.employee_id, al2.user_employee_id) as user_employee_id,
                a.checked_at as timestamp,
                COALESCE(e.filename, 'Unknown file') as "targetLabel",
                e.id::text as "targetId",
                'evidence' as "targetType"
             FROM audit_log a
             LEFT JOIN evidence e ON a.evidence_id = e.id
             LEFT JOIN users u ON a.actor_id::text = u.id::text
             LEFT JOIN LATERAL (
                 SELECT 
                     u.name::text as user_name,
                     u.role::text as user_role,
                     u.employee_id::text as user_employee_id
                 FROM users u
                 WHERE u.id::text = a.actor_id::text
                 LIMIT 1
             ) al2 ON true
             ${auditWhere}`,
            auditValues
        );

        // ── Part 2: API request log (api_audit_log table) ────────────────────────────
        const apiConditions = [];
        const apiValues = [];
        let apiIdx = 1;

        if (userId) {
            apiConditions.push(`al.user_id = $${apiIdx++}`);
            apiValues.push(userId);
        }

        // Only fetch evidence-related API events (not VERIFY — those are in audit_log)
        // Filter out noisy internal endpoints
        apiConditions.push(`al.endpoint NOT LIKE '%/auth/me%'`);
        apiConditions.push(`al.endpoint NOT LIKE '%/auth/refresh%'`);
        apiConditions.push(`al.endpoint NOT LIKE '%/dashboard%'`);
        apiConditions.push(`al.endpoint NOT LIKE '%/audit%'`);
        apiConditions.push(`al.endpoint NOT LIKE '%/evidence/verify%'`); // handled by audit_log
        apiConditions.push(`al.endpoint NOT LIKE '%/fir/list%'`);
        apiConditions.push(`(al.endpoint NOT LIKE '%/fir/%' OR al.method = 'POST' OR al.endpoint LIKE '%/close%')`);
        apiConditions.push(`al.status_code < 400`); // only successful actions
        apiConditions.push(`al.user_id IS NOT NULL`); // only authenticated requests

        const apiWhere = `WHERE ${apiConditions.join(' AND ')}`;

        const apiRows = await pool.query(
            `SELECT 
                al.id::text,
                al.method,
                al.endpoint,
                al.user_id as actor_id,
                al.user_name,
                al.user_role,
                al.user_employee_id,
                al.accessed_at as timestamp,
                al.status_code
             FROM api_audit_log al
             ${apiWhere}
             ORDER BY al.accessed_at DESC
             LIMIT $${apiIdx}`,
            [...apiValues, parseInt(limit) || 100]
        );

        // Classify and enrich API rows
        const mappedApiRows = [];
        for (const row of apiRows.rows) {
            const actionKey = classifyAction(row.method, row.endpoint);
            if (!actionKey) continue; // skip unclassified noise
            if (action && action !== actionKey) continue; // filter by action

            let targetLabel = ACTION_DESCRIPTIONS[actionKey] || actionKey;

            // For evidence uploads/downloads, try to get the filename
            // The endpoint may contain evidence ID for downloads
            const evidenceIdMatch = row.endpoint.match(/\/evidence\/download\/([a-f0-9-]{36})/i);
            if (evidenceIdMatch) {
                const evRes = await pool.query('SELECT filename FROM evidence WHERE id = $1', [evidenceIdMatch[1]]);
                if (evRes.rows[0]) targetLabel = evRes.rows[0].filename;
            }

            // For FIR uploads, try to find the FIR created around that timestamp
            if (actionKey === 'UPLOADED_FIR') {
                const firRes = await pool.query(
                    'SELECT fir_number FROM fir WHERE reporting_officer = $1 ORDER BY registered_at DESC LIMIT 1',
                    [row.actor_id]
                );
                if (firRes.rows[0]) targetLabel = firRes.rows[0].fir_number;
            }

            mappedApiRows.push({
                id: row.id,
                action: actionKey,
                result: row.status_code < 400 ? 'success' : 'failed',
                actor_id: row.actor_id,
                user_name: row.user_name,
                user_role: row.user_role,
                user_employee_id: row.user_employee_id,
                timestamp: row.timestamp,
                targetLabel,
                targetId: null,
                targetType: 'api',
            });
        }

        // Merge and sort by timestamp descending
        const combined = [
            ...auditRows.rows,
            ...mappedApiRows,
        ].map((row) => {
            // Clean up helper column.
            if ('actor_id_fallback' in row) {
                const { actor_id_fallback, ...rest } = row;
                return rest;
            }
            return row;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
         .slice(0, parseInt(limit) || 100);



        res.json({ auditLog: combined });
    } catch (err) {
        console.error('[AUDIT LOG]', err.message);
        res.status(500).json({ error: 'Failed to fetch audit records' });
    }
});

module.exports = router;
