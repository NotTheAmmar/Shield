const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db');

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMigrations() {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Test the connection first
            await pool.query('SELECT 1');

            console.log('[Auth Migration] Running init.sql...');
            const initSql = fs.readFileSync(path.join(__dirname, '../migrations/init.sql'), 'utf-8');
            await pool.query(initSql);

            console.log('[Auth Migration] Seeding default admin...');
            const seedPassword = process.env.ADMIN_SEED_PASSWORD || 'password123';
            const passwordHash = await bcrypt.hash(seedPassword, 12);

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
                ON CONFLICT (email) DO UPDATE SET password_hash = $1
            `, [passwordHash]);

            console.log('[Auth Migration] Database tables and seeds ready.');
            return; // Success — exit the retry loop
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                console.log(`[Auth Migration] Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                console.error(`[Auth Migration] Failed after ${MAX_RETRIES} attempts:`, err.message);
            }
        }
    }
}

module.exports = runMigrations;
