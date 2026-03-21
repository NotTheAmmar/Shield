const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db');

async function runMigrations() {
    try {
        console.log('[Auth Migration] Running init.sql...');
        const initSql = fs.readFileSync(path.join(__dirname, '../migrations/init.sql'), 'utf-8');
        await pool.query(initSql);
        
        console.log('[Auth Migration] Seeding default admin...');
        // Hash the seed password
        const passwordHash = await bcrypt.hash('password123', 10);
        
        // Seed the super admin if not exists
        await pool.query(`
            INSERT INTO users (id, email, password_hash, name, employee_id, role, status)
            VALUES (
                '00000000-0000-0000-0000-000000000000',
                'admin@police.gov',
                $1,
                'Super Administrator',
                'EMP000',
                'Super Admin',
                'active'
            )
            ON CONFLICT (email) DO NOTHING
        `, [passwordHash]);

        console.log('[Auth Migration] Database tables and seeds ready.');
    } catch (err) {
        console.error('[Auth Migration] Failed:', err.message);
    }
}

module.exports = runMigrations;
