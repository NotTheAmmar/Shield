const express = require('express');
const cors = require('cors');
require('dotenv').config();

const runMigrations = require('./migrate');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const { startProvisionWorker } = require('./provision_worker');

const app = express();
const PORT = process.env.PORT || 4000;

// Trust the gateway proxy so req.ip resolves accurately (IP Masking Fix)
app.set('trust proxy', 1);

const cookieParser = require('cookie-parser');
app.use(cors({ origin: true, credentials: true })); // Locally allow Gateway proxy
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Native routing
const auth = require('./middleware/auth');
app.use('/api/auth', authRouter);
app.use('/api/admin', auth, adminRouter);

// Ensure DB is migrated BEFORE binding the port so no requests
// are ever served against missing tables.
async function start() {
    await runMigrations();
    app.listen(PORT, () => {
        console.log(`Auth Service running on port ${PORT}`);
    });
    // Start background queue processors after the server is live
    startProvisionWorker();
}

start();

// Graceful shutdown — release Postgres pool
process.on('SIGTERM', async () => {
    console.log('SIGTERM received — closing pg pool');
    await pool.end();
    process.exit(0);
});
