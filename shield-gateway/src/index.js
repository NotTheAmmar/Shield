/**
 * SHIELD API Gateway — Express Server
 *
 * Routes all /api/* requests.
 * - /api/fir/* and /api/evidence/* → proxied to shield-evidence via native http
 * - All other /api/* → served locally with mock data
 */

'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http');

const authRouter = require('./routes/auth');
const firsMockRouter = require('./routes/firs');
const evidenceMockRouter = require('./routes/evidence');
const auditRouter = require('./routes/audit');
const adminRouter = require('./routes/admin');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3001;

const EVIDENCE_HOST = process.env.EVIDENCE_HOST || 'shield-evidence';
const EVIDENCE_PORT = process.env.EVIDENCE_PORT || 4001;

// ── Middleware ────────────────────────────────────────────────────────────

app.use(cors({
  origin: true,
  credentials: true,
}));

// ── JWT decoding middleware (runs for ALL routes) ─────────────────────────

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
      // Invalid token
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
  });
});

// ── Native HTTP Proxy to shield-evidence ──────────────────────────────────
// Uses raw Node.js http.request to forward requests without any third-party
// dependencies. This avoids the http-proxy-middleware v2/v3 API migration
// issues that were crashing the gateway container.

function proxyToEvidence(req, res) {
  const options = {
    hostname: EVIDENCE_HOST,
    port: EVIDENCE_PORT,
    path: req.originalUrl,         // preserves full path like /api/fir/create
    method: req.method,
    headers: { ...req.headers, host: `${EVIDENCE_HOST}:${EVIDENCE_PORT}` },
  };

  console.log(`[Proxy] ${req.method} ${req.originalUrl} → http://${EVIDENCE_HOST}:${EVIDENCE_PORT}${req.originalUrl}`);

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Evidence service unavailable', details: err.message });
    }
  });

  // Pipe the raw request body (including multipart/form-data) directly
  req.pipe(proxyReq, { end: true });
}

// These routes MUST come BEFORE express.json() so the body stream is intact
app.use('/api/fir', proxyToEvidence);
app.use('/api/evidence/upload', proxyToEvidence);
app.use('/api/evidence/verify', proxyToEvidence);
app.use('/api/evidence/download', proxyToEvidence);
app.use('/api/evidence/internal', proxyToEvidence);

// ── Body parsers (only for local mock routes below) ───────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Local Mock API Routes ─────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/firs', firsMockRouter);           // mock FIR list/detail
app.use('/api/evidence', evidenceMockRouter);    // mock evidence list/detail
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
  console.log(`[Proxy Target] Evidence service at http://${EVIDENCE_HOST}:${EVIDENCE_PORT}`);
});
