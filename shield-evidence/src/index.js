const express = require('express');
const cors = require('cors');
require('dotenv').config();

const auth = require('./middleware/auth');
const audit = require('./middleware/audit');
const evidenceRoutes = require('./routes/evidence');
const firRoutes = require('./routes/fir');
const certificateRoutes = require('./routes/certificate');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

// Health check
// Trust proxy ONLY for localhost and standard Docker bridge subnets to prevent X-Forwarded-For spoofing
app.set('trust proxy', ['loopback', '172.16.0.0/12', '192.168.0.0/16', '10.0.0.0/8']);

// Global API Audit Logger must fire for EVERY request (including unauthenticated ones)
app.use(audit);

// Health check (Public/Unauthenticated)
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// API routes (Protected by JWT)
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes = require('./routes/audit');
const reportRoutes = require('./routes/reports');

app.use('/api/evidence', auth, evidenceRoutes);
app.use('/api/fir', auth, firRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/audit', auth, auditRoutes);
app.use('/api/reports', auth, reportRoutes);
app.use('/api/evidence-source', auth, certificateRoutes);

// Process-level monitors to catch fatal crashes that evade the Express event loop
process.on('uncaughtException', (err) => {
    console.error('FATAL: Uncaught Exception crashed the server:', err);
    process.exit(1); // Ensure PM2/Docker captures the death and restarts
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL: Unhandled Promise Rejection:', reason);
    process.exit(1);
});

// Auto-migrate: create tables if they don't exist
const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runMigrations() {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await pool.query('SELECT 1'); // Test connection
            
            // Inline Database Table Definitions for Evidence tracking
            await pool.query(`
                CREATE TABLE IF NOT EXISTS fir (
                  id                UUID         PRIMARY KEY,
                  case_category     VARCHAR(100) DEFAULT '',
                  description       TEXT         DEFAULT '',
                  location          VARCHAR(255) DEFAULT '',
                  reporting_officer TEXT         NOT NULL,
                  fir_number        VARCHAR(100) DEFAULT '',
                  status            VARCHAR(50)  DEFAULT 'OPEN',
                  filename          VARCHAR(255),
                  bucket_name       VARCHAR(100),
                  object_key        VARCHAR(500),
                  sha256_hash       VARCHAR(64),
                  mime_type         VARCHAR(100),
                  file_size         BIGINT,
                  ledger_tx_id      TEXT,
                  ledger_timestamp  TIMESTAMPTZ,
                  registered_at     TIMESTAMPTZ  DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS evidence (
                  id           UUID         PRIMARY KEY,
                  fir_id       UUID         REFERENCES fir(id) NOT NULL,
                  filename     VARCHAR(255) NOT NULL,
                  bucket_name  VARCHAR(100) NOT NULL,
                  object_key   VARCHAR(500) NOT NULL,
                  sha256_hash  VARCHAR(64)  NOT NULL,
                  uploaded_by  TEXT,
                  uploaded_at  TIMESTAMPTZ  DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS audit_log (
                  id           SERIAL       PRIMARY KEY,
                  evidence_id  UUID         REFERENCES evidence(id),
                  action       VARCHAR(50),
                  result       VARCHAR(20),
                  actor_id     TEXT,
                  checked_at   TIMESTAMPTZ  DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS api_audit_log (
                  id                SERIAL PRIMARY KEY,
                  user_id           TEXT,
                  user_name         TEXT,
                  user_role         TEXT,
                  user_employee_id  TEXT,
                  method            VARCHAR(10) NOT NULL,
                  endpoint          VARCHAR(255) NOT NULL,
                  ip_address        VARCHAR(45) NOT NULL,
                  status_code       INT NOT NULL,
                  accessed_at       TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS report_jobs (
                  id            UUID        PRIMARY KEY,
                  evidence_id   UUID        REFERENCES evidence(id),
                  status        VARCHAR(20) DEFAULT 'QUEUED',
                  download_url  TEXT,
                  created_at    TIMESTAMPTZ DEFAULT NOW(),
                  completed_at  TIMESTAMPTZ
                );

                CREATE TABLE IF NOT EXISTS evidence_metadata (
                  id             SERIAL      PRIMARY KEY,
                  evidence_id    UUID        REFERENCES evidence(id) UNIQUE,
                  gps_location   GEOMETRY(Point, 4326),
                  camera_make    VARCHAR(100),
                  camera_model   VARCHAR(100),
                  original_date  TIMESTAMPTZ,
                  file_size      BIGINT,
                  mime_type      VARCHAR(100),
                  all_metadata   JSONB,
                  processed_at   TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS evidence_forensic_log (
                  id           SERIAL       PRIMARY KEY,
                  evidence_id  UUID         REFERENCES evidence(id),
                  flags        TEXT[],
                  details      JSONB,
                  actor        TEXT,
                  logged_at    TIMESTAMPTZ  DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS evidence_source (
                  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                  source_type           VARCHAR(100) NOT NULL,
                  make                  VARCHAR(100),
                  model                 VARCHAR(100),
                  serial_number         VARCHAR(100),
                  identifiers           TEXT,
                  device_chain          JSONB,
                  lawful_control        BOOLEAN      NOT NULL,
                  proper_operation      BOOLEAN      NOT NULL,
                  ownership_status      VARCHAR(100),
                  certificate_status    VARCHAR(50)  DEFAULT 'PENDING_PART_A',
                  signed_cert_file_path VARCHAR(500),
                  created_at            TIMESTAMPTZ  DEFAULT NOW()
                );
            `);

            // Idempotent: data migration for legacy pending status
            await pool.query(`
                ALTER TABLE evidence_source ALTER COLUMN certificate_status SET DEFAULT 'PENDING_PART_A';
                UPDATE evidence_source 
                SET certificate_status = 'PENDING_PART_A' 
                WHERE certificate_status = 'pending';
            `);

            // Idempotent: add columns if missing (older DB volumes)
            await pool.query(`
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS jurisdiction_id VARCHAR(100);
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS filename VARCHAR(255);
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS bucket_name VARCHAR(100);
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS object_key VARCHAR(500);
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR(64);
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS file_size BIGINT;
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS ledger_tx_id TEXT;
                ALTER TABLE fir ADD COLUMN IF NOT EXISTS ledger_timestamp TIMESTAMPTZ;
            `);
            await pool.query(`
                ALTER TABLE evidence_metadata ADD COLUMN IF NOT EXISTS all_metadata JSONB;
            `);
            await pool.query(`
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other';
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS file_size BIGINT;
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS ledger_tx_id TEXT;
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS ledger_timestamp TIMESTAMPTZ;
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS uploader_name TEXT;
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS uploader_employee_id TEXT;
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
                ALTER TABLE evidence ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES evidence_source(id);
            `);
            await pool.query(`
                ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS user_name TEXT;
                ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS user_role TEXT;
                ALTER TABLE api_audit_log ADD COLUMN IF NOT EXISTS user_employee_id TEXT;
            `);
            
            console.log('[Init] Database schemas (FIR, Evidence, Audit) ready.');
            return;
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                console.log(`[Init] Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                console.error('[Init] Failed after all retries:', err.message);
            }
        }
    }
}
// Ensure MinIO bucket exists
const { minioInternal, BUCKET } = require('./config/minio');

async function ensureMinioBucket() {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const exists = await minioInternal.bucketExists(BUCKET);
            if (!exists) {
                await minioInternal.makeBucket(BUCKET);
                console.log(`[MinIO] Created bucket: ${BUCKET}`);
            } else {
                console.log(`[MinIO] Bucket '${BUCKET}' exists.`);
            }
            return;
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                console.log(`[MinIO] Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                console.error('[MinIO] Failed to ensure bucket after all retries:', err.message);
            }
        }
    }
}

// Start server AFTER migrations + bucket check
runMigrations()
    .then(() => ensureMinioBucket())
    .then(() => {
        app.listen(PORT, () => console.log(`Evidence Service running on port ${PORT}`));
    }).catch((err) => {
        console.error('Failed to start:', err);
        process.exit(1);
    });

// Graceful shutdown — release Postgres pool
process.on('SIGTERM', async () => {
    console.log('SIGTERM received — closing pg pool');
    await pool.end();
    process.exit(0);
});
