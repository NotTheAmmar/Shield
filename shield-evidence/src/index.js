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
app.use('/api/evidence', auth, evidenceRoutes);
app.use('/api/fir', auth, firRoutes);

// Process-level monitors to catch fatal crashes that evade the Express event loop
process.on('uncaughtException', (err) => {
    console.error('FATAL: Uncaught Exception crashed the server:', err);
    process.exit(1); // Ensure PM2/Docker captures the death and restarts
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL: Unhandled Promise Rejection:', reason);
    process.exit(1);
});

// Start server
app.listen(PORT, () => console.log(`Evidence Service running on port ${PORT}`));

// Graceful shutdown — release Postgres pool
process.on('SIGTERM', async () => {
    console.log('SIGTERM received — closing pg pool');
    await pool.end();
    process.exit(0);
});
