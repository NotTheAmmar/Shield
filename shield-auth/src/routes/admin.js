const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');
const { generateWallet } = require('../cryptoUtils');

const router = express.Router();

// GET /api/admin/users
router.get('/users', requireRoles(['admin', 'Admin']), async (req, res) => {
    try {
        const { search, role, status } = req.query;
        const conditions = [];
        const values = [];
        let idx = 1;

        if (search) {
            conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx})`);
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
                    designation, station, must_change_password
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
router.get('/users/:id', requireRoles(['admin', 'Admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, email, name, employee_id, role, status, created_at,
                    designation, station, must_change_password
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
router.post('/users', requireRoles(['admin', 'Admin']), async (req, res) => {
    const { name, email, employeeId, role, plainPassword, designation, station } = req.body;

    if (!name || !email || !employeeId || !role || !plainPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        
        // Generate secure random Ethereum wallet and instantly encrypt the private key
        const walletInfo = generateWallet();
        
        const { rows } = await pool.query(`
            INSERT INTO users (email, password_hash, name, employee_id, role, designation, station, blockchain_address, encrypted_private_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, email, name, employee_id, role, status, created_at, designation, station, blockchain_address
        `, [email, passwordHash, name, employeeId, role, designation || null, station || null, walletInfo.address, walletInfo.encryptedPrivateKey]);

        // Log USER_CREATED event
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code)
             VALUES ($1, $2, $3, $4, 'USER_CREATED', '/api/admin/users', $5, 201)`,
            [req.user.id, req.user.name, req.user.role, req.user.employeeId, req.ip || '0.0.0.0']
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
router.patch('/users/:id', requireRoles(['admin', 'Admin']), async (req, res) => {
    const { id } = req.params;
    const { role, status } = req.body;

    try {
        if (!role && !status) {
            return res.status(400).json({ error: 'Must provide role or status to update' });
        }

        let updates = [];
        let values = [];
        let idx = 1;

        if (role) {
            updates.push(`role = $${idx++}`);
            values.push(role);
        }
        if (status) {
            updates.push(`status = $${idx++}`);
            values.push(status);
        }

        values.push(id);
        const query = `
            UPDATE users SET ${updates.join(', ')} 
            WHERE id = $${idx} 
            RETURNING id, email, name, employee_id, role, status
        `;

        const { rows } = await pool.query(query, values);
        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        // Log USER_UPDATED event
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code)
             VALUES ($1, $2, $3, $4, 'USER_UPDATED', $5, $6, 200)`,
            [req.user.id, req.user.name, req.user.role, req.user.employeeId, `/api/admin/users/${id}`, req.ip || '0.0.0.0']
        ).catch(() => {});

        res.json({ message: 'User updated successfully', user: rows[0] });
    } catch (err) {
        console.error('[ADMIN UPDATE USER]', err.message);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', requireRoles(['admin', 'Admin']), async (req, res) => {
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
            RETURNING id, email
        `, [passwordHash, id]);

        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        // Log PASSWORD_RESET event
        pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, user_employee_id, method, endpoint, ip_address, status_code)
             VALUES ($1, $2, $3, $4, 'PASSWORD_RESET', $5, $6, 200)`,
            [req.user.id, req.user.name, req.user.role, req.user.employeeId, `/api/admin/users/${id}/reset-password`, req.ip || '0.0.0.0']
        ).catch(() => {});

        res.json({ message: 'Password reset successfully', user: rows[0] });
    } catch (err) {
        console.error('[ADMIN RESET PASSWORD]', err.message);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
