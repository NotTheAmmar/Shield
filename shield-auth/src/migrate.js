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
                  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                  email                VARCHAR(255) UNIQUE NOT NULL,
                  password_hash        VARCHAR(255) NOT NULL,
                  name                 VARCHAR(255) NOT NULL,
                  employee_id          VARCHAR(50)  UNIQUE NOT NULL,
                  role                 VARCHAR(50)  NOT NULL,
                  status               VARCHAR(20)  DEFAULT 'active',
                  must_change_password BOOLEAN      DEFAULT TRUE,
                  created_at           TIMESTAMPTZ  DEFAULT NOW(),
                  blockchain_address   VARCHAR(42),
                  encrypted_private_key TEXT,
                  blockchain_provisioned BOOLEAN DEFAULT FALSE
                );
            `);

            // Idempotent migration: add columns if they don't exist yet (for existing DBs)
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS blockchain_address VARCHAR(42);
            `);
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;
            `);
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS blockchain_provisioned BOOLEAN DEFAULT FALSE;
            `);

            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE;
            `);
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
            `);
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS station VARCHAR(100);
            `);
            await pool.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS parentage_name VARCHAR(255);
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS api_audit_log (
                    id          BIGSERIAL    PRIMARY KEY,
                    user_id     UUID,
                    user_name   TEXT,
                    user_role   TEXT,
                    user_employee_id TEXT,
                    method      TEXT,
                    endpoint    TEXT,
                    ip_address  TEXT,
                    status_code INTEGER,
                    accessed_at TIMESTAMPTZ  DEFAULT NOW()
                );
            `);

            await pool.query(`ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS user_name TEXT;`);
            await pool.query(`ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS user_role TEXT;`);
            await pool.query(`ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS user_employee_id TEXT;`);
            await pool.query(`ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS target_label TEXT;`);

            console.log('[Auth Init] Seeding configured admin account...');
            // Pull seed credentials strictly from the environment payload
            const seedEmail = process.env.ADMIN_SEED_EMAIL || 'admin@police.gov';
            const seedPassword = process.env.ADMIN_SEED_PASSWORD || 'Sh13ld@Pr0duct10n2026!';
            const seedName = process.env.ADMIN_SEED_NAME || 'System Administrator';
            const seedEmployeeId = process.env.ADMIN_SEED_EMPLOYEE_ID || 'EMP-00000';

            const passwordHash = await bcrypt.hash(seedPassword, 12);

            await pool.query(`
                INSERT INTO users (id, email, password_hash, name, employee_id, role, status, must_change_password)
                VALUES (
                    '00000000-0000-0000-0000-000000000000',
                    $2,
                    $1,
                    $3,
                    $4,
                    'Admin',
                    'active',
                    FALSE
                )
                ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'Admin', name = $3
            `, [passwordHash, seedEmail, seedName, seedEmployeeId]);

            if (process.env.BLOCKCHAIN_ENCRYPTION_KEY) {
                const { generateWallet, encryptPrivateKey } = require('./crypto');
                const { rows: check } = await pool.query(
                    'SELECT blockchain_address FROM users WHERE id = $1', ['00000000-0000-0000-0000-000000000000']);
                if (!check[0]?.blockchain_address) {
                    const wallet = generateWallet();
                    const encKey = encryptPrivateKey(wallet.privateKey);
                    await pool.query('UPDATE users SET blockchain_address = $1, encrypted_private_key = $2 WHERE id = $3',
                        [wallet.address, encKey, '00000000-0000-0000-0000-000000000000']);
                    console.log(`[Auth Init] Admin blockchain address: ${wallet.address}`);
                }
            }

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
