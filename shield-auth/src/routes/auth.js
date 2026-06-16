const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const ROLE_MAP = {
  'police_officer': 'police_officer',
  'Police Officer': 'police_officer',
  'judicial_authority': 'judicial_authority',
  'Judicial Authority': 'judicial_authority',
  'admin': 'admin',
  'Admin': 'admin'
};

const normalizeRole = (role) => ROLE_MAP[role] || role?.toLowerCase();

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ error: 'email, password, and role are required.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        console.log(`[AUTH DEBUG] Login attempt: email=${email}, role=${role}`);
        console.log(`[AUTH DEBUG] User found: ${rows.length > 0}`);

        const user = rows[0];

        if (!user || normalizeRole(user.role) !== normalizeRole(role)) {
            return res.status(401).json({ error: 'Invalid credentials or incorrect role selected.' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        console.log(`[AUTH DEBUG] Password valid: ${isValidPassword}`);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials or incorrect role selected.' });
        }

        if (user.status === 'deactivated') {
            return res.status(403).json({ error: 'Your account has been deactivated. Contact the administrator.' });
        }

        // Try to log the event to API audit log (fire and forget)
        const ip = req.ip || '0.0.0.0';
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code) 
             VALUES ($1, $2, $3, $4, 'LOGIN', '/api/auth/login', $5, 200)`,
            [user.id, user.name, user.role, user.employee_id, ip]
        ).catch(() => {});

        const payload = {
            id: user.id,
            email: user.email,
            role: normalizeRole(user.role),
            name: user.name,
            employeeId: user.employee_id
        };

        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        const isProd = process.env.NODE_ENV === 'production';
        const baseCookieOps = { httpOnly: true, secure: isProd, sameSite: 'Strict' };

        res.cookie('shield_access_token', accessToken, { ...baseCookieOps, maxAge: 15 * 60 * 1000 });
        res.cookie('shield_refresh_token', refreshToken, { ...baseCookieOps, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh' });

        // Include mustChangePassword in the response so the frontend can gate access
        return res.json({ user: { ...payload, mustChangePassword: user.must_change_password === true }, token: accessToken });
    } catch (err) {
        console.error('[AUTH LOGIN]', err.message);
        return res.status(500).json({ error: 'Internal server error during login' });
    }
});

router.get('/me', (req, res) => {
    const token = req.cookies?.shield_access_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return res.json({ user: decoded });
    } catch {
        return res.status(401).json({ error: 'Token expired' });
    }
});

router.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies?.shield_refresh_token;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
    
    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        
        // Ensure user is still active to prevent revoked users from lingering
        const { rows } = await pool.query('SELECT status FROM users WHERE id = $1', [decoded.id]);
        if (!rows.length || rows[0].status !== 'active') throw new Error('User inactive');
        
        const payload = {
            id: decoded.id,
            email: decoded.email,
            role: normalizeRole(decoded.role),
            name: decoded.name,
            employeeId: decoded.employeeId
        };
        
        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
        const isProd = process.env.NODE_ENV === 'production';
        
        res.cookie('shield_access_token', accessToken, { httpOnly: true, secure: isProd, sameSite: 'Strict', maxAge: 15 * 60 * 1000 });
        return res.json({ message: 'Token successfully refreshed' });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
});

router.post('/logout', (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    const baseCookieOps = { httpOnly: true, secure: isProd, sameSite: 'Strict' };

    // Try to log logout event using the access token cookie
    try {
        const token = req.cookies?.shield_access_token;
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const ip = req.ip || '0.0.0.0';
            pool.query(
                `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code)
                 VALUES ($1, $2, $3, $4, 'LOGOUT', '/api/auth/logout', $5, 200)`,
                [decoded.id, decoded.name, decoded.role, decoded.employeeId, ip]
            ).catch(() => {});
        }
    } catch {}

    res.clearCookie('shield_access_token', baseCookieOps);
    res.clearCookie('shield_refresh_token', { ...baseCookieOps, path: '/api/auth/refresh' });
    res.json({ message: 'Logged out successfully.' });
});

/**
 * POST /api/auth/change-password
 * Requires valid HttpOnly access-token cookie (user is already "logged in").
 * Body: { currentPassword, newPassword }
 * On success: clears the must_change_password flag and returns updated user info.
 */
router.post('/change-password', async (req, res) => {
    const token = req.cookies?.shield_access_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Token expired or invalid' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        const user = rows[0];

        if (!user) return res.status(404).json({ error: 'User not found.' });

        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'New password must be different from the current password.' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);

        await pool.query(
            'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
            [newHash, decoded.id]
        );

        return res.json({ message: 'Password changed successfully.', mustChangePassword: false });
    } catch (err) {
        console.error('[AUTH CHANGE-PASSWORD]', err.message);
        return res.status(500).json({ error: 'Internal server error during password change.' });
    }
});

// GET /api/auth/audit — Returns auth-side audit events (login, logout, user management)
router.get('/audit', async (req, res) => {
    // Manual JWT check since this route isn't behind the auth middleware wrapper
    const token = req.cookies?.shield_access_token ||
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    let caller;
    try {
        caller = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    if (!['admin', 'judicial_authority'].includes(normalizeRole(caller.role))) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { userId, action, limit = 100 } = req.query;

    try {
        const conditions = [`al.method IN ('LOGIN', 'LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'PASSWORD_RESET')`];
        const values = [];
        let idx = 1;

        if (userId) {
            conditions.push(`al.user_id = $${idx++}`);
            values.push(userId);
        }
        if (action) {
            conditions.push(`al.method = $${idx++}`);
            values.push(action);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const { rows } = await pool.query(
            `SELECT 
                al.id::text,
                al.method as action,
                CASE WHEN al.status_code < 400 THEN 'success' ELSE 'failed' END as result,
                al.user_id as actor_id,
                al.user_name,
                al.user_role,
                al.user_employee_id,
                al.accessed_at as timestamp,
                CASE al.method
                    WHEN 'LOGIN' THEN 'User logged in'
                    WHEN 'LOGOUT' THEN 'User logged out'
                    WHEN 'USER_CREATED' THEN 'New user account created'
                    WHEN 'USER_UPDATED' THEN 'User account updated'
                    WHEN 'PASSWORD_RESET' THEN 'Password was reset by admin'
                    ELSE al.method
                END as "targetLabel",
                NULL as "targetId",
                'auth' as "targetType"
             FROM api_audit_log al
             ${where}
             ORDER BY al.accessed_at DESC
             LIMIT $${idx}`,
            [...values, parseInt(limit) || 100]
        );
        res.json({ auditLog: rows });
    } catch (err) {
        console.error('[AUTH AUDIT]', err.message);
        res.status(500).json({ error: 'Failed to fetch auth audit log' });
    }
});

module.exports = router;
