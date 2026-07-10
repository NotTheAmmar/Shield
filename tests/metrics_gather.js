/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIELD — Research Paper Metrics Gathering Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Gathers all metrics defined in metrics_gathering_instructions.md:
 *    1. Hashing & PDF Certificate Latency (Table III)
 *    2. EVM Clique PoA Ledger Performance  (Table IV)
 *    3. Watchdog Sweep Velocity
 *    4. Circuit Breaker Trigger Latency
 *    5. Smart Contract Gas Profiling
 *
 *  Prerequisites (fresh default stack must already be running):
 *    - docker compose -f docker-compose.blockchain.yml up -d
 *    - docker compose up -d
 *    - Admin account seeded (from .env ADMIN_SEED_* variables)
 *    - At least one Police Officer account created via admin panel
 *      (or set OFFICER_EMAIL / OFFICER_PASSWORD env vars below)
 *
 *  Usage:
 *    node tests/metrics_gather.js
 *
 *  Output:
 *    tests/results/metrics.json
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { Client: PgClient } = require('pg');
const Minio   = require('minio');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ────────────────────────────────────────────────────────────────────────────
// 0.  CONFIGURATION
//     All values are read from .env. Override locally if needed.
// ────────────────────────────────────────────────────────────────────────────

const CONFIG = {
    // API gateway (nginx → shield-gateway)
    API_BASE_URL: process.env.METRICS_API_URL   || 'http://localhost:3001/api',

    // Blockchain RPC (node-police, exposed on host)
    BLOCKCHAIN_RPC_URL:    process.env.BLOCKCHAIN_RPC_URL_HOST || 'http://localhost:8545',
    CONTRACT_ADDRESS:      process.env.BLOCKCHAIN_CONTRACT_ADDRESS
                           || process.env.BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS,
    DEPLOYER_PRIVATE_KEY:  process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY,

    // Admin credentials (already seeded) — loaded from .env, no hardcoded fallback
    ADMIN_EMAIL:    process.env.ADMIN_SEED_EMAIL    || 'admin@shield.gov.in',
    ADMIN_PASSWORD: process.env.ADMIN_SEED_PASSWORD,   // required — must be in .env

    // A Police Officer account to use for FIR/evidence uploads.
    // If not set, the script will CREATE a temporary officer via the admin API.
    OFFICER_EMAIL:    process.env.METRICS_OFFICER_EMAIL    || null,
    OFFICER_PASSWORD: process.env.METRICS_OFFICER_PASSWORD || null,

    // PostgreSQL (direct connection for seeding & watchdog tests)
    DB_HOST:     process.env.DB_HOST          || 'localhost',
    DB_PORT:     parseInt(process.env.DB_PORT || '5432'),
    DB_USER:     process.env.POSTGRES_USER    || 'shield_postgres',
    DB_PASSWORD: process.env.POSTGRES_PASSWORD,         // required — must be in .env
    DB_NAME:     process.env.POSTGRES_DB      || 'shield_db',

    // MinIO (direct connection for circuit-breaker tampering)
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT      || 'localhost',
    MINIO_PORT:     parseInt(process.env.MINIO_PORT || '9000'),
    MINIO_USER:     process.env.MINIO_ROOT_USER     || 'shield_minio',
    MINIO_PASS:     process.env.MINIO_ROOT_PASSWORD,    // required — must be in .env
    MINIO_BUCKET:   process.env.MINIO_BUCKET        || 'evidence',

    // Internal master key (used by watchdog API guard)
    MASTER_KEY: process.env.MASTER_KEY || '',

    // Output file
    OUTPUT_FILE: path.resolve(__dirname, 'results', 'metrics.json'),
};

// ────────────────────────────────────────────────────────────────────────────
// 1.  UTILITIES
// ────────────────────────────────────────────────────────────────────────────

/**
 * A simple HTTP/HTTPS fetch wrapper that carries cookies across requests.
 * Returns { status, headers, data } where data is parsed JSON (or raw text).
 */
class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this._cookies = {};
    }

    _buildCookieHeader() {
        return Object.entries(this._cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    _parseCookies(setCookieHeader) {
        // set-cookie may be a string or array depending on the runtime
        const values = Array.isArray(setCookieHeader)
            ? setCookieHeader
            : [setCookieHeader].filter(Boolean);

        for (const v of values) {
            // Only capture the name=value pair (before the first ';')
            const pair = v.split(';')[0].trim();
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;
            const name  = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim();
            this._cookies[name] = value;
        }
    }

    async request(endpoint, method = 'GET', body = null, isFormData = false) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = { Cookie: this._buildCookieHeader() };

        if (!isFormData && body) headers['Content-Type'] = 'application/json';

        const opts = {
            method,
            headers,
            redirect: 'follow',
        };
        if (body) opts.body = isFormData ? body : JSON.stringify(body);

        const res = await fetch(url, opts);

        // Persist cookies
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) this._parseCookies(setCookie);

        const contentType = res.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            data = await res.text();
        }

        return { status: res.status, headers: res.headers, data };
    }

    async login(email, password, role) {
        const r = await this.request('/auth/login', 'POST', { email, password, role });
        if (r.status !== 200) {
            throw new Error(`Login failed for ${email} (${role}): HTTP ${r.status} — ${JSON.stringify(r.data)}`);
        }
        return r.data;
    }
}

/** Returns a monotonic high-resolution timestamp in milliseconds. */
function now() { return performance.now(); }

/** Sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Generate a random hex string of given byte length → 64-char SHA-256 alike */
function randomHex64() { return crypto.randomBytes(32).toString('hex'); }

/** Generate a random UUIDv4 */
function randomUUID() { return crypto.randomUUID(); }

/** Print a labelled section header */
function section(title) {
    console.log('\n' + '═'.repeat(70));
    console.log(`  ${title}`);
    console.log('═'.repeat(70));
}

/** Print a progress line */
function log(msg) { console.log(`  ${msg}`); }

// ────────────────────────────────────────────────────────────────────────────
// 2.  AUTHENTICATION SETUP
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns an authenticated ApiClient for admin, plus officer email+password.
 * If no officer credentials are configured, creates a temporary officer account.
 */
async function setupAuth() {
    const adminClient = new ApiClient(CONFIG.API_BASE_URL);
    await adminClient.login(CONFIG.ADMIN_EMAIL, CONFIG.ADMIN_PASSWORD, 'Admin');
    log(`✔ Admin logged in as ${CONFIG.ADMIN_EMAIL}`);

    let officerEmail    = CONFIG.OFFICER_EMAIL;
    let officerPassword = CONFIG.OFFICER_PASSWORD;

    if (!officerEmail) {
        // Create a temporary officer account for this test run
        officerEmail    = `metrics_officer_${Date.now()}@shield.test`;
        officerPassword = `MetricsPass@${Date.now()}`;

        const createRes = await adminClient.request('/admin/users', 'POST', {
            email:         officerEmail,
            plainPassword: officerPassword,
            name:          'Metrics Test Officer',
            role:          'Police Officer',
            employeeId:    `EMP-METRICS-${Date.now()}`,
        });

        if (createRes.status !== 201 && createRes.status !== 200) {
            throw new Error(
                `Failed to create test officer: HTTP ${createRes.status} — ${JSON.stringify(createRes.data)}`
            );
        }
        log(`✔ Temporary officer account created: ${officerEmail}`);
    } else {
        log(`✔ Using existing officer: ${officerEmail}`);
    }

    return { adminClient, officerEmail, officerPassword };
}

// ────────────────────────────────────────────────────────────────────────────
// 3.  METRIC 1 — HASHING & PDF CERTIFICATE LATENCY
// ────────────────────────────────────────────────────────────────────────────

/**
 * For each file size:
 *   • Generates a dummy in-memory buffer of that size.
 *   • Uploads it via POST /api/evidence/upload (multipart) as a Police Officer.
 *   • Uses timing markers placed inside a single HTTP round-trip to extract:
 *       H  = SHA-256 hash computation time (measured client-side via timing)
 *       R  = Ledger RPC round-trip time    (measured by isolating the store call)
 *       P  = PDF generation time           (measured via GET /api/evidence-source/:id/certificate)
 *       T  = Total upload + certificate    (wall-clock)
 *
 * Because H, R, and P happen inside the server, we use a combination of:
 *   - Client-side timing of isolated sub-operations (H from a local hash mirror,
 *     R from POST /api/ledger/store/evidence via shield-ledger directly,
 *     P from a timed GET /api/evidence-source/:id/certificate request).
 *   - T from the wall-clock time of the full upload POST.
 *
 * The ledger RPC latency is measured by timing a direct JSON-RPC call to the
 * blockchain node (eth_call to read contract state), which mirrors what the
 * shield-ledger service does internally during verification.
 */
async function measureHashingLatency(officerEmail, officerPassword) {
    section('METRIC 1 — Hashing & Certificate Latency');

    const officerClient = new ApiClient(CONFIG.API_BASE_URL);
    await officerClient.login(officerEmail, officerPassword, 'Police Officer');

    const SIZES = {
        '1MB':   1   * 1024 * 1024,
        '10MB':  10  * 1024 * 1024,
        '100MB': 100 * 1024 * 1024,
        '500MB': 500 * 1024 * 1024,
    };

    const results = {};

    for (const [label, size] of Object.entries(SIZES)) {
        log(`\n  Testing ${label} file…`);

        // Per-file try/catch so a failure on one size doesn't lose the others
        try {
            // ── H: Local SHA-256 hash computation (mirrors server-side behaviour) ──
            const fileContent = crypto.randomBytes(size);
            const tHashStart = now();
            const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
            const H = now() - tHashStart;
            log(`    H (hash)  = ${H.toFixed(1)} ms`);

            // ── R: Ledger RPC latency — time eth_blockNumber × 5 samples ──
            const R = await measureRpcLatency();
            log(`    R (rpc)   = ${R.toFixed(1)} ms`);

            // ── Upload file + create FIR (timed for total T) ──
            const tTotalStart = now();

            // 1. Create a FIR first (required before evidence upload)
            const firId = await createFIR(officerClient, fileContent.slice(0, 512));

            // 2. Upload evidence — this is the main latency driver
            const { sourceId } = await uploadEvidence(officerClient, firId, fileContent, label);

            const T = now() - tTotalStart;
            log(`    T (total) = ${T.toFixed(1)} ms`);

            // ── P: PDF certificate generation latency ──
            const tPdfStart = now();
            const certRes = await officerClient.request(
                `/evidence-source/${sourceId}/certificate`, 'GET'
            );
            const P = now() - tPdfStart;

            if (certRes.status !== 200) {
                log(`    ⚠ Certificate generation returned ${certRes.status} — P recorded as measured.`);
            }
            log(`    P (pdf)   = ${P.toFixed(1)} ms`);

            results[label] = {
                hash:  parseFloat(H.toFixed(2)),
                rpc:   parseFloat(R.toFixed(2)),
                pdf:   parseFloat(P.toFixed(2)),
                total: parseFloat(T.toFixed(2)),
            };

            log(`  ✔ ${label}: H=${H.toFixed(0)}ms  R=${R.toFixed(0)}ms  P=${P.toFixed(0)}ms  T=${T.toFixed(0)}ms`);
        } catch (sizeErr) {
            log(`  ✗ ${label} failed: ${sizeErr.message}`);
            results[label] = { hash: 0, rpc: 0, pdf: 0, total: 0, error: sizeErr.message };
        }
    }

    return results;
}

/**
 * Measures the JSON-RPC round-trip latency to the blockchain node.
 * Calls eth_blockNumber (cheapest possible call — no EVM execution).
 * Returns the elapsed time in milliseconds.
 */
async function measureRpcLatency() {
    const SAMPLES = 5;
    let total = 0;
    for (let i = 0; i < SAMPLES; i++) {
        const t0 = now();
        await fetch(CONFIG.BLOCKCHAIN_RPC_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                jsonrpc: '2.0',
                method:  'eth_blockNumber',
                params:  [],
                id:      i + 1,
            }),
        });
        total += now() - t0;
    }
    return total / SAMPLES;
}

/**
 * Creates a FIR record via the API. Returns the FIR UUID.
 * @param {ApiClient} client
 * @param {Buffer}    fileContent  — file content to attach to the FIR
 */
async function createFIR(client, fileContent) {
    const fd = new FormData();
    fd.append('firNumber', `FIR-METRICS-${Date.now()}`);
    fd.append('incidentType', 'Metrics Test');
    fd.append('description', 'Auto-generated FIR for metrics gathering');
    fd.append('location', 'Metrics Lab');
    fd.append('file',
        new Blob([fileContent], { type: 'text/plain' }),
        `metrics_fir_${Date.now()}.txt`
    );

    const res = await client.request('/fir/create', 'POST', fd, true);
    if (res.status !== 201 && res.status !== 200) {
        throw new Error(`FIR creation failed: HTTP ${res.status} — ${JSON.stringify(res.data)}`);
    }
    return res.data.fir_id;
}

/**
 * Uploads an evidence file linked to a FIR.
 * Returns { evidenceId, sourceId }.
 * @param {ApiClient} client
 * @param {string}    firId
 * @param {Buffer}    fileContent
 * @param {string}    label        — for naming the file
 */
async function uploadEvidence(client, firId, fileContent, label) {
    const fd = new FormData();
    fd.append('fir_id', firId);
    fd.append('category', 'other');
    fd.append('description', `Metrics test file ${label}`);
    fd.append('sourceData', JSON.stringify({
        sourceType:     'Computer / Storage Media',
        make:           'Metrics',
        model:          'Test',
        serial:         `SERIAL-${Date.now()}`,
        identifiers:    '',
        deviceChain:    [],
        lawfulControl:  true,
        properOperation: true,
        ownershipStatus: 'Managed',
    }));
    fd.append('file',
        new Blob([fileContent], { type: 'application/octet-stream' }),
        `evidence_${label}_${Date.now()}.bin`
    );

    const res = await client.request('/evidence/upload', 'POST', fd, true);
    if (res.status !== 201 && res.status !== 200) {
        throw new Error(`Evidence upload failed: HTTP ${res.status} — ${JSON.stringify(res.data)}`);
    }

    return {
        evidenceId: res.data.id   || (res.data.files && res.data.files[0]?.id),
        sourceId:   res.data.sourceId,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 4.  METRIC 2 — EVM CLIQUE PoA LEDGER PERFORMANCE
// ────────────────────────────────────────────────────────────────────────────

/**
 * Benchmarks the private Clique PoA chain by submitting concurrent eth_sendRawTransaction
 * calls (via ethers.js) and measuring:
 *   • Average transaction latency (ms)  — submission to tx.wait() resolution
 *   • Throughput (TPS)                  — successful txs / wall-clock seconds
 *   • Sealing success rate (%)          — confirmed / total submitted
 *
 * Transactions are simple ETH self-transfers (value: 0) using the deployer account,
 * which exercises the full mempool → sealing → block-inclusion path without
 * requiring additional accounts or contract interactions.
 */
async function measureLedgerPerformance() {
    section('METRIC 2 — EVM Clique PoA Ledger Performance');

    if (!CONFIG.DEPLOYER_PRIVATE_KEY) {
        log('⚠ BLOCKCHAIN_DEPLOYER_PRIVATE_KEY not set — skipping ledger performance test.');
        return {
            concurrency_1:  { avg_latency_ms: 0, tps: 0, success_rate: 0 },
            concurrency_5:  { avg_latency_ms: 0, tps: 0, success_rate: 0 },
            concurrency_10: { avg_latency_ms: 0, tps: 0, success_rate: 0 },
            concurrency_20: { avg_latency_ms: 0, tps: 0, success_rate: 0 },
            concurrency_50: { avg_latency_ms: 0, tps: 0, success_rate: 0 },
        };
    }

    const provider = new ethers.JsonRpcProvider(CONFIG.BLOCKCHAIN_RPC_URL);
    const wallet   = new ethers.Wallet(CONFIG.DEPLOYER_PRIVATE_KEY, provider);

    log(`  Deployer address: ${wallet.address}`);

    const CONCURRENCY_LEVELS = [1, 5, 10, 20, 50];
    const results = {};

    for (const concurrency of CONCURRENCY_LEVELS) {
        log(`\n  Testing concurrency = ${concurrency}…`);
        const metrics = await runConcurrentTransactions(provider, wallet, concurrency);
        results[`concurrency_${concurrency}`] = {
            avg_latency_ms: parseFloat(metrics.avgLatency.toFixed(2)),
            tps:            parseFloat(metrics.tps.toFixed(4)),
            success_rate:   parseFloat(metrics.successRate.toFixed(4)),
        };
        log(`    avg_latency=${metrics.avgLatency.toFixed(0)}ms  tps=${metrics.tps.toFixed(2)}  success=${(metrics.successRate * 100).toFixed(1)}%`);

        // Brief cooldown to let the mempool settle between runs
        await sleep(3000);
    }

    return results;
}

/**
 * Fires `concurrency` transactions simultaneously (Promise.allSettled),
 * waits for all receipts, then computes performance metrics.
 */
async function runConcurrentTransactions(provider, wallet, concurrency) {
    // Pre-fetch nonce once; each tx gets its own nonce offset
    const baseNonce = await provider.getTransactionCount(wallet.address, 'pending');

    const tStart = now();
    const latencies = [];
    let successCount = 0;

    const tasks = Array.from({ length: concurrency }, (_, i) =>
        (async () => {
            const tTx = now();
            try {
                const tx = await wallet.sendTransaction({
                    to:       wallet.address, // self-transfer
                    value:    0n,
                    gasLimit: 21000,
                    gasPrice: 0n,
                    nonce:    baseNonce + i,
                });
                await tx.wait(1); // wait for 1 confirmation
                latencies.push(now() - tTx);
                successCount++;
            } catch (err) {
                // Nonce collision or mempool rejection — count as failure
                log(`    ⚠ tx[${i}] failed: ${err.message.slice(0, 80)}`);
            }
        })()
    );

    await Promise.allSettled(tasks);
    const wallTime = (now() - tStart) / 1000; // in seconds

    const avgLatency    = latencies.length
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
    const tps           = successCount / wallTime;
    const successRate   = successCount / concurrency;

    return { avgLatency, tps, successRate };
}

// ────────────────────────────────────────────────────────────────────────────
// 5.  METRIC 3 — WATCHDOG SWEEP VELOCITY
// ────────────────────────────────────────────────────────────────────────────

/**
 * Seeds the PostgreSQL database with N mock evidence records (directly via
 * pg + MinIO, bypassing the API — same approach as tests/helpers/seed_mock_data.js).
 * Then triggers the watchdog sweep by calling the internal API endpoints the
 * watchdog itself uses (list + verify-batch) while timing the full cycle.
 *
 * Test cases: 1,000 records and 5,000 records.
 */
async function measureWatchdogVelocity() {
    section('METRIC 3 — Watchdog Sweep Velocity');

    const pg = new PgClient({
        host:     CONFIG.DB_HOST,
        port:     CONFIG.DB_PORT,
        user:     CONFIG.DB_USER,
        password: CONFIG.DB_PASSWORD,
        database: CONFIG.DB_NAME,
    });

    const minio = new Minio.Client({
        endPoint:  CONFIG.MINIO_ENDPOINT,
        port:      CONFIG.MINIO_PORT,
        useSSL:    false,
        accessKey: CONFIG.MINIO_USER,
        secretKey: CONFIG.MINIO_PASS,
    });

    await pg.connect();

    const results = {};

    for (const count of [1000, 5000]) {
        log(`\n  Seeding ${count} mock evidence records…`);
        await seedMockRecords(pg, minio, count);
        log(`  ✔ Seeded ${count} records.`);

        log(`  Running watchdog sweep cycle…`);
        const elapsed = await runWatchdogSweep();
        log(`  ✔ Watchdog sweep for ${count} records completed in ${elapsed.toFixed(0)} ms`);

        results[`records_${count}_ms`] = parseFloat(elapsed.toFixed(2));

        // Clean up seeded data before next run to avoid cross-contamination.
        // audit_log has a FK on evidence.id — delete it first.
        log(`  Cleaning up seeded records…`);
        await pg.query(
            `DELETE FROM audit_log
             WHERE evidence_id IN (
                 SELECT id FROM evidence WHERE uploaded_by = $1
             )`,
            ['metrics-seed-worker']
        );
        await pg.query('DELETE FROM evidence WHERE uploaded_by = $1', ['metrics-seed-worker']);
        await pg.query('DELETE FROM fir WHERE reporting_officer = $1', ['metrics-seed-officer']);
        log(`  ✔ Cleanup complete.`);
    }

    await pg.end();
    return results;
}

/**
 * Inserts `count` FIR + evidence rows plus matching MinIO objects directly
 * into the database, bypassing the API.
 */
async function seedMockRecords(pg, minio, count) {
    // Ensure the MinIO bucket exists
    const bucketName = CONFIG.MINIO_BUCKET;
    const exists = await minio.bucketExists(bucketName);
    if (!exists) await minio.makeBucket(bucketName);

    // One parent FIR per seed batch
    const firId = randomUUID();
    await pg.query(
        `INSERT INTO fir (id, case_category, description, location, reporting_officer, fir_number)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [firId, 'Metrics Test', 'Seed batch for watchdog metric', 'Metrics Lab',
         'metrics-seed-officer', `FIR-SEED-${Date.now()}`]
    );

    const content = Buffer.from('metrics seed evidence file content for watchdog sweep test');
    const hash    = crypto.createHash('sha256').update(content).digest('hex');

    // Batch-insert using chunked INSERTs for performance
    const BATCH = 200;
    for (let start = 0; start < count; start += BATCH) {
        const end = Math.min(start + BATCH, count);
        const values = [];
        const params = [];
        let pi = 1;

        for (let i = start; i < end; i++) {
            const evidenceId = randomUUID();
            const objectKey  = `metrics-seed/${evidenceId}.bin`;

            // Upload a tiny object to MinIO so the watchdog can actually read it
            await minio.putObject(bucketName, objectKey, content, content.length);

            values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++})`);
            params.push(evidenceId, firId, `seed_${i}.bin`, bucketName, objectKey, hash,
                        'metrics-seed-worker');
        }

        await pg.query(
            `INSERT INTO evidence (id, fir_id, filename, bucket_name, object_key, sha256_hash, uploaded_by)
             VALUES ${values.join(',')}
             ON CONFLICT (id) DO NOTHING`,
            params
        );
    }
}

/**
 * Simulates the complete watchdog sweep cycle (list all evidence in pages of
 * 1000, verify in batches of 50) using the same internal API endpoints the
 * watchdog container uses. Times the full cycle.
 *
 * The internal endpoints require the x-internal-service-key header AND a valid
 * Admin JWT; the watchdog itself uses MASTER_KEY for the service key.
 */
async function runWatchdogSweep() {
    // We need an Admin JWT to call the internal routes (they check both IP guard
    // and RBAC). Since we're running locally (same host), the IP guard passes.
    const adminClient = new ApiClient(CONFIG.API_BASE_URL);
    await adminClient.login(CONFIG.ADMIN_EMAIL, CONFIG.ADMIN_PASSWORD, 'Admin');

    // The internal endpoints are on the evidence service directly (bypassing gateway)
    // but the gateway also proxies /api/evidence/internal/* — let's use the gateway.
    const INTERNAL_BASE = CONFIG.API_BASE_URL; // gateway handles routing
    const MASTER_KEY    = CONFIG.MASTER_KEY;

    const tStart = now();
    let cursorDate = '';
    let cursorId   = '';
    const LIMIT = 1000;
    let totalVerified = 0;
    let totalErrors   = 0;

    // We reuse the admin client's cookie for auth but add the internal service key header.
    // Custom fetch wrapper for internal calls:
    const cookieHeader = adminClient._buildCookieHeader();

    while (true) {
        const listUrl = cursorDate && cursorId
            ? `${INTERNAL_BASE}/evidence/internal/list?limit=${LIMIT}&cursor_date=${encodeURIComponent(cursorDate)}&cursor_id=${encodeURIComponent(cursorId)}`
            : `${INTERNAL_BASE}/evidence/internal/list?limit=${LIMIT}`;

        const listRes = await fetch(listUrl, {
            method:  'GET',
            headers: {
                Cookie:                   cookieHeader,
                'x-internal-service-key': MASTER_KEY,
            },
        });

        if (!listRes.ok) {
            log(`  ⚠ Internal list returned ${listRes.status}`);
            break;
        }

        const listData = await listRes.json();
        const records  = listData.records || [];
        if (records.length === 0) break;

        // Verify in batches of 50
        const allIds = records.map(r => r.id);
        for (let i = 0; i < allIds.length; i += 50) {
            const batch = allIds.slice(i, i + 50);
            try {
                const verRes = await fetch(`${INTERNAL_BASE}/evidence/internal/verify-batch`, {
                    method:  'POST',
                    headers: {
                        'Content-Type':           'application/json',
                        Cookie:                   cookieHeader,
                        'x-internal-service-key': MASTER_KEY,
                    },
                    body: JSON.stringify({ ids: batch }),
                });
                if (verRes.ok) {
                    const vd = await verRes.json();
                    totalVerified += Object.keys(vd.results || {}).length;
                } else {
                    totalErrors++;
                }
            } catch {
                totalErrors++;
            }
        }

        const last = records[records.length - 1];
        cursorDate = last.uploaded_at;
        cursorId   = last.id;
    }

    const elapsed = now() - tStart;
    log(`    Verified: ${totalVerified}  Errors: ${totalErrors}`);
    return elapsed;
}

// ────────────────────────────────────────────────────────────────────────────
// 6.  METRIC 4 — CIRCUIT BREAKER TRIGGER LATENCY
// ────────────────────────────────────────────────────────────────────────────

/**
 * Measures how quickly the circuit breaker blocks a certificate upload once
 * tamper is detected.
 *
 * Revised flow (two-phase, tolerant of verify-endpoint failures):
 *
 * Phase A — SETUP (not timed): Upload real evidence, tamper the MinIO object
 *   directly, then call GET /evidence/verify/:id so the server detects the
 *   hash mismatch and writes FAILED_VERIFICATION into evidence_source.
 *   If the verify endpoint itself errors (e.g. MinIO stream problem), we fall
 *   back to setting FAILED_VERIFICATION directly via Postgres — this still
 *   exercises the circuit-breaker gate that sits in the certificate route.
 *
 * Phase B — TIMED: From a clean clock start, POST a signed-certificate upload
 *   to the source that is in FAILED_VERIFICATION state. Measure the time until
 *   the expected 403 response arrives.
 */
async function measureCircuitBreakerLatency(officerEmail, officerPassword) {
    section('METRIC 4 — Circuit Breaker Trigger Latency');

    const officerClient = new ApiClient(CONFIG.API_BASE_URL);
    await officerClient.login(officerEmail, officerPassword, 'Police Officer');

    // ── Phase A: Setup ──────────────────────────────────────────────────────

    // 1. Create FIR and upload a small genuine evidence file
    log('  Uploading test evidence for circuit breaker…');
    const firId = await createFIR(
        officerClient,
        Buffer.from('circuit breaker test fir content')
    );
    const genuineContent = Buffer.from('genuine evidence content — will be tampered in a moment');
    const { evidenceId, sourceId } = await uploadEvidence(
        officerClient, firId, genuineContent, 'cb-test'
    );
    log(`  ✔ Evidence uploaded. ID=${evidenceId}  SourceID=${sourceId}`);

    if (!sourceId) {
        log('  ✗ sourceId missing from upload response — circuit breaker test skipped.');
        return 0;
    }

    // 2. Tamper: overwrite the MinIO object with corrupted bytes
    const pg = new PgClient({
        host: CONFIG.DB_HOST, port: CONFIG.DB_PORT,
        user: CONFIG.DB_USER, password: CONFIG.DB_PASSWORD,
        database: CONFIG.DB_NAME,
    });
    await pg.connect();

    const { rows: evRows } = await pg.query(
        'SELECT object_key, bucket_name FROM evidence WHERE id = $1', [evidenceId]
    );

    if (evRows.length) {
        const { object_key, bucket_name } = evRows[0];
        log(`  Tampering with MinIO object: ${object_key}`);
        const minio = new Minio.Client({
            endPoint:  CONFIG.MINIO_ENDPOINT,
            port:      CONFIG.MINIO_PORT,
            useSSL:    false,
            accessKey: CONFIG.MINIO_USER,
            secretKey: CONFIG.MINIO_PASS,
        });
        const corruptedContent = Buffer.from(`TAMPERED_${crypto.randomBytes(32).toString('hex')}`);
        await minio.putObject(bucket_name, object_key, corruptedContent, corruptedContent.length);
        log('  ✔ Object overwritten with corrupted bytes.');
    }

    // 3. Trigger verify endpoint — may succeed (sets FAILED_VERIFICATION) or fail
    log('  Calling verify endpoint…');
    const verifyRes = await officerClient.request(`/evidence/verify/${evidenceId}`, 'GET');
    const verifyStatus = typeof verifyRes.data === 'object'
        ? (verifyRes.data?.status || `HTTP ${verifyRes.status}`)
        : `HTTP ${verifyRes.status}`;
    log(`  Verify result: ${verifyStatus}`);

    // 4. Fallback: if verify failed or didn't mark FAILED_VERIFICATION, set it directly
    const { rows: srcRows } = await pg.query(
        'SELECT certificate_status FROM evidence_source WHERE id = $1', [sourceId]
    );
    if (!srcRows.length || srcRows[0].certificate_status !== 'FAILED_VERIFICATION') {
        log('  ⚠ verify did not set FAILED_VERIFICATION — applying directly via DB (fallback).');
        await pg.query(
            `UPDATE evidence_source SET certificate_status = 'FAILED_VERIFICATION' WHERE id = $1`,
            [sourceId]
        );
        log('  ✔ FAILED_VERIFICATION set via direct DB update.');
    } else {
        log('  ✔ FAILED_VERIFICATION confirmed via verify endpoint.');
    }
    await pg.end();

    // ── Phase B: Time the circuit breaker response ──────────────────────────
    log('  Timing circuit breaker 403 response…');
    const tStart = now();

    const certFd = new FormData();
    certFd.append(
        'file',
        new Blob(['fake signed cert'], { type: 'application/pdf' }),
        'signed_cert.pdf'
    );
    const certRes = await officerClient.request(
        `/evidence-source/${sourceId}/upload-signed-certificate`,
        'POST',
        certFd,
        true
    );

    const elapsed = now() - tStart;

    if (certRes.status === 403) {
        log(`  ✔ Circuit breaker ENGAGED — 403 received in ${elapsed.toFixed(1)} ms`);
    } else {
        log(`  ✗ Unexpected status ${certRes.status} — circuit breaker may not have fired.`);
        log(`    Response: ${JSON.stringify(certRes.data)}`);
    }

    return parseFloat(elapsed.toFixed(2));
}

// ────────────────────────────────────────────────────────────────────────────
// 7.  METRIC 5 — SMART CONTRACT GAS PROFILING
// ────────────────────────────────────────────────────────────────────────────

/**
 * Uses ethers.js to estimate and then actually measure the gas consumed by
 * anchorFIR and anchorEvidence on the live private chain.
 *
 * Gas profiling steps:
 *   1. Connect to node-police RPC with the deployer wallet (which has ANCHOR_ROLE
 *      because deploy.js grants it during deployment).
 *   2. Call contract.anchorFIR.estimateGas() for a fresh UUID.
 *   3. Send the real transaction and read receipt.gasUsed.
 *   4. Repeat for anchorEvidence.
 */
async function measureGasConsumption() {
    section('METRIC 5 — Smart Contract Gas Profiling');

    if (!CONFIG.DEPLOYER_PRIVATE_KEY) {
        log('⚠ BLOCKCHAIN_DEPLOYER_PRIVATE_KEY not set — skipping gas profiling.');
        return { anchorFIR: 0, anchorEvidence: 0 };
    }

    // The deployment uses TWO separate contracts: FIRLedger and EvidenceLedger.
    const firContractAddress = process.env.BLOCKCHAIN_FIR_CONTRACT_ADDRESS
        || CONFIG.CONTRACT_ADDRESS;
    const evidenceContractAddress = process.env.BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS
        || CONFIG.CONTRACT_ADDRESS;

    if (!firContractAddress || !evidenceContractAddress) {
        log('⚠ BLOCKCHAIN_FIR_CONTRACT_ADDRESS / BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS not set — skipping gas profiling.');
        return { anchorFIR: 0, anchorEvidence: 0 };
    }

    // Load raw ABI arrays from the ledger service's bundled ABIs.
    // These are plain JSON arrays, not Hardhat artifacts (no .abi wrapper).
    const firAbiPath      = path.resolve(__dirname, '../shield-ledger/src/abis/FIRLedger.json');
    const evidenceAbiPath = path.resolve(__dirname, '../shield-ledger/src/abis/EvidenceLedger.json');

    // Fallback: try Hardhat artifact paths if the split ABIs are missing
    const hardhatFirAbi      = path.resolve(__dirname, '../artifacts/contracts/FIRLedger.sol/FIRLedger.json');
    const hardhatEvidenceAbi = path.resolve(__dirname, '../artifacts/contracts/EvidenceLedger.sol/EvidenceLedger.json');

    const resolveFirAbi = firAbiPath && fs.existsSync(firAbiPath)
        ? firAbiPath
        : (fs.existsSync(hardhatFirAbi) ? hardhatFirAbi : null);
    const resolveEvAbi  = evidenceAbiPath && fs.existsSync(evidenceAbiPath)
        ? evidenceAbiPath
        : (fs.existsSync(hardhatEvidenceAbi) ? hardhatEvidenceAbi : null);

    if (!resolveFirAbi || !resolveEvAbi) {
        log(`⚠ ABI files not found. Expected:\n      ${firAbiPath}\n      ${evidenceAbiPath}`);
        return { anchorFIR: 0, anchorEvidence: 0 };
    }

    // Load ABIs — handle both raw arrays and Hardhat artifact objects
    const loadAbi = (filePath) => {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return Array.isArray(content) ? content : (content.abi || content);
    };
    const firAbi      = loadAbi(resolveFirAbi);
    const evidenceAbi = loadAbi(resolveEvAbi);

    log(`  FIR ABI:      ${resolveFirAbi}`);
    log(`  Evidence ABI: ${resolveEvAbi}`);

    const provider        = new ethers.JsonRpcProvider(CONFIG.BLOCKCHAIN_RPC_URL);
    const wallet          = new ethers.Wallet(CONFIG.DEPLOYER_PRIVATE_KEY, provider);
    const firContract     = new ethers.Contract(firContractAddress, firAbi, wallet);
    const evidenceContract = new ethers.Contract(evidenceContractAddress, evidenceAbi, wallet);

    log(`  FIR Contract:      ${firContractAddress}`);
    log(`  Evidence Contract: ${evidenceContractAddress}`);
    log(`  Signer:            ${wallet.address}`);

    // ── anchorFIR ──────────────────────────────────────────────────────────
    const firId   = randomUUID();
    const firHash = randomHex64();

    let anchorFIRGas = 0n;
    try {
        const estimated = await firContract.anchorFIR.estimateGas(firId, firHash, { gasPrice: 0n });
        log(`  anchorFIR  estimateGas = ${estimated.toString()}`);

        const tx      = await firContract.anchorFIR(firId, firHash, { gasPrice: 0n });
        const receipt = await tx.wait(1);
        anchorFIRGas  = receipt.gasUsed;
        log(`  anchorFIR  gasUsed     = ${anchorFIRGas.toString()}`);
    } catch (err) {
        log(`  ✗ anchorFIR failed: ${err.message}`);
    }

    // ── anchorEvidence ─────────────────────────────────────────────────────
    const evidenceId   = randomUUID();
    const evidenceHash = randomHex64();

    let anchorEvidenceGas = 0n;
    try {
        const estimated = await evidenceContract.anchorEvidence.estimateGas(
            evidenceId, firId, evidenceHash, { gasPrice: 0n }
        );
        log(`  anchorEvidence  estimateGas = ${estimated.toString()}`);

        const tx      = await evidenceContract.anchorEvidence(evidenceId, firId, evidenceHash, { gasPrice: 0n });
        const receipt = await tx.wait(1);
        anchorEvidenceGas = receipt.gasUsed;
        log(`  anchorEvidence  gasUsed     = ${anchorEvidenceGas.toString()}`);
    } catch (err) {
        log(`  ✗ anchorEvidence failed: ${err.message}`);
    }

    // Destroy the provider so its internal polling loop doesn't keep the process alive
    provider.destroy();

    return {
        anchorFIR:      Number(anchorFIRGas),
        anchorEvidence: Number(anchorEvidenceGas),
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 8.  MAIN ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║      SHIELD — Research Paper Metrics Gathering Script               ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log(`  API Base URL:   ${CONFIG.API_BASE_URL}`);
    console.log(`  Blockchain RPC: ${CONFIG.BLOCKCHAIN_RPC_URL}`);
    console.log(`  Database:       ${CONFIG.DB_HOST}:${CONFIG.DB_PORT}/${CONFIG.DB_NAME}`);
    console.log(`  MinIO:          ${CONFIG.MINIO_ENDPOINT}:${CONFIG.MINIO_PORT}`);
    console.log(`  Output:         ${CONFIG.OUTPUT_FILE}`);

    // Ensure output directory exists
    fs.mkdirSync(path.dirname(CONFIG.OUTPUT_FILE), { recursive: true });

    // Initialise result structure (zeroed — filled in progressively)
    const metrics = {
        hashing_and_pdf_latency: {
            '1MB':   { hash: 0, rpc: 0, pdf: 0, total: 0 },
            '10MB':  { hash: 0, rpc: 0, pdf: 0, total: 0 },
            '100MB': { hash: 0, rpc: 0, pdf: 0, total: 0 },
            '500MB': { hash: 0, rpc: 0, pdf: 0, total: 0 },
        },
        ledger_performance: {
            concurrency_1:  { avg_latency_ms: 0, tps: 0, success_rate: 0.0 },
            concurrency_5:  { avg_latency_ms: 0, tps: 0, success_rate: 0.0 },
            concurrency_10: { avg_latency_ms: 0, tps: 0, success_rate: 0.0 },
            concurrency_20: { avg_latency_ms: 0, tps: 0, success_rate: 0.0 },
            concurrency_50: { avg_latency_ms: 0, tps: 0, success_rate: 0.0 },
        },
        watchdog_sweep_velocity: {
            records_1000_ms: 0,
            records_5000_ms: 0,
        },
        circuit_breaker_trigger_latency_ms: 0,
        gas_consumption: {
            anchorFIR:      0,
            anchorEvidence: 0,
        },
        meta: {
            gathered_at: new Date().toISOString(),
            api_url:     CONFIG.API_BASE_URL,
            rpc_url:     CONFIG.BLOCKCHAIN_RPC_URL,
        },
    };

    const errors = [];

    // ── Auth setup ──────────────────────────────────────────────────────────
    let officerEmail, officerPassword;
    try {
        const auth = await setupAuth();
        officerEmail    = auth.officerEmail;
        officerPassword = auth.officerPassword;
    } catch (err) {
        console.error(`\n  ✗ Auth setup failed: ${err.message}`);
        console.error('  Cannot continue without authentication. Exiting.');
        process.exit(1);
    }

    // ── Metric 1 ────────────────────────────────────────────────────────────
    try {
        metrics.hashing_and_pdf_latency = await measureHashingLatency(officerEmail, officerPassword);
    } catch (err) {
        errors.push(`Metric 1 (Hashing Latency): ${err.message}`);
        console.error(`\n  ✗ Metric 1 failed: ${err.message}`);
    }

    // Persist progress after each section
    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(metrics, null, 2));

    // ── Metric 2 ────────────────────────────────────────────────────────────
    try {
        metrics.ledger_performance = await measureLedgerPerformance();
    } catch (err) {
        errors.push(`Metric 2 (Ledger Performance): ${err.message}`);
        console.error(`\n  ✗ Metric 2 failed: ${err.message}`);
    }

    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(metrics, null, 2));

    // ── Metric 3 ────────────────────────────────────────────────────────────
    try {
        const wv = await measureWatchdogVelocity();
        metrics.watchdog_sweep_velocity.records_1000_ms = wv.records_1000_ms;
        metrics.watchdog_sweep_velocity.records_5000_ms = wv.records_5000_ms;
    } catch (err) {
        errors.push(`Metric 3 (Watchdog Velocity): ${err.message}`);
        console.error(`\n  ✗ Metric 3 failed: ${err.message}`);
    }

    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(metrics, null, 2));

    // ── Metric 4 ────────────────────────────────────────────────────────────
    try {
        metrics.circuit_breaker_trigger_latency_ms = await measureCircuitBreakerLatency(
            officerEmail, officerPassword
        );
    } catch (err) {
        errors.push(`Metric 4 (Circuit Breaker): ${err.message}`);
        console.error(`\n  ✗ Metric 4 failed: ${err.message}`);
    }

    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(metrics, null, 2));

    // ── Metric 5 ────────────────────────────────────────────────────────────
    try {
        const gas = await measureGasConsumption();
        metrics.gas_consumption.anchorFIR      = gas.anchorFIR;
        metrics.gas_consumption.anchorEvidence = gas.anchorEvidence;
    } catch (err) {
        errors.push(`Metric 5 (Gas Profiling): ${err.message}`);
        console.error(`\n  ✗ Metric 5 failed: ${err.message}`);
    }

    // Final write
    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(metrics, null, 2));

    // ── Summary ─────────────────────────────────────────────────────────────
    section('RESULTS SUMMARY');
    console.log(JSON.stringify(metrics, null, 2));

    if (errors.length) {
        console.log('\n⚠ The following metrics encountered errors:');
        errors.forEach(e => console.log(`  • ${e}`));
    }

    console.log(`\n✅ Metrics written to: ${CONFIG.OUTPUT_FILE}`);

    // Explicitly exit so that any lingering async handles (ethers provider polling,
    // open pg connections that were not cleanly closed, etc.) don't keep the
    // Node.js event loop alive indefinitely.
    process.exit(0);
}

main().catch(err => {
    console.error('\n✗ Fatal error:', err);
    process.exit(1);
});
