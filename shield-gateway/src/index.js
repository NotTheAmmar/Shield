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
const { createProxyMiddleware } = require('http-proxy-middleware');

const authRouter = require('./routes/auth');
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
      'POST   /api/fir/create',
      'GET    /api/evidence',
      'POST   /api/evidence/upload',
      'GET    /api/evidence/verify/:id',
      'GET    /api/evidence/download/:id',
      'GET    /api/firs   (mock)',
      'GET    /api/audit',
      'GET    /api/admin/users',
      'POST   /api/admin/users',
      'PATCH  /api/admin/users/:id',
    ],
  });
});

// ── PROXY ROUTES (MUST come BEFORE body parsers!) ─────────────────────────
// http-proxy-middleware needs the raw, unparsed request body to forward.
// If express.json() runs first, it consumes the body stream and the proxy
// sends an empty body to the backend.

const EVIDENCE_URL = process.env.EVIDENCE_SERVICE_URL || 'http://shield-evidence:4001';

const evidenceProxy = createProxyMiddleware({
  target: EVIDENCE_URL,
  changeOrigin: true,
  // Log proxy errors for debugging
  on: {
    error: (err, req, res) => {
      console.error('[Proxy Error]', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Evidence service unavailable', details: err.message });
      }
    },
    proxyReq: (proxyReq, req) => {
      console.log(`[Proxy] ${req.method} ${req.originalUrl} → ${EVIDENCE_URL}${req.originalUrl}`);
    },
  },
});

// Forward /api/fir/* and /api/evidence/* directly to shield-evidence
app.use('/api/fir', evidenceProxy);
app.use('/api/evidence', evidenceProxy);

// Legacy /api/firs/* → rewrite to /api/fir/* on the evidence service
const firsMockRouter = require('./routes/firs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/firs', firsMockRouter);

// ── LOCAL MOCK API Routes (use body parsers) ──────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
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
