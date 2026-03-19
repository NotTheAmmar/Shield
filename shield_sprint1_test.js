/**
 * SHIELD Sprint 1 — Automated Functional Verification Script
 * Runs all critical test scenarios via HTTP against the live Docker stack.
 */

const crypto = require('crypto');
const jwt = require('/home/vishvambar/Shield/shield-evidence/node_modules/jsonwebtoken');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────
const GATEWAY_URL = 'http://localhost:3001';
const JWT_SECRET = 'shield_rotated_super_secret_key_84920';
const INTERNAL_SERVICE_KEY = 'shield_worker_key_2026';

// ─── TOKEN FACTORY ───────────────────────────────────────
function mintToken(role, id) {
    return jwt.sign({ id: id || crypto.randomUUID(), role }, JWT_SECRET, { expiresIn: '1h' });
}

const POLICE_TOKEN = mintToken('Police Officer');
const JUDGE_TOKEN = mintToken('Judge');
const ADMIN_TOKEN = mintToken('Super Admin');

let passCount = 0;
let failCount = 0;
const results = [];

function logResult(testName, passed, details) {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${testName}`);
    if (details) console.log(`   └─ ${details}`);
    results.push({ testName, passed, details });
    if (passed) passCount++;
    else failCount++;
}

// ─── TEST HELPERS ────────────────────────────────────────
async function httpJSON(method, urlPath, { token, body, headers } = {}) {
    const url = `${GATEWAY_URL}${urlPath}`;
    const opts = {
        method,
        headers: { ...headers },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    } else if (body) {
        opts.body = body;
    }
    const res = await fetch(url, opts);
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        data = await res.text();
    }
    return { status: res.status, data, headers: res.headers };
}

// ─── TESTS ───────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('   🛡️  SHIELD Sprint 1 — Full Verification Suite');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 1: Health Checks
    // ────────────────────────────────────────────────────
    console.log('── Phase 1: Health Checks ──────────────────────────');
    try {
        const r = await httpJSON('GET', '/api/evidence/health');
        logResult('Evidence Service Health Check', r.status === 200 && r.data?.status === 'OK',
            `Status: ${r.status}, Body: ${JSON.stringify(r.data)}`);
    } catch (e) {
        logResult('Evidence Service Health Check', false, `Connection failed: ${e.message}`);
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 2: Authentication & RBAC
    // ────────────────────────────────────────────────────
    console.log('── Phase 2: Authentication & RBAC ─────────────────');

    // Test 2a: No token → 401
    try {
        const r = await httpJSON('POST', '/api/fir/create', {
            body: { case_category: 'Test', description: 'Test', location: 'Test' }
        });
        logResult('FIR Create without token → 401', r.status === 401,
            `Status: ${r.status}`);
    } catch (e) {
        logResult('FIR Create without token → 401', false, e.message);
    }

    // Test 2b: Police Officer creates FIR → 201
    let firId;
    try {
        const r = await httpJSON('POST', '/api/fir/create', {
            token: POLICE_TOKEN,
            body: { case_category: 'Cyber Crime', description: 'Sprint 1 test FIR', location: 'Test Lab' }
        });
        firId = r.data?.fir_id;
        logResult('Police Officer creates FIR → 201', r.status === 201 && !!firId,
            `Status: ${r.status}, FIR ID: ${firId}`);
    } catch (e) {
        logResult('Police Officer creates FIR → 201', false, e.message);
    }

    // Test 2c: Judge creates FIR → 403 (RBAC block)
    try {
        const r = await httpJSON('POST', '/api/fir/create', {
            token: JUDGE_TOKEN,
            body: { case_category: 'Cyber Crime', description: 'Judge should not create', location: 'Courtroom' }
        });
        logResult('Judge blocked from creating FIR → 403', r.status === 403,
            `Status: ${r.status}, Body: ${JSON.stringify(r.data)}`);
    } catch (e) {
        logResult('Judge blocked from creating FIR → 403', false, e.message);
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 3: Evidence Upload Pipeline
    // ────────────────────────────────────────────────────
    console.log('── Phase 3: Evidence Upload Pipeline ──────────────');

    let evidenceId, uploadHash;
    if (firId) {
        try {
            // Create a temporary test file
            const testFilePath = '/home/vishvambar/Shield/shield_test_evidence.txt';
            const testContent = 'Sprint 1 evidence test file content - ' + Date.now();
            fs.writeFileSync(testFilePath, testContent);

            // Build multipart form data manually
            const boundary = '----ShieldTestBoundary' + Date.now();
            const fileContent = fs.readFileSync(testFilePath);

            let formBody = '';
            // fir_id field MUST come before file (Flaw #16)
            formBody += `--${boundary}\r\n`;
            formBody += `Content-Disposition: form-data; name="fir_id"\r\n\r\n`;
            formBody += `${firId}\r\n`;
            // file field
            formBody += `--${boundary}\r\n`;
            formBody += `Content-Disposition: form-data; name="file"; filename="test_evidence.txt"\r\n`;
            formBody += `Content-Type: text/plain\r\n\r\n`;

            const bodyStart = Buffer.from(formBody, 'utf-8');
            const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
            const fullBody = Buffer.concat([bodyStart, fileContent, bodyEnd]);

            const url = `${GATEWAY_URL}/api/evidence/upload`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${POLICE_TOKEN}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body: fullBody,
            });

            const data = await res.json();
            evidenceId = data?.id;
            uploadHash = data?.sha256_hash;
            logResult('Evidence Upload via Streaming Pipeline → 201', res.status === 201 && !!evidenceId && !!uploadHash,
                `Status: ${res.status}, Evidence ID: ${evidenceId}, Hash: ${uploadHash?.substring(0, 16)}...`);

            // Clean up
            fs.unlinkSync(testFilePath);
        } catch (e) {
            logResult('Evidence Upload via Streaming Pipeline → 201', false, e.message);
        }
    } else {
        logResult('Evidence Upload via Streaming Pipeline → 201', false, 'Skipped: No FIR ID from previous test');
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 4: Evidence Verification (ImmuDB Integration)
    // ────────────────────────────────────────────────────
    console.log('── Phase 4: Evidence Verification (ImmuDB) ────────');

    if (evidenceId) {
        try {
            const r = await httpJSON('GET', `/api/evidence/verify/${evidenceId}`, { token: POLICE_TOKEN });
            logResult('Evidence Integrity Verification → OK', r.status === 200 && r.data?.status === 'OK',
                `Status: ${r.status}, Result: ${r.data?.status}`);
        } catch (e) {
            logResult('Evidence Integrity Verification → OK', false, e.message);
        }
    } else {
        logResult('Evidence Integrity Verification → OK', false, 'Skipped: No evidence uploaded');
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 5: Download (Presigned URL)
    // ────────────────────────────────────────────────────
    console.log('── Phase 5: Download Presigned URL ────────────────');

    if (evidenceId) {
        try {
            const r = await httpJSON('GET', `/api/evidence/download/${evidenceId}`, { token: POLICE_TOKEN });
            const hasUrl = r.status === 200 && typeof r.data?.url === 'string' && r.data.url.includes('http');
            logResult('Presigned Download URL generation', hasUrl,
                `Status: ${r.status}, URL prefix: ${r.data?.url?.substring(0, 50)}...`);
        } catch (e) {
            logResult('Presigned Download URL generation', false, e.message);
        }
    } else {
        logResult('Presigned Download URL generation', false, 'Skipped: No evidence uploaded');
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 6: Network Perimeter Security
    // ────────────────────────────────────────────────────
    console.log('── Phase 6: Network Perimeter Security ────────────');

    // Test 6a: Gateway blocks /internal routes → should NOT return JSON
    try {
        const r = await httpJSON('GET', '/api/evidence/internal/list?limit=10', {
            token: ADMIN_TOKEN,
        });
        // The gateway should trap this and send it to /404 (which returns HTML, not JSON)
        const blocked = r.status === 404 || (typeof r.data === 'string' && r.data.includes('404'));
        logResult('Gateway blocks /internal routes → 404', blocked,
            `Status: ${r.status}, Type: ${typeof r.data === 'string' ? 'HTML (blocked)' : 'JSON (LEAK!)'}`);
    } catch (e) {
        logResult('Gateway blocks /internal routes → 404', false, e.message);
    }

    // Test 6b: Internal service key auth works (direct container — if accessible)
    // Since Docker expose means port 4001 is NOT on host, this SHOULD fail
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const r = await fetch('http://localhost:4001/api/evidence/internal/list?limit=10', {
            headers: { 'x-internal-service-key': INTERNAL_SERVICE_KEY },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        // If this succeeds, it means port 4001 leaked to host — BAD
        logResult('Docker port 4001 NOT exposed to host', false,
            `Port 4001 is accessible! Status: ${r.status}. Docker expose misconfigured.`);
    } catch (e) {
        // Connection refused or timeout = GOOD (port is sealed)
        logResult('Docker port 4001 NOT exposed to host', true,
            `Connection correctly refused: ${e.cause?.code || e.name}`);
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // PHASE 7: Input Validation
    // ────────────────────────────────────────────────────
    console.log('── Phase 7: Input Validation ──────────────────────');

    // Test 7a: Missing fields in FIR → 400
    try {
        const r = await httpJSON('POST', '/api/fir/create', {
            token: POLICE_TOKEN,
            body: { case_category: 'Incomplete' }  // missing description, location
        });
        logResult('FIR Create with missing fields → 400', r.status === 400,
            `Status: ${r.status}, Body: ${JSON.stringify(r.data)}`);
    } catch (e) {
        logResult('FIR Create with missing fields → 400', false, e.message);
    }

    // Test 7b: Invalid token → 403
    try {
        const r = await httpJSON('GET', '/api/evidence/verify/nonexistent-id', {
            token: 'invalid.token.here'
        });
        logResult('Invalid JWT token → 403', r.status === 403,
            `Status: ${r.status}`);
    } catch (e) {
        logResult('Invalid JWT token → 403', false, e.message);
    }

    // Test 7c: Non-existent evidence → 404
    try {
        const fakeId = crypto.randomUUID();
        const r = await httpJSON('GET', `/api/evidence/verify/${fakeId}`, { token: POLICE_TOKEN });
        logResult('Verify non-existent evidence → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        logResult('Verify non-existent evidence → 404', false, e.message);
    }
    console.log('');

    // ────────────────────────────────────────────────────
    // FINAL REPORT
    // ────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   📊 RESULTS: ${passCount} passed, ${failCount} failed, ${passCount + failCount} total`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    if (failCount > 0) {
        console.log('❌ FAILED TESTS:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   • ${r.testName}: ${r.details}`);
        });
    } else {
        console.log('🎉 ALL TESTS PASSED! Sprint 1 is fully verified.');
    }
    
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
