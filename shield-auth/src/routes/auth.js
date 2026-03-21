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

        // Generate the real JWT matching the frontend expectation
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                employeeId: user.employee_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                employeeId: user.employee_id,
                role: user.role,
                status: user.status
            }
        });
    } catch (err) {
        console.error('[AUTH LOGIN]', err.message);
        return res.status(500).json({ error: 'Internal server error during login' });
    }
});

router.post('/logout', (req, res) => {
    // JWTs are stateless; clearing from frontend finishes the logout flow.
    res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
