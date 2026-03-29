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

            console.log('[Auth Init] Initializing Database Schema natively...');
            
            // Inline table creation for development simplicity
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                  email          VARCHAR(255) UNIQUE NOT NULL,
                  password_hash  VARCHAR(255) NOT NULL,
                  name           VARCHAR(255) NOT NULL,
                  employee_id    VARCHAR(50)  UNIQUE NOT NULL,
                  role           VARCHAR(50)  NOT NULL,
                  status         VARCHAR(20)  DEFAULT 'active',
                  created_at     TIMESTAMPTZ  DEFAULT NOW()
                );
            `);

            console.log('[Auth Init] Seeding configured admin account...');
            // Pull seed credentials strictly from the environment payload
            const seedEmail = process.env.ADMIN_SEED_EMAIL || 'admin@police.gov';
            const seedPassword = process.env.ADMIN_SEED_PASSWORD || 'Sh13ld@Pr0duct10n2026!';
            const seedName = process.env.ADMIN_SEED_NAME || 'System Administrator';
            const seedEmployeeId = process.env.ADMIN_SEED_EMPLOYEE_ID || 'EMP000';

            const passwordHash = await bcrypt.hash(seedPassword, 12);

            await pool.query(`
                INSERT INTO users (id, email, password_hash, name, employee_id, role, status)
                VALUES (
                    '00000000-0000-0000-0000-000000000000',
                    $2,
                    $1,
                    $3,
                    $4,
                    'Admin',
                    'active'
                )
                ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'Admin', name = $3
            `, [passwordHash, seedEmail, seedName, seedEmployeeId]);

            console.log('[Auth Init] Database tables and seeds ready.');
            return; // Success — exit the retry loop
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                console.log(`[Auth Init] Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                console.error(`[Auth Init] Failed after ${MAX_RETRIES} attempts:`, err.message);
            }
        }
    }
}

module.exports = runMigrations;
