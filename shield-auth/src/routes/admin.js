const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// GET /api/admin/users
router.get('/users', requireRoles(['Super Admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, email, name, employee_id, role, status, created_at FROM users ORDER BY created_at DESC'
        );
        res.json({ users: rows });
    } catch (err) {
        console.error('[ADMIN GET USERS]', err.message);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST /api/admin/users
router.post('/users', requireRoles(['Super Admin']), async (req, res) => {
    const { name, email, employeeId, role, plainPassword } = req.body;

    if (!name || !email || !employeeId || !role || !plainPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        
        const { rows } = await pool.query(`
            INSERT INTO users (email, password_hash, name, employee_id, role)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, name, employee_id, role, status, created_at
        `, [email, passwordHash, name, employeeId, role]);

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
router.patch('/users/:id', requireRoles(['Super Admin']), async (req, res) => {
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

        res.json({ message: 'User updated successfully', user: rows[0] });
    } catch (err) {
        console.error('[ADMIN UPDATE USER]', err.message);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

module.exports = router;
