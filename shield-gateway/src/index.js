/**
 * SHIELD API Gateway — Express Server
 *
 * Routes all /api/* requests.
 * - /api/fir/* and /api/evidence/* → proxied to shield-evidence via native http
 * - All other /api/* → served locally with mock data
 */

'use strict';

const express = require('express');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

const EVIDENCE_HOST = process.env.EVIDENCE_HOST || 'shield-evidence';
const EVIDENCE_PORT = process.env.EVIDENCE_PORT || 4001;

const AUTH_HOST = process.env.AUTH_HOST || 'shield-auth';
const AUTH_PORT = process.env.AUTH_PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────

// CORS removed — Nginx enforces Same-Origin architecture on port 80

// ── JWT decoding & Cookie Translation middleware (runs for ALL routes) ─────────

app.use((req, res, next) => {
  let authHeader = req.headers.authorization;
  
  // NGINX SECURITY UPGRADE: If HttpOnly cookie exists, convert it to a Bearer token
  // allowing native browser downloads and internal microservices to process it natively
  if (!authHeader && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    const accessCookie = cookies.find(c => c.startsWith('shield_access_token='));
    if (accessCookie) {
      const token = accessCookie.split('=')[1];
      req.headers['authorization'] = `Bearer ${token}`; // Inject for downstream proxies
      authHeader = req.headers['authorization'];
    }
  }

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

// ── ZERO-TRUST SECURITY ENFORCEMENT GUARD ─────────────────────────────────
// Under BSA 2023 & BNSS 2023, Administrators are strictly isolated from legal case data.
// They have zero access to FIR narratives, evidence files, or Section 63 certificates.
app.use((req, res, next) => {
  if (req.user && req.user.role) {
    const role = req.user.role.toLowerCase().replace(/[\s_]/g, '');
    if (role === 'admin') {
      const path = req.path.toLowerCase();
      // Internal system watchdog endpoints (/api/evidence/internal/*) are authorized for Admin infrastructure health & integrity monitoring
      if (path.startsWith('/api/evidence/internal')) {
        return next();
      }

      // Drop any legal case viewing / downloading / uploading request initiated by an Admin
      const isRestrictedCasePath = 
        path.startsWith('/api/fir') || 
        path.startsWith('/api/evidence') || 
        path.startsWith('/api/evidence-source') ||
        path.startsWith('/api/reports') ||
        path.startsWith('/api/judicial') ||
        path.startsWith('/api/judge') ||
        path.startsWith('/api/advocate');

      if (isRestrictedCasePath) {
        console.warn(`[ZERO-TRUST VIOLATION BLOCKED] Admin (${req.user.employeeId || req.user.email}) attempted to access legal case data: ${req.method} ${req.originalUrl}`);
        return res.status(403).json({
          error: 'Zero-Trust Policy Violation: Administrators are restricted exclusively to infrastructure and user onboarding. Direct access to criminal FIR narratives, evidence files, and certificates is strictly prohibited under legal chain of custody rules (Bharatiya Sakshya Adhiniyam, 2023).',
          code: 'ZERO_TRUST_RESTRICTION'
        });
      }
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
    path: req.originalUrl,
    method: req.method,
    headers: { 
      ...req.headers, 
      host: `${EVIDENCE_HOST}:${EVIDENCE_PORT}`,
      'x-forwarded-for': req.ip || req.connection.remoteAddress
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error - Evidence]', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Evidence service unavailable', details: err.message });
    }
  });

  if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(req.method)) {
    proxyReq.end();
  } else {
    req.pipe(proxyReq, { end: true });
  }
}

function proxyToAuth(req, res) {
  const options = {
    hostname: AUTH_HOST,
    port: AUTH_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: { 
      ...req.headers, 
      host: `${AUTH_HOST}:${AUTH_PORT}`,
      'x-forwarded-for': req.ip || req.connection.remoteAddress
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error - Auth]', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Auth service unavailable', details: err.message });
    }
  });

  if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(req.method)) {
    proxyReq.end();
  } else {
    req.pipe(proxyReq, { end: true });
  }
}

// These routes MUST come BEFORE express.json() so the body stream is intact
app.use('/api/fir', proxyToEvidence);
app.use('/api/evidence', proxyToEvidence);
app.use('/api/judicial', proxyToEvidence);
app.use('/api/judge', proxyToEvidence);
app.use('/api/advocate', proxyToEvidence);

app.use('/api/dashboard', proxyToEvidence);
app.use('/api/audit', proxyToEvidence);
app.use('/api/reports', proxyToEvidence);
app.use('/api/evidence-source', proxyToEvidence);

app.use('/api/auth', proxyToAuth);
app.use('/api/admin', proxyToAuth);

// ── Local Mock API Routes ─────────────────────────────────────────────────
// ALL MOCK ROUTES HAVE BEEN DELETED. 100% NATIVE MICROSERVICE ROUTING ACTIVE.

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
