/**
 * SHIELD API Gateway — Express Server
 *
 * Routes all /api/* requests. Currently serves mock data from mockData.js.
 * When real modules come online, replace mock handlers with proxy calls.
 *
 * Proxy targets (configured via env vars):
 *   AUTH_SERVICE_URL    → default http://shield-auth:4000
 *   EVIDENCE_SERVICE_URL → default http://shield-evidence:4001
 *   LEDGER_SERVICE_URL  → default http://shield-ledger:4002
 */

'use strict';

const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const firRouter = require('./routes/firs');
const evidenceRouter = require('./routes/evidence');
const auditRouter = require('./routes/audit');
const adminRouter = require('./routes/admin');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────

app.use(cors({
  origin: true, // Allow all origins in dev; lock down in production
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── JWT decoding middleware ───────────────────────────────────────────────
// Decodes the Bearer token and attaches req.user.
// Does NOT verify the signature (mock JWTs). Real modules do real verification.

app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
        req.user = JSON.parse(payload);
      }
    } catch {
      // Invalid token — leave req.user undefined; routes can guard as needed
    }
  }
  next();
});

// ── Health / status ───────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    service: 'SHIELD API Gateway',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    routes: [
      'POST   /api/auth/login',
      'POST   /api/auth/logout',
      'GET    /api/dashboard/stats',
      'GET    /api/firs',
      'POST   /api/firs',
      'GET    /api/firs/:id',
      'POST   /api/firs/:id/verify',
      'GET    /api/firs/:id/download',
      'GET    /api/evidence',
      'POST   /api/evidence',
      'GET    /api/evidence/:id',
      'POST   /api/evidence/:id/verify',
      'GET    /api/evidence/:id/download',
      'GET    /api/audit',
      'GET    /api/admin/users',
      'POST   /api/admin/users',
      'PATCH  /api/admin/users/:id',
    ],
  });
});

// ── API Routes ────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/firs', firRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/audit', auditRouter);
app.use('/api/admin', adminRouter);

// ── 404 handler ───────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Gateway Error]', err.message);
  res.status(500).json({ error: 'Internal gateway error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SHIELD Gateway] Running on http://0.0.0.0:${PORT}`);
});
