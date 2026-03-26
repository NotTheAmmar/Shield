const express = require('express');
const cors = require('cors');
require('dotenv').config();

const auth = require('./middleware/auth');
const audit = require('./middleware/audit');
const evidenceRoutes = require('./routes/evidence');
const firRoutes = require('./routes/fir');
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

app.use('/api/evidence', auth, evidenceRoutes);
app.use('/api/fir', auth, firRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/audit', auth, auditRoutes);

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
    const sqlPath = path.join(__dirname, '..', 'migrations', 'init.sql');
    if (!fs.existsSync(sqlPath)) {
        console.log('[Migration] No init.sql found, skipping.');
        return;
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await pool.query('SELECT 1'); // Test connection
            await pool.query(sql);
            console.log('[Migration] Database tables ready.');
            return;
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                console.log(`[Migration] Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                console.error('[Migration] Failed after all retries:', err.message);
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
