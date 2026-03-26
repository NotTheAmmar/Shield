const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ error: 'email, password, and role are required.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = $2',
            [email, role]
        );

        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials or incorrect role selected.' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials or incorrect role selected.' });
        }

        if (user.status === 'deactivated') {
            return res.status(403).json({ error: 'Your account has been deactivated. Contact the administrator.' });
        }

        // Try to log the event to API audit log (fire and forget)
        const ip = req.ip || '0.0.0.0';
        pool.query(
            `INSERT INTO api_audit_log (user_id, method, endpoint, ip_address, status_code) 
             VALUES ($1, 'LOGIN', '/api/auth/login', $2, 200)`,
            [user.id, ip]
        ).catch(() => {}); // ignore if table doesn't exist yet

        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            employeeId: user.employee_id
        };

        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        const isProd = process.env.NODE_ENV === 'production';
        const baseCookieOps = { httpOnly: true, secure: isProd, sameSite: 'Strict' };

        res.cookie('shield_access_token', accessToken, { ...baseCookieOps, maxAge: 15 * 60 * 1000 });
        res.cookie('shield_refresh_token', refreshToken, { ...baseCookieOps, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh' });

        return res.json({ user: payload });
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
            role: decoded.role,
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
    
    res.clearCookie('shield_access_token', baseCookieOps);
    res.clearCookie('shield_refresh_token', { ...baseCookieOps, path: '/api/auth/refresh' });
    res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
