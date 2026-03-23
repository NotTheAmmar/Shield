/**
 * SHIELD — Comprehensive Backend Test Suite
 * Tests ALL backend API endpoints across all 4 microservices.
 * Run: node shield_comprehensive_test.js
 * Requires: Docker stack running (docker compose up --build -d)
 */

const crypto = require('crypto');
const fs = require('fs');

const GATEWAY = 'http://localhost:3001';
const ADMIN_EMAIL = 'admin@police.gov';
const ADMIN_PASSWORD = 'Sh13ld@Pr0duct10n2026!';
const ADMIN_ROLE = 'Super Admin';

let passCount = 0;
let failCount = 0;
let skipCount = 0;
const results = [];

// ─── HELPERS ─────────────────────────────────────────────
function log(testName, passed, details, skipped = false) {
    const icon = skipped ? '⏭️' : (passed ? '✅' : '❌');
    console.log(`  ${icon} ${testName}`);
    if (details) console.log(`     └─ ${details}`);
    results.push({ testName, passed, details, skipped });
    if (skipped) skipCount++;
    else if (passed) passCount++;
    else failCount++;
}

async function http(method, path, { token, body, headers = {}, multipart, timeout = 8000 } = {}) {
    const url = `${GATEWAY}${path}`;
    const opts = { method, headers: { ...headers } };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (multipart) {
        // Manual multipart/form-data construction
        const boundary = '----ShieldTest' + Date.now();
        let parts = [];

        for (const [key, val] of Object.entries(multipart)) {
            if (val && typeof val === 'object' && val._file) {
                // File field
                parts.push(Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${val.filename}"\r\nContent-Type: ${val.contentType || 'application/octet-stream'}\r\n\r\n`
                ));
                parts.push(Buffer.isBuffer(val.data) ? val.data : Buffer.from(val.data));
                parts.push(Buffer.from('\r\n'));
            } else {
                // Text field
                parts.push(Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
                ));
            }
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`));

        opts.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        opts.body = Buffer.concat(parts);
    } else if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    opts.signal = controller.signal;

    try {
        const res = await fetch(url, opts);
        clearTimeout(timer);
        const ct = res.headers.get('content-type') || '';
        let data;
        if (ct.includes('json')) {
            data = await res.json();
        } else {
            data = await res.text();
        }
        return { status: res.status, data, headers: res.headers, ok: res.ok };
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── MAIN ────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   🛡️  SHIELD — Comprehensive Backend Test Suite         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // Wait for services to be ready
    console.log('⏳ Waiting 3s for services to stabilize...');
    await sleep(3000);

    // ═════════════════════════════════════════════════════════
    // PHASE 1: Health Checks
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 1: Health Checks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // T1: Gateway health
    try {
        const r = await http('GET', '/');
        log('T1: Gateway health endpoint', r.status === 200 && r.data?.status === 'running',
            `Status: ${r.status}, service: ${r.data?.service}`);
    } catch (e) {
        log('T1: Gateway health endpoint', false, `FAILED: ${e.message}`);
    }

    // T2: 404 handler for unknown routes
    try {
        const r = await http('GET', '/api/nonexistent/route');
        log('T2: Unknown route → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T2: Unknown route → 404', false, e.message);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 2: Authentication
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 2: Authentication ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // T3: Login with missing fields → 400
    try {
        const r = await http('POST', '/api/auth/login', { body: { email: 'test@test.com' } });
        log('T3: Login with missing fields → 400', r.status === 400,
            `Status: ${r.status}, error: ${r.data?.error}`);
    } catch (e) {
        log('T3: Login with missing fields → 400', false, e.message);
    }

    // T4: Login with wrong password → 401
    try {
        const r = await http('POST', '/api/auth/login', {
            body: { email: ADMIN_EMAIL, password: 'wrongpassword', role: ADMIN_ROLE }
        });
        log('T4: Login with wrong password → 401', r.status === 401,
            `Status: ${r.status}, error: ${r.data?.error}`);
    } catch (e) {
        log('T4: Login with wrong password → 401', false, e.message);
    }

    // T5: Login with wrong role → 401
    try {
        const r = await http('POST', '/api/auth/login', {
            body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'Police Officer' }
        });
        log('T5: Login with wrong role → 401', r.status === 401,
            `Status: ${r.status}, error: ${r.data?.error}`);
    } catch (e) {
        log('T5: Login with wrong role → 401', false, e.message);
    }

    // T6: Successful Super Admin login → 200 + JWT
    let adminToken = null;
    try {
        const r = await http('POST', '/api/auth/login', {
            body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: ADMIN_ROLE }
        });
        adminToken = r.data?.token;
        log('T6: Super Admin login → 200 + JWT', r.status === 200 && !!adminToken && !!r.data?.user,
            `Status: ${r.status}, user: ${r.data?.user?.name}, hasToken: ${!!adminToken}`);
    } catch (e) {
        log('T6: Super Admin login → 200 + JWT', false, e.message);
    }

    // T7: Logout → 200
    try {
        const r = await http('POST', '/api/auth/logout', { token: adminToken });
        log('T7: Logout → 200', r.status === 200 && r.data?.message,
            `Status: ${r.status}, message: ${r.data?.message}`);
    } catch (e) {
        log('T7: Logout → 200', false, e.message);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 3: User Management (Admin CRUD + RBAC)
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 3: User Management (Admin) ━━━━━━━━━━━━━━━━━━');

    // T8: List users without token → 401
    try {
        const r = await http('GET', '/api/admin/users');
        log('T8: List users without token → 401', r.status === 401,
            `Status: ${r.status}`);
    } catch (e) {
        log('T8: List users without token → 401', false, e.message);
    }

    // T9: List users with admin token → 200
    try {
        const r = await http('GET', '/api/admin/users', { token: adminToken });
        const hasUsers = r.data?.users && Array.isArray(r.data.users);
        log('T9: List users (admin) → 200', r.status === 200 && hasUsers,
            `Status: ${r.status}, count: ${r.data?.users?.length}`);
    } catch (e) {
        log('T9: List users (admin) → 200', false, e.message);
    }

    // T10: Create user with missing fields → 400
    try {
        const r = await http('POST', '/api/admin/users', {
            token: adminToken,
            body: { name: 'Incomplete User' }
        });
        log('T10: Create user missing fields → 400', r.status === 400,
            `Status: ${r.status}, error: ${r.data?.error}`);
    } catch (e) {
        log('T10: Create user missing fields → 400', false, e.message);
    }

    // T11: Create a new Police Officer → 201
    const officerEmail = `officer_${Date.now()}@police.gov`;
    const officerEmpId = `EMP_${Date.now()}`;
    const officerPassword = 'TestOfficer123!';
    let officerUserId = null;
    try {
        const r = await http('POST', '/api/admin/users', {
            token: adminToken,
            body: {
                name: 'Test Officer',
                email: officerEmail,
                employeeId: officerEmpId,
                role: 'Police Officer',
                plainPassword: officerPassword
            }
        });
        officerUserId = r.data?.user?.id;
        log('T11: Create Police Officer → 201', r.status === 201 && !!officerUserId,
            `Status: ${r.status}, id: ${officerUserId}, email: ${officerEmail}`);
    } catch (e) {
        log('T11: Create Police Officer → 201', false, e.message);
    }

    // T12: Create duplicate user → 409
    try {
        const r = await http('POST', '/api/admin/users', {
            token: adminToken,
            body: {
                name: 'Duplicate Officer',
                email: officerEmail,
                employeeId: `EMP_DUP_${Date.now()}`,
                role: 'Police Officer',
                plainPassword: 'password'
            }
        });
        log('T12: Create duplicate email → 409', r.status === 409,
            `Status: ${r.status}, error: ${r.data?.error}`);
    } catch (e) {
        log('T12: Create duplicate email → 409', false, e.message);
    }

    // T13: Create a Judicial Authority user
    const judgeEmail = `judge_${Date.now()}@court.gov.in`;
    const judgePassword = 'TestJudge123!';
    try {
        const r = await http('POST', '/api/admin/users', {
            token: adminToken,
            body: {
                name: 'Test Judge',
                email: judgeEmail,
                employeeId: `JUD_${Date.now()}`,
                role: 'Judicial Authority',
                plainPassword: judgePassword
            }
        });
        log('T13: Create Judicial Authority → 201', r.status === 201,
            `Status: ${r.status}, email: ${judgeEmail}`);
    } catch (e) {
        log('T13: Create Judicial Authority → 201', false, e.message);
    }

    // T14: Update user role/status (PATCH)
    if (officerUserId) {
        try {
            const r = await http('PATCH', `/api/admin/users/${officerUserId}`, {
                token: adminToken,
                body: { status: 'active' }
            });
            log('T14: Update user status → 200', r.status === 200,
                `Status: ${r.status}, updated: ${r.data?.user?.status || r.data?.message}`);
        } catch (e) {
            log('T14: Update user status → 200', false, e.message);
        }
    } else {
        log('T14: Update user status → 200', false, 'Skipped: no user ID', true);
    }

    // T15: Update non-existent user → 404
    try {
        const r = await http('PATCH', `/api/admin/users/00000000-0000-0000-0000-999999999999`, {
            token: adminToken,
            body: { status: 'deactivated' }
        });
        log('T15: Update non-existent user → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T15: Update non-existent user → 404', false, e.message);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 4: Login as Different Roles
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 4: Role-Based Login ━━━━━━━━━━━━━━━━━━━━━━━━');

    // T16: Login as newly created Police Officer → 200
    let officerToken = null;
    try {
        const r = await http('POST', '/api/auth/login', {
            body: { email: officerEmail, password: officerPassword, role: 'Police Officer' }
        });
        officerToken = r.data?.token;
        log('T16: Police Officer login → 200', r.status === 200 && !!officerToken,
            `Status: ${r.status}, hasToken: ${!!officerToken}`);
    } catch (e) {
        log('T16: Police Officer login → 200', false, e.message);
    }

    // T17: Login as Judicial Authority → 200
    let judgeToken = null;
    try {
        const r = await http('POST', '/api/auth/login', {
            body: { email: judgeEmail, password: judgePassword, role: 'Judicial Authority' }
        });
        judgeToken = r.data?.token;
        log('T17: Judicial Authority login → 200', r.status === 200 && !!judgeToken,
            `Status: ${r.status}, hasToken: ${!!judgeToken}`);
    } catch (e) {
        log('T17: Judicial Authority login → 200', false, e.message);
    }

    // T18: Police Officer blocked from admin routes → 403
    if (officerToken) {
        try {
            const r = await http('GET', '/api/admin/users', { token: officerToken });
            log('T18: Officer blocked from admin → 403', r.status === 403,
                `Status: ${r.status}, error: ${r.data?.error}`);
        } catch (e) {
            log('T18: Officer blocked from admin → 403', false, e.message);
        }
    } else {
        log('T18: Officer blocked from admin → 403', false, 'Skipped: no officer token', true);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 5: FIR Operations
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 5: FIR Operations ━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // T19: Create FIR without auth → 401
    try {
        const r = await http('POST', '/api/fir/create', {
            multipart: { firNumber: 'FIR/TEST/NOAUTH', incidentType: 'Test' }
        });
        log('T19: Create FIR without auth → 401', r.status === 401,
            `Status: ${r.status}`);
    } catch (e) {
        log('T19: Create FIR without auth → 401', false, e.message);
    }

    // T20: Create FIR without firNumber → 400
    try {
        const r = await http('POST', '/api/fir/create', {
            token: officerToken || adminToken,
            multipart: { incidentType: 'Test', description: 'No FIR number' }
        });
        log('T20: Create FIR without firNumber → 400', r.status === 400,
            `Status: ${r.status}, error: ${r.data?.error}`);
    } catch (e) {
        log('T20: Create FIR without firNumber → 400', false, e.message);
    }

    // T21: Judge creates FIR → 403 (RBAC)
    if (judgeToken) {
        try {
            const r = await http('POST', '/api/fir/create', {
                token: judgeToken,
                multipart: { firNumber: 'FIR/JUDGE/BLOCKED', incidentType: 'Test' }
            });
            log('T21: Judge blocked from FIR creation → 403', r.status === 403,
                `Status: ${r.status}, error: ${r.data?.error}`);
        } catch (e) {
            log('T21: Judge blocked from FIR creation → 403', false, e.message);
        }
    } else {
        log('T21: Judge blocked from FIR creation → 403', false, 'Skipped: no judge token', true);
    }

    // T22: Create FIR successfully (Police Officer) → 201
    const firNumber = `FIR/2026/TEST/${Date.now()}`;
    let firId = null;
    try {
        const tok = officerToken || adminToken;
        const r = await http('POST', '/api/fir/create', {
            token: tok,
            multipart: {
                firNumber: firNumber,
                incidentType: 'Cybercrime',
                description: 'Comprehensive test FIR',
                location: 'Test Lab, Mumbai'
            }
        });
        firId = r.data?.fir_id;
        log('T22: Create FIR → 201', r.status === 201 && !!firId,
            `Status: ${r.status}, firId: ${firId}, firNumber: ${firNumber}`);
    } catch (e) {
        log('T22: Create FIR → 201', false, e.message);
    }

    // T23: List FIRs → 200
    try {
        const tok = officerToken || adminToken;
        const r = await http('GET', '/api/fir/list', { token: tok });
        const hasFirs = r.data?.data && Array.isArray(r.data.data);
        log('T23: List FIRs → 200', r.status === 200 && hasFirs,
            `Status: ${r.status}, count: ${r.data?.data?.length}`);
    } catch (e) {
        log('T23: List FIRs → 200', false, e.message);
    }

    // T24: Get FIR by ID → 200
    if (firId) {
        try {
            const tok = officerToken || adminToken;
            const r = await http('GET', `/api/fir/${firId}`, { token: tok });
            log('T24: Get FIR by ID → 200', r.status === 200 && r.data?.firNumber === firNumber,
                `Status: ${r.status}, firNumber: ${r.data?.firNumber}`);
        } catch (e) {
            log('T24: Get FIR by ID → 200', false, e.message);
        }
    } else {
        log('T24: Get FIR by ID → 200', false, 'Skipped: no FIR created', true);
    }

    // T25: Get non-existent FIR → 404
    try {
        const tok = officerToken || adminToken;
        const r = await http('GET', `/api/fir/${crypto.randomUUID()}`, { token: tok });
        log('T25: Get non-existent FIR → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T25: Get non-existent FIR → 404', false, e.message);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 6: Evidence Pipeline
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 6: Evidence Upload Pipeline ━━━━━━━━━━━━━━━━');

    // T26: Upload evidence without auth → 401
    try {
        const r = await http('POST', '/api/evidence/upload', {
            multipart: {
                fir_id: firId || 'fake',
                file: { _file: true, filename: 'test.txt', contentType: 'text/plain', data: 'test data' }
            }
        });
        log('T26: Upload evidence without auth → 401', r.status === 401,
            `Status: ${r.status}`);
    } catch (e) {
        log('T26: Upload evidence without auth → 401', false, e.message);
    }

    // T27: Upload evidence without fir_id → 400
    if (officerToken || adminToken) {
        try {
            const r = await http('POST', '/api/evidence/upload', {
                token: officerToken || adminToken,
                multipart: {
                    file: { _file: true, filename: 'test.txt', contentType: 'text/plain', data: 'no fir_id data' }
                }
            });
            log('T27: Upload evidence without fir_id → 400', r.status === 400,
                `Status: ${r.status}, error: ${r.data?.error}`);
        } catch (e) {
            log('T27: Upload evidence without fir_id → 400', false, e.message);
        }
    }

    // T28: Upload evidence without file → 400
    if (firId && (officerToken || adminToken)) {
        try {
            const r = await http('POST', '/api/evidence/upload', {
                token: officerToken || adminToken,
                multipart: { fir_id: firId }
            });
            log('T28: Upload evidence without file → 400', r.status === 400,
                `Status: ${r.status}, error: ${r.data?.error}`);
        } catch (e) {
            log('T28: Upload evidence without file → 400', false, e.message);
        }
    }

    // T29: Judge blocked from uploading evidence → 403
    if (judgeToken && firId) {
        try {
            const r = await http('POST', '/api/evidence/upload', {
                token: judgeToken,
                multipart: {
                    fir_id: firId,
                    file: { _file: true, filename: 'judge_test.txt', contentType: 'text/plain', data: 'judge should not upload' }
                }
            });
            log('T29: Judge blocked from evidence upload → 403', r.status === 403,
                `Status: ${r.status}, error: ${r.data?.error}`);
        } catch (e) {
            log('T29: Judge blocked from evidence upload → 403', false, e.message);
        }
    } else {
        log('T29: Judge blocked from evidence upload → 403', false, 'Skipped: missing token or FIR', true);
    }

    // T30: Upload evidence successfully → 201
    let evidenceId = null;
    let uploadHash = null;
    if (firId && (officerToken || adminToken)) {
        try {
            const testContent = `SHIELD evidence test payload ${Date.now()} - ${crypto.randomBytes(16).toString('hex')}`;
            const tok = officerToken || adminToken;
            const r = await http('POST', '/api/evidence/upload', {
                token: tok,
                timeout: 15000,
                multipart: {
                    fir_id: firId,
                    file: { _file: true, filename: 'crime_scene_photo.txt', contentType: 'text/plain', data: testContent }
                }
            });
            evidenceId = r.data?.id;
            uploadHash = r.data?.sha256_hash;
            log('T30: Upload evidence → 201', r.status === 201 && !!evidenceId && !!uploadHash,
                `Status: ${r.status}, id: ${evidenceId}, hash: ${uploadHash?.substring(0, 16)}...`);
        } catch (e) {
            log('T30: Upload evidence → 201', false, e.message);
        }
    } else {
        log('T30: Upload evidence → 201', false, 'Skipped: no FIR or token', true);
    }

    // T31: Upload a second evidence file to same FIR
    let evidence2Id = null;
    if (firId && (officerToken || adminToken)) {
        try {
            const tok = officerToken || adminToken;
            const r = await http('POST', '/api/evidence/upload', {
                token: tok,
                timeout: 15000,
                multipart: {
                    fir_id: firId,
                    file: { _file: true, filename: 'witness_statement.pdf', contentType: 'application/pdf', data: `PDF evidence ${Date.now()}` }
                }
            });
            evidence2Id = r.data?.id;
            log('T31: Upload 2nd evidence to same FIR → 201', r.status === 201 && !!evidence2Id,
                `Status: ${r.status}, id: ${evidence2Id}`);
        } catch (e) {
            log('T31: Upload 2nd evidence to same FIR → 201', false, e.message);
        }
    } else {
        log('T31: Upload 2nd evidence to same FIR → 201', false, 'Skipped', true);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 7: Evidence Retrieval & Verification
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 7: Evidence Verification & Retrieval ━━━━━━━');

    // T32: List all evidence → 200
    try {
        const tok = officerToken || adminToken;
        const r = await http('GET', '/api/evidence', { token: tok });
        const hasData = r.data?.data && Array.isArray(r.data.data);
        log('T32: List all evidence → 200', r.status === 200 && hasData,
            `Status: ${r.status}, count: ${r.data?.data?.length}`);
    } catch (e) {
        log('T32: List all evidence → 200', false, e.message);
    }

    // T33: Get evidence by ID → 200
    if (evidenceId) {
        try {
            const tok = officerToken || adminToken;
            const r = await http('GET', `/api/evidence/${evidenceId}`, { token: tok });
            log('T33: Get evidence by ID → 200', r.status === 200 && r.data?.hash,
                `Status: ${r.status}, fileName: ${r.data?.fileName}, hash: ${r.data?.hash?.substring(0, 16)}...`);
        } catch (e) {
            log('T33: Get evidence by ID → 200', false, e.message);
        }
    } else {
        log('T33: Get evidence by ID → 200', false, 'Skipped: no evidence', true);
    }

    // T34: Get non-existent evidence → 404
    try {
        const tok = officerToken || adminToken;
        const r = await http('GET', `/api/evidence/${crypto.randomUUID()}`, { token: tok });
        log('T34: Get non-existent evidence → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T34: Get non-existent evidence → 404', false, e.message);
    }

    // T35: Verify evidence integrity → OK
    if (evidenceId) {
        try {
            const tok = officerToken || adminToken;
            const r = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: tok, timeout: 10000 });
            log('T35: Verify evidence integrity → OK', r.status === 200 && r.data?.status === 'OK',
                `Status: ${r.status}, result: ${r.data?.status}`);
        } catch (e) {
            log('T35: Verify evidence integrity → OK', false, e.message);
        }
    } else {
        log('T35: Verify evidence integrity → OK', false, 'Skipped: no evidence', true);
    }

    // T36: Verify non-existent evidence → 404
    try {
        const tok = officerToken || adminToken;
        const r = await http('GET', `/api/evidence/verify/${crypto.randomUUID()}`, { token: tok });
        log('T36: Verify non-existent evidence → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T36: Verify non-existent evidence → 404', false, e.message);
    }

    // T37: Download evidence (presigned URL) → redirect
    if (evidenceId) {
        try {
            const tok = officerToken || adminToken;
            const url = `${GATEWAY}/api/evidence/download/${evidenceId}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${tok}` },
                redirect: 'manual',  // Don't follow redirect
            });
            // Should be 302 redirect to MinIO presigned URL
            const location = res.headers.get('location') || '';
            const isRedirect = res.status === 302 || res.status === 301;
            log('T37: Download evidence → redirect to presigned URL',
                isRedirect && location.includes('localhost'),
                `Status: ${res.status}, redirect: ${location.substring(0, 60)}...`);
        } catch (e) {
            log('T37: Download evidence → redirect to presigned URL', false, e.message);
        }
    } else {
        log('T37: Download evidence → redirect to presigned URL', false, 'Skipped: no evidence', true);
    }

    // T38: Download non-existent evidence → 404
    try {
        const tok = officerToken || adminToken;
        const r = await http('GET', `/api/evidence/download/${crypto.randomUUID()}`, { token: tok });
        log('T38: Download non-existent evidence → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T38: Download non-existent evidence → 404', false, e.message);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 8: FIR → Evidence Linkage
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 8: FIR ↔ Evidence Linkage ━━━━━━━━━━━━━━━━━');

    // T39: Get FIR by ID and verify linked evidence
    if (firId) {
        try {
            const tok = officerToken || adminToken;
            const r = await http('GET', `/api/fir/${firId}`, { token: tok });
            const linkedCount = r.data?.linkedEvidence?.length || 0;
            log('T39: FIR has linked evidence', r.status === 200 && linkedCount >= 2,
                `Status: ${r.status}, linkedEvidence count: ${linkedCount}`);
        } catch (e) {
            log('T39: FIR has linked evidence', false, e.message);
        }
    } else {
        log('T39: FIR has linked evidence', false, 'Skipped: no FIR', true);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 9: Dashboard & Audit
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 9: Dashboard & Audit ━━━━━━━━━━━━━━━━━━━━━━');

    // T40: Dashboard stats without auth → 401
    try {
        const r = await http('GET', '/api/dashboard/stats');
        log('T40: Dashboard without auth → 401', r.status === 401,
            `Status: ${r.status}`);
    } catch (e) {
        log('T40: Dashboard without auth → 401', false, e.message);
    }

    // T41: Dashboard stats with admin → 200
    try {
        const r = await http('GET', '/api/dashboard/stats', { token: adminToken });
        const hasStats = r.data?.stats && typeof r.data.stats.totalFirs === 'number';
        log('T41: Dashboard stats → 200', r.status === 200 && hasStats,
            `Status: ${r.status}, totalFirs: ${r.data?.stats?.totalFirs}, totalEvidence: ${r.data?.stats?.totalEvidence}`);
    } catch (e) {
        log('T41: Dashboard stats → 200', false, e.message);
    }

    // T42: Dashboard stats with officer token → 200
    if (officerToken) {
        try {
            const r = await http('GET', '/api/dashboard/stats', { token: officerToken });
            log('T42: Dashboard stats (officer) → 200', r.status === 200,
                `Status: ${r.status}, stats: ${JSON.stringify(r.data?.stats)}`);
        } catch (e) {
            log('T42: Dashboard stats (officer) → 200', false, e.message);
        }
    }

    // T43: Audit log without auth → 401
    try {
        const r = await http('GET', '/api/audit');
        log('T43: Audit log without auth → 401', r.status === 401,
            `Status: ${r.status}`);
    } catch (e) {
        log('T43: Audit log without auth → 401', false, e.message);
    }

    // T44: Audit log with admin → 200
    try {
        const r = await http('GET', '/api/audit', { token: adminToken });
        const hasLog = r.data?.auditLog && Array.isArray(r.data.auditLog);
        log('T44: Audit log (admin) → 200', r.status === 200 && hasLog,
            `Status: ${r.status}, entries: ${r.data?.auditLog?.length}`);
    } catch (e) {
        log('T44: Audit log (admin) → 200', false, e.message);
    }

    // T45: Audit log with judge → 200 (judicial has access)
    if (judgeToken) {
        try {
            const r = await http('GET', '/api/audit', { token: judgeToken });
            log('T45: Audit log (judicial) → 200', r.status === 200,
                `Status: ${r.status}, entries: ${r.data?.auditLog?.length}`);
        } catch (e) {
            log('T45: Audit log (judicial) → 200', false, e.message);
        }
    }

    // T46: Audit log with officer → 403 (officer blocked)
    if (officerToken) {
        try {
            const r = await http('GET', '/api/audit', { token: officerToken });
            log('T46: Audit log (officer) → 403', r.status === 403,
                `Status: ${r.status}, error: ${r.data?.error}`);
        } catch (e) {
            log('T46: Audit log (officer) → 403', false, e.message);
        }
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 10: Security & Edge Cases
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 10: Security & Edge Cases ━━━━━━━━━━━━━━━━━');

    // T47: Invalid JWT token → 401 or 403
    try {
        const r = await http('GET', '/api/fir/list', {
            token: 'invalid.jwt.token_here'
        });
        log('T47: Invalid JWT → 401/403', r.status === 401 || r.status === 403,
            `Status: ${r.status}`);
    } catch (e) {
        log('T47: Invalid JWT → 401/403', false, e.message);
    }

    // T48: Expired JWT token → 401 or 403
    try {
        // Create a real but expired JWT using the token structure
        const expiredPayload = Buffer.from(JSON.stringify({
            id: crypto.randomUUID(), role: 'Police Officer', iat: 1000000, exp: 1000001
        })).toString('base64url');
        const fakeToken = `eyJhbGciOiJIUzI1NiJ9.${expiredPayload}.invalidsignature`;
        const r = await http('GET', '/api/fir/list', { token: fakeToken });
        log('T48: Expired/malformed JWT → 401/403', r.status === 401 || r.status === 403,
            `Status: ${r.status}`);
    } catch (e) {
        log('T48: Expired/malformed JWT → 401/403', false, e.message);
    }

    // T49: Deactivate user and try login → 403
    if (officerUserId && adminToken) {
        try {
            // First deactivate the officer
            await http('PATCH', `/api/admin/users/${officerUserId}`, {
                token: adminToken,
                body: { status: 'deactivated' }
            });

            // Try to login as deactivated user
            const r = await http('POST', '/api/auth/login', {
                body: { email: officerEmail, password: officerPassword, role: 'Police Officer' }
            });
            log('T49: Deactivated user login → 403', r.status === 403,
                `Status: ${r.status}, error: ${r.data?.error}`);

            // Re-activate the user for further tests
            await http('PATCH', `/api/admin/users/${officerUserId}`, {
                token: adminToken,
                body: { status: 'active' }
            });
        } catch (e) {
            log('T49: Deactivated user login → 403', false, e.message);
        }
    } else {
        log('T49: Deactivated user login → 403', false, 'Skipped: no user to deactivate', true);
    }

    // T50: Create second FIR and verify FIR listing count increases
    try {
        const tok = officerToken || adminToken;
        const listBefore = await http('GET', '/api/fir/list', { token: tok });
        const countBefore = listBefore.data?.data?.length || 0;

        await http('POST', '/api/fir/create', {
            token: tok,
            multipart: {
                firNumber: `FIR/2026/COUNT/${Date.now()}`,
                incidentType: 'Theft',
                description: 'Count test FIR',
                location: 'Count Test Lab'
            }
        });

        const listAfter = await http('GET', '/api/fir/list', { token: tok });
        const countAfter = listAfter.data?.data?.length || 0;
        log('T50: FIR count increases after creation', countAfter > countBefore,
            `Before: ${countBefore}, After: ${countAfter}`);
    } catch (e) {
        log('T50: FIR count increases after creation', false, e.message);
    }

    // ═════════════════════════════════════════════════════════
    // FINAL REPORT
    // ═════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log(`║   📊 RESULTS: ${passCount} passed, ${failCount} failed, ${skipCount} skipped     `);
    console.log(`║   Total: ${passCount + failCount + skipCount} tests                                    `);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    if (failCount > 0) {
        console.log('❌ FAILED TESTS:');
        results.filter(r => !r.passed && !r.skipped).forEach(r => {
            console.log(`   • ${r.testName}`);
            if (r.details) console.log(`     ${r.details}`);
        });
        console.log('');
    }

    if (skipCount > 0) {
        console.log(`⏭️  SKIPPED: ${skipCount} tests (due to dependency failures)`);
    }

    if (failCount === 0) {
        console.log('🎉 ALL TESTS PASSED! Backend is fully functional.');
    }

    process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('💀 Fatal test error:', err);
    process.exit(1);
});
