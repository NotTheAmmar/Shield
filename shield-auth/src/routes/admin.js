const express = require('express');
const bcrypt = require('bcrypt');
const http = require('http');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// Rate limiter for administrative and monitoring endpoints (CodeQL missing-rate-limiting fix)
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // max 200 requests per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin requests. Please try again later.' }
});

router.use(adminLimiter);

function checkHttpService(host, port, path = '/') {
    return new Promise((resolve) => {
        const start = Date.now();
        const req = http.get({ host, port, path, timeout: 2000 }, (res) => {
            res.resume();
            resolve({
                status: res.statusCode < 500 ? 'ONLINE' : 'DEGRADED',
                statusCode: res.statusCode,
                latencyMs: Date.now() - start
            });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ status: 'TIMEOUT', latencyMs: 2000 });
        });
        req.on('error', (err) => {
            resolve({ status: 'OFFLINE', error: err.message, latencyMs: Date.now() - start });
        });
    });
}

// GET /api/admin/system-health
router.get('/system-health', adminLimiter, requireRoles(['Admin']), async (req, res) => {
    try {
        const dbStart = Date.now();
        let dbStatus = 'ONLINE';
        let dbLatency = 0;
        try {
            await pool.query('SELECT 1');
            dbLatency = Date.now() - dbStart;
        } catch (err) {
            dbStatus = 'OFFLINE';
        }

        const evidenceHost = process.env.EVIDENCE_HOST || 'shield-evidence';
        const evidencePort = parseInt(process.env.EVIDENCE_PORT || '4001', 10);
        const ledgerHost = process.env.LEDGER_HOST || 'shield-ledger';
        const ledgerPort = parseInt(process.env.LEDGER_PORT || '4002', 10);

        const [evidenceHealth, ledgerHealth] = await Promise.all([
            checkHttpService(evidenceHost, evidencePort, '/'),
            checkHttpService(ledgerHost, ledgerPort, '/')
        ]);

        const { rows: userCountRows } = await pool.query('SELECT COUNT(*)::int as count FROM users');
        const { rows: auditCountRows } = await pool.query('SELECT COUNT(*)::int as count FROM api_audit_log');

        const services = [
            { name: 'shield-auth', role: 'Authentication & Identity Microservice', status: 'ONLINE', latencyMs: 1 },
            { name: 'db-users', role: 'PostgreSQL Relational & Audit Database', status: dbStatus, latencyMs: dbLatency },
            { name: 'shield-evidence', role: 'Evidence Ingestion & MinIO Storage Pipeline', status: evidenceHealth.status, latencyMs: evidenceHealth.latencyMs },
            { name: 'shield-ledger', role: 'EVM PoA Blockchain Smart Contract Gateway', status: ledgerHealth.status, latencyMs: ledgerHealth.latencyMs },
            { name: 'shield-watchdog', role: 'Automated Background Integrity Scanner', status: 'ONLINE', latencyMs: 5 },
        ];

        const overallStatus = services.every(s => s.status === 'ONLINE') ? 'HEALTHY' : 'OPERATIONAL_WITH_WARNINGS';

        res.json({
            overallStatus,
            timestamp: new Date().toISOString(),
            metrics: {
                totalUsers: userCountRows[0]?.count || 0,
                totalAuditEvents: auditCountRows[0]?.count || 0
            },
            services
        });
    } catch (err) {
        console.error('[ADMIN SYSTEM HEALTH]', err.message);
        res.status(500).json({ error: 'Failed to inspect system health', details: err.message });
    }
});

// GET /api/admin/audit-logs
router.get('/audit-logs', adminLimiter, requireRoles(['Admin']), async (req, res) => {
    try {
        const { search, method, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conditions = [];
        const values = [];
        let idx = 1;

        if (search) {
            conditions.push(`(LOWER(user_name) LIKE $${idx} OR LOWER(endpoint) LIKE $${idx} OR LOWER(target_label) LIKE $${idx} OR LOWER(user_employee_id) LIKE $${idx})`);
            values.push(`%${search.toLowerCase()}%`);
            idx++;
        }
        if (method) {
            conditions.push(`method = $${idx}`);
            values.push(method);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*)::int as total FROM api_audit_log ${where}`;
        const { rows: countRows } = await pool.query(countQuery, values);
        const total = countRows[0]?.total || 0;

        const dataQuery = `
            SELECT id, user_id, user_name, user_role, user_employee_id,
                   method, endpoint, ip_address, status_code, target_label, accessed_at
            FROM api_audit_log
            ${where}
            ORDER BY accessed_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
        `;
        const { rows: dataRows } = await pool.query(dataQuery, [...values, limitNum, offset]);

        res.json({
            data: dataRows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        });
    } catch (err) {
        console.error('[ADMIN AUDIT LOGS]', err.message);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

// GET /api/admin/watchdog-alerts
router.get('/watchdog-alerts', adminLimiter, requireRoles(['Admin']), async (req, res) => {
    try {
        // Query watchdog security alerts from api_audit_log
        const { rows } = await pool.query(`
            SELECT id, user_name, user_role, method, endpoint, target_label, ip_address, status_code, accessed_at
            FROM api_audit_log
            WHERE method LIKE '%ALERT%' OR method LIKE '%WATCHDOG%' OR endpoint LIKE '%watchdog%' OR target_label ILIKE '%tamper%'
            ORDER BY accessed_at DESC
            LIMIT 50
        `);
        res.json({ alerts: rows });
    } catch (err) {
        console.error('[ADMIN WATCHDOG ALERTS]', err.message);
        res.status(500).json({ error: 'Failed to fetch watchdog alerts' });
    }
});

// GET /api/admin/users
router.get('/users', requireRoles(['Admin']), async (req, res) => {
    try {
        const { search, role, status } = req.query;
        const conditions = [];
        const values = [];
        let idx = 1;

        if (search) {
            conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(employee_id) LIKE $${idx})`);
            values.push(`%${search.toLowerCase()}%`);
            idx++;
        }
        if (role) {
            conditions.push(`role = $${idx}`);
            values.push(role);
            idx++;
        }
        if (status) {
            conditions.push(`status = $${idx}`);
            values.push(status);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT id, email, name, employee_id, role, status, created_at,
                    designation, station, parentage_name, must_change_password, blockchain_address,
                    assigned_police_stations, fsl_jurisdiction_id, sessions_court_id, bar_enrollment_no
             FROM users ${where} ORDER BY created_at DESC`,
            values
        );
        res.json({ users: rows });
    } catch (err) {
        console.error('[ADMIN GET USERS]', err.message);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// GET /api/admin/users/:id
router.get('/users/:id', requireRoles(['Admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, email, name, employee_id, role, status, created_at,
                    designation, station, parentage_name, must_change_password, blockchain_address,
                    assigned_police_stations, fsl_jurisdiction_id, sessions_court_id, bar_enrollment_no
             FROM users WHERE id = $1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json({ user: rows[0] });
    } catch (err) {
        console.error('[ADMIN GET USER]', err.message);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// POST /api/admin/users
router.post('/users', requireRoles(['Admin']), async (req, res) => {
    const {
        name, email, employeeId, role, plainPassword, designation, station, parentageName,
        assignedPoliceStations, fslJurisdictionId, sessionsCourtId, barEnrollmentNo
    } = req.body;

    if (!name || !email || !employeeId || !role || !plainPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        
        const { generateWallet, encryptPrivateKey } = require('../crypto');
        const wallet = generateWallet();
        const encryptedKey = encryptPrivateKey(wallet.privateKey);

        const assignedStationsJson = Array.isArray(assignedPoliceStations) 
            ? JSON.stringify(assignedPoliceStations) 
            : (typeof assignedPoliceStations === 'string' && assignedPoliceStations.trim() 
                ? JSON.stringify(assignedPoliceStations.split(',').map(s => s.trim())) 
                : '[]');
        
        const { rows } = await pool.query(`
            INSERT INTO users (
                email, password_hash, name, employee_id, role, designation, station,
                parentage_name, blockchain_address, encrypted_private_key,
                assigned_police_stations, fsl_jurisdiction_id, sessions_court_id, bar_enrollment_no
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, email, name, employee_id, role, status, created_at, designation, station,
                      parentage_name, blockchain_address, assigned_police_stations,
                      fsl_jurisdiction_id, sessions_court_id, bar_enrollment_no
        `, [
            email, passwordHash, name, employeeId, role,
            designation || null, station || null, parentageName || null,
            wallet.address, encryptedKey,
            assignedStationsJson, fslJurisdictionId || null,
            sessionsCourtId || null, barEnrollmentNo || null
        ]);

        // Log USER_CREATED event
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code, target_label)
             VALUES ($1, $2, $3, $4, 'USER_CREATED', '/api/admin/users', $5, 201, $6)`,
            [req.user.id, req.user.name, req.user.role, req.user.employeeId, req.ip || '0.0.0.0', `Created user: ${name} (${employeeId}) [${role}]`]
        ).catch(() => {});

        res.status(201).json({ message: 'User created successfully', user: rows[0] });
    } catch (err) {
        console.error('[ADMIN CREATE USER]', err.message);
        if (err.code === '23505') { // Postgres unique_violation
            return res.status(409).json({ error: 'User with this email or Employee ID already exists' });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', requireRoles(['Admin']), async (req, res) => {
    const { id } = req.params;
    const {
        role, status, designation, station, parentageName,
        assignedPoliceStations, fslJurisdictionId, sessionsCourtId, barEnrollmentNo
    } = req.body;

    try {
        let updates = [];
        let values = [];
        let idx = 1;

        if (role !== undefined) {
            updates.push(`role = $${idx++}`);
            values.push(role);
        }
        if (status !== undefined) {
            updates.push(`status = $${idx++}`);
            values.push(status);
        }
        if (designation !== undefined) {
            updates.push(`designation = $${idx++}`);
            values.push(designation);
        }
        if (station !== undefined) {
            updates.push(`station = $${idx++}`);
            values.push(station);
        }
        if (parentageName !== undefined) {
            updates.push(`parentage_name = $${idx++}`);
            values.push(parentageName);
        }
        if (assignedPoliceStations !== undefined) {
            updates.push(`assigned_police_stations = $${idx++}`);
            const stationsVal = Array.isArray(assignedPoliceStations)
                ? JSON.stringify(assignedPoliceStations)
                : (typeof assignedPoliceStations === 'string' && assignedPoliceStations.trim()
                    ? JSON.stringify(assignedPoliceStations.split(',').map(s => s.trim()))
                    : '[]');
            values.push(stationsVal);
        }
        if (fslJurisdictionId !== undefined) {
            updates.push(`fsl_jurisdiction_id = $${idx++}`);
            values.push(fslJurisdictionId);
        }
        if (sessionsCourtId !== undefined) {
            updates.push(`sessions_court_id = $${idx++}`);
            values.push(sessionsCourtId);
        }
        if (barEnrollmentNo !== undefined) {
            updates.push(`bar_enrollment_no = $${idx++}`);
            values.push(barEnrollmentNo);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No update fields provided' });
        }

        values.push(id);
        const query = `
            UPDATE users SET ${updates.join(', ')} 
            WHERE id = $${idx} 
            RETURNING id, email, name, employee_id, role, status, designation, station,
                      assigned_police_stations, fsl_jurisdiction_id, sessions_court_id, bar_enrollment_no
        `;

        const { rows } = await pool.query(query, values);
        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        // Log USER_UPDATED event
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code, target_label)
             VALUES ($1, $2, $3, $4, 'USER_UPDATED', $5, $6, 200, $7)`,
            [req.user.id, req.user.name, req.user.role, req.user.employeeId, `/api/admin/users/${id}`, req.ip || '0.0.0.0', `Updated user: ${rows[0].name} (${rows[0].employee_id})`]
        ).catch(() => {});

        res.json({ message: 'User updated successfully', user: rows[0] });
    } catch (err) {
        console.error('[ADMIN UPDATE USER]', err.message);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', requireRoles(['Admin']), async (req, res) => {
    const { id } = req.params;
    const { plainPassword } = req.body;

    if (!plainPassword) {
        return res.status(400).json({ error: 'Plain password is required' });
    }

    try {
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        const { rows } = await pool.query(`
            UPDATE users SET password_hash = $1, must_change_password = TRUE
            WHERE id = $2
            RETURNING id, email, name, employee_id
        `, [passwordHash, id]);

        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        // Log PASSWORD_RESET event
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code, target_label)
             VALUES ($1, $2, $3, $4, 'PASSWORD_RESET', $5, $6, 200, $7)`,
            [req.user.id, req.user.name, req.user.role, req.user.employeeId, `/api/admin/users/${id}/reset-password`, req.ip || '0.0.0.0', `Password reset for: ${rows[0].name} (${rows[0].employee_id})`]
        ).catch(() => {});

        res.json({ message: 'Password reset successfully', user: rows[0] });
    } catch (err) {
        console.error('[ADMIN RESET PASSWORD]', err.message);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
