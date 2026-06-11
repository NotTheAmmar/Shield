/**
 * SHIELD — Comprehensive Backend Test Suite
 * Tests ALL backend API endpoints across all 4 microservices.
 * Run: node shield_comprehensive_test.js
 * Requires: Docker stack running (docker compose up --build -d)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const GATEWAY = 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@shield.gov.in';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'admin_password';
const ADMIN_ROLE = 'Admin';

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

async function http(method, path, { token, body, headers = {}, multipart, timeout = 8000, cookies } = {}) {
    const url = `${GATEWAY}${path}`;
    const opts = { method, headers: { ...headers } };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (cookies) opts.headers['Cookie'] = cookies;

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

    // T6: Successful Admin login → 200 + JWT
    let adminToken = null;
    try {
        const r = await http('POST', '/api/auth/login', {
            body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: ADMIN_ROLE }
        });
        adminToken = r.data?.token;
        log('T6: Admin login → 200 + JWT', r.status === 200 && !!adminToken && !!r.data?.user,
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
            multipart: { 
                incidentType: 'Test', 
                description: 'No FIR number',
                file: { _file: true, filename: 'fir_document.pdf', contentType: 'application/pdf', data: 'MOCK FIR PDF CONTENT' }
            }
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
                multipart: { 
                    firNumber: 'FIR/JUDGE/BLOCKED', 
                    incidentType: 'Test',
                    file: { _file: true, filename: 'fir_document.pdf', contentType: 'application/pdf', data: 'MOCK FIR PDF CONTENT' }
                }
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
                location: 'Test Lab, Mumbai',
                file: { _file: true, filename: 'fir_document.pdf', contentType: 'application/pdf', data: 'MOCK FIR PDF CONTENT' }
            }
        });
        firId = r.data?.fir_id;
        log('T22: Create FIR → 201', r.status === 201 && !!firId,
            `Status: ${r.status}, firId: ${firId}, firNumber: ${firNumber}`);
    } catch (e) {
        log('T22: Create FIR → 201', false, e.message);
    }


    // T23: List FIRs → 200
    if (officerToken) {
        try {
            const r = await http('GET', '/api/fir/list', { token: officerToken });
            const hasFirs = r.data?.data && Array.isArray(r.data.data);
            log('T23: List FIRs → 200', r.status === 200 && hasFirs,
                `Status: ${r.status}, count: ${r.data?.data?.length}`);
        } catch (e) {
            log('T23: List FIRs → 200', false, e.message);
        }
    } else {
        log('T23: List FIRs → 200', false, 'Skipped: no officer token', true);
    }

    // T24: Get FIR by ID → 200
    if (firId && officerToken) {
        try {
            const r = await http('GET', `/api/fir/${firId}`, { token: officerToken });
            log('T24: Get FIR by ID → 200', r.status === 200 && r.data?.firNumber === firNumber,
                `Status: ${r.status}, firNumber: ${r.data?.firNumber}`);
        } catch (e) {
            log('T24: Get FIR by ID → 200', false, e.message);
        }
    } else {
        log('T24: Get FIR by ID → 200', false, 'Skipped: no FIR created', true);
    }

    // T24b: Get FIR with Admin Token -> 403 (Zero-Trust)
    if (adminToken && firId) {
        try {
            const r = await http('GET', `/api/fir/${firId}`, { token: adminToken });
            log('T24b: Admin blocked from FIR read → 403', r.status === 403,
                `Status: ${r.status}`);
        } catch (e) {
            log('T24b: Admin blocked from FIR read → 403', false, e.message);
        }
    }


    // T25: Get non-existent FIR → 404
    try {
        const r = await http('GET', `/api/fir/${crypto.randomUUID()}`, { token: officerToken || judgeToken });
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
    if (officerToken) {
        try {
            const r = await http('POST', '/api/evidence/upload', {
                token: officerToken,
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
    if (firId && officerToken) {
        try {
            const r = await http('POST', '/api/evidence/upload', {
                token: officerToken,
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
    if (firId && officerToken) {
        try {
            const testContent = `SHIELD evidence test payload ${Date.now()} - ${crypto.randomBytes(16).toString('hex')}`;
            const r = await http('POST', '/api/evidence/upload', {
                token: officerToken,
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
    if (firId && officerToken) {
        try {
            const r = await http('POST', '/api/evidence/upload', {
                token: officerToken,
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
    if (officerToken) {
        try {
            const r = await http('GET', '/api/evidence', { token: officerToken });
            const hasData = r.data?.data && Array.isArray(r.data.data);
            log('T32: List all evidence → 200', r.status === 200 && hasData,
                `Status: ${r.status}, count: ${r.data?.data?.length}`);
        } catch (e) {
            log('T32: List all evidence → 200', false, e.message);
        }
    }

    // T33: Get evidence by ID → 200
    if (evidenceId && officerToken) {
        try {
            const r = await http('GET', `/api/evidence/${evidenceId}`, { token: officerToken });
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
        const r = await http('GET', `/api/evidence/${crypto.randomUUID()}`, { token: officerToken || judgeToken });
        log('T34: Get non-existent evidence → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T34: Get non-existent evidence → 404', false, e.message);
    }

    // T35: Verify evidence integrity → OK
    if (evidenceId && officerToken) {
        try {
            const r = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: officerToken, timeout: 10000 });
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
        const r = await http('GET', `/api/evidence/verify/${crypto.randomUUID()}`, { token: officerToken || judgeToken });
        log('T36: Verify non-existent evidence → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T36: Verify non-existent evidence → 404', false, e.message);
    }

    // T37: Download evidence (presigned URL) → redirect
    if (evidenceId && officerToken) {
        try {
            const url = `${GATEWAY}/api/evidence/download/${evidenceId}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${officerToken}` },
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
        const r = await http('GET', `/api/evidence/download/${crypto.randomUUID()}`, { token: officerToken || judgeToken });
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
    if (firId && officerToken) {
        try {
            const r = await http('GET', `/api/fir/${firId}`, { token: officerToken });
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

    // T41: Dashboard stats with admin → 403 (Zero-Trust Restriction)
    try {
        const r = await http('GET', '/api/dashboard/stats', { token: adminToken });
        log('T41: Dashboard stats (admin blocked) → 403', r.status === 403,
            `Status: ${r.status}`);
    } catch (e) {
        log('T41: Dashboard stats (admin blocked) → 403', false, e.message);
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

    // T44: Audit log with admin → 403 (Zero-Trust Restriction)
    try {
        const r = await http('GET', '/api/audit', { token: adminToken });
        log('T44: Audit log (admin blocked) → 403', r.status === 403,
            `Status: ${r.status}`);
    } catch (e) {
        log('T44: Audit log (admin blocked) → 403', false, e.message);
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
                location: 'Count Test Lab',
                file: { _file: true, filename: 'fir_document_2.pdf', contentType: 'application/pdf', data: 'MOCK FIR PDF CONTENT 2' }
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
    // PHASE 11: Forensic Reports & Metadata
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 11: Forensic Reports & Metadata ━━━━━━━━━━━');

    // T51: Get Chain of Custody (officer allowed)
    if (evidenceId && officerToken) {
        try {
            const r = await http('GET', `/api/reports/chain-of-custody/${evidenceId}`, { token: officerToken });
            log('T51: Get Chain of Custody (JSON) → 200', r.status === 200 && r.data?.evidence?.id === evidenceId,
                `Status: ${r.status}, fileName: ${r.data?.evidence?.fileName}`);
        } catch (e) {
            log('T51: Get Chain of Custody (JSON) → 200', false, e.message);
        }
    } else {
        log('T51: Get Chain of Custody (JSON) → 200', false, 'Skipped: no evidence', true);
    }

    // T52: Get Evidence Metadata (officer allowed)
    if (evidenceId && officerToken) {
        try {
            const r = await http('GET', `/api/reports/metadata/${evidenceId}`, { token: officerToken });
            log('T52: Get Evidence Metadata → 200', r.status === 200 && r.data?.forensicFlags !== undefined,
                `Status: ${r.status}, flagsCount: ${r.data?.forensicFlags?.length}`);
        } catch (e) {
            log('T52: Get Evidence Metadata → 200', false, e.message);
        }
    } else {
        log('T52: Get Evidence Metadata → 200', false, 'Skipped: no evidence', true);
    }

    // T53: Request PDF Forensic Report (officer allowed)
    let reportJobId = null;
    if (evidenceId && officerToken) {
        try {
            const r = await http('POST', `/api/reports/chain-of-custody/${evidenceId}/pdf`, { token: officerToken });
            reportJobId = r.data?.jobId;
            log('T53: Request PDF Report (BullMQ Queue) → 200', r.status === 200 && !!reportJobId,
                `Status: ${r.status}, jobId: ${reportJobId}`);
        } catch (e) {
            log('T53: Request PDF Report (BullMQ Queue) → 200', false, e.message);
        }
    } else {
        log('T53: Request PDF Report (BullMQ Queue) → 200', false, 'Skipped: no evidence', true);
    }

    // T54: Check PDF Report Job Status (officer allowed)
    if (reportJobId && officerToken) {
        try {
            const r = await http('GET', `/api/reports/status/${reportJobId}`, { token: officerToken });
            log('T54: Check PDF Job Status → 200', r.status === 200 && r.data?.status !== undefined,
                `Status: ${r.status}, jobStatus: ${r.data?.status}`);
        } catch (e) {
            log('T54: Check PDF Job Status → 200', false, e.message);
        }
    } else {
        log('T54: Check PDF Job Status → 200', false, 'Skipped: no job queued', true);
    }

    // T54b: Poll PDF Job Status until READY and Download PDF
    if (reportJobId && officerToken) {
        try {
            let attempts = 0;
            let jobReady = false;
            let statusRes = null;
            while (attempts < 10 && !jobReady) {
                statusRes = await http('GET', `/api/reports/status/${reportJobId}`, { token: officerToken });
                if (statusRes.status === 200 && statusRes.data?.status === 'READY') {
                    jobReady = true;
                    break;
                }
                attempts++;
                await sleep(1000); // Wait 1s between attempts
            }

            if (jobReady) {
                log('T54b: Poll PDF Job Status to READY → OK', true, `READY after ${attempts} attempts`);
                
                // Now download the PDF!
                const downloadRes = await http('GET', `/api/reports/download/${reportJobId}`, { token: officerToken });
                const isPdf = downloadRes.status === 200 && downloadRes.headers.get('content-type')?.includes('application/pdf');
                log('T54c: Download PDF Report → 200 + PDF Content', isPdf,
                    `Status: ${downloadRes.status}, contentType: ${downloadRes.headers.get('content-type')}`);
            } else {
                log('T54b: Poll PDF Job Status to READY → OK', false, `Job did not become READY, last status: ${statusRes?.data?.status}`);
                log('T54c: Download PDF Report → 200 + PDF Content', false, 'Skipped: job not ready', true);
            }
        } catch (e) {
            log('T54b: Poll PDF Job Status to READY → OK', false, e.message);
            log('T54c: Download PDF Report → 200 + PDF Content', false, 'Skipped due to error', true);
        }
    } else {
        log('T54b: Poll PDF Job Status to READY → OK', false, 'Skipped: no job queued', true);
        log('T54c: Download PDF Report → 200 + PDF Content', false, 'Skipped', true);
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 12: Advanced Auth & Admin Operations
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 12: Advanced Auth & Admin Operations ━━━━━━');

    // T55: Get Admin User Detail by ID (admin allowed)
    if (officerUserId && adminToken) {
        try {
            const r = await http('GET', `/api/admin/users/${officerUserId}`, { token: adminToken });
            log('T55: Get User Detail by ID → 200', r.status === 200 && r.data?.user?.id === officerUserId,
                `Status: ${r.status}, name: ${r.data?.user?.name}`);
        } catch (e) {
            log('T55: Get User Detail by ID → 200', false, e.message);
        }
    } else {
        log('T55: Get User Detail by ID → 200', false, 'Skipped: no user ID', true);
    }

    // T56: Get Non-existent User Detail by ID → 404
    try {
        const r = await http('GET', `/api/admin/users/${crypto.randomUUID()}`, { token: adminToken });
        log('T56: Get non-existent User Detail → 404', r.status === 404,
            `Status: ${r.status}`);
    } catch (e) {
        log('T56: Get non-existent User Detail → 404', false, e.message);
    }

    // T57: Reset User Password (admin allowed)
    if (officerUserId && adminToken) {
        try {
            const r = await http('POST', `/api/admin/users/${officerUserId}/reset-password`, {
                token: adminToken,
                body: { plainPassword: 'NewResettedPassword123!' }
            });
            log('T57: Admin Reset User Password → 200', r.status === 200 && r.data?.user?.email !== undefined,
                `Status: ${r.status}, message: ${r.data?.message}`);
        } catch (e) {
            log('T57: Admin Reset User Password → 200', false, e.message);
        }
    } else {
        log('T57: Admin Reset User Password → 200', false, 'Skipped: no user ID', true);
    }

    // T58: Verify First-Login Flag and Change Password flow (Cookie Auth)
    if (officerEmail) {
        try {
            // First login with newly reset password
            const loginRes = await http('POST', '/api/auth/login', {
                body: { email: officerEmail, password: 'NewResettedPassword123!', role: 'Police Officer' }
            });
            const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
            const parsedCookies = setCookies.map(c => c.split(';')[0]).join('; ');
            
            const hasChangePasswordFlag = loginRes.data?.user?.mustChangePassword === true;
            log('T58a: Reset trigger sets mustChangePassword to true', hasChangePasswordFlag,
                `mustChangePassword: ${hasChangePasswordFlag}`);

            // Now call change-password using HttpOnly access cookie
            if (parsedCookies) {
                const changeRes = await http('POST', '/api/auth/change-password', {
                    cookies: parsedCookies,
                    body: {
                        currentPassword: 'NewResettedPassword123!',
                        newPassword: 'FinalOfficerPassword2026!'
                    }
                });
                log('T58b: Change Password with HttpOnly session cookie → 200', changeRes.status === 200,
                    `Status: ${changeRes.status}, message: ${changeRes.data?.message}`);

                // Try login again with final password
                const loginFinal = await http('POST', '/api/auth/login', {
                    body: { email: officerEmail, password: 'FinalOfficerPassword2026!', role: 'Police Officer' }
                });
                log('T58c: Login with final updated password → 200', loginFinal.status === 200,
                    `Status: ${loginFinal.status}, mustChangePassword: ${loginFinal.data?.user?.mustChangePassword}`);
            } else {
                log('T58b: Change Password with HttpOnly session cookie → 200', false, 'Skipped: could not capture cookies');
                log('T58c: Login with final updated password → 200', false, 'Skipped', true);
            }
        } catch (e) {
            log('T58a: First-Login / Change Password flow', false, e.message);
        }
    }

    // T59: Get current user details via /auth/me cookie endpoint
    if (officerEmail) {
        try {
            const loginRes = await http('POST', '/api/auth/login', {
                body: { email: officerEmail, password: 'FinalOfficerPassword2026!', role: 'Police Officer' }
            });
            const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
            const parsedCookies = setCookies.map(c => c.split(';')[0]).join('; ');
            
            if (parsedCookies) {
                const meRes = await http('GET', '/api/auth/me', { cookies: parsedCookies });
                log('T59: Get current user detail (/auth/me) → 200', meRes.status === 200 && meRes.data?.user?.email === officerEmail,
                    `Status: ${meRes.status}, user: ${meRes.data?.user?.name}`);
            } else {
                log('T59: Get current user detail (/auth/me) → 200', false, 'Skipped: could not capture cookies', true);
            }
        } catch (e) {
            log('T59: Get current user detail (/auth/me) → 200', false, e.message);
        }
    }

    // T60: Refresh auth session cookie via /auth/refresh
    if (officerEmail) {
        try {
            const loginRes = await http('POST', '/api/auth/login', {
                body: { email: officerEmail, password: 'FinalOfficerPassword2026!', role: 'Police Officer' }
            });
            const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
            const parsedCookies = setCookies.map(c => c.split(';')[0]).join('; ');
            
            if (parsedCookies) {
                const refreshRes = await http('POST', '/api/auth/refresh', { cookies: parsedCookies });
                log('T60: Refresh user session cookie → 200', refreshRes.status === 200,
                    `Status: ${refreshRes.status}, message: ${refreshRes.data?.message}`);
            } else {
                log('T60: Refresh user session cookie → 200', false, 'Skipped: could not capture cookies', true);
            }
        } catch (e) {
            log('T60: Refresh user session cookie → 200', false, e.message);
        }
    }

    // ═════════════════════════════════════════════════════════
    // PHASE 13: Internal Network Admin endpoints & Zero-Trust
    // ═════════════════════════════════════════════════════════
    console.log('\n━━ PHASE 13: Internal Admin Operations & Zero-Trust ━━');

    // T61: Get internal evidence list (admin allowed)
    let internalEvidenceId = null;
    try {
        const r = await http('GET', '/api/evidence/internal/list', { token: adminToken });
        const hasRecords = r.data?.records && Array.isArray(r.data.records);
        if (hasRecords && r.data.records.length > 0) {
            internalEvidenceId = r.data.records[0].id;
        }
        log('T61: Internal evidence list (admin allowed) → 200', r.status === 200 && hasRecords,
            `Status: ${r.status}, count: ${r.data?.records?.length}`);
    } catch (e) {
        log('T61: Internal evidence list (admin allowed) → 200', false, e.message);
    }

    // T62: Internal evidence list (officer blocked) → 403
    if (officerToken) {
        try {
            const r = await http('GET', '/api/evidence/internal/list', { token: officerToken });
            log('T62: Internal evidence list (officer blocked) → 403', r.status === 403,
                `Status: ${r.status}`);
        } catch (e) {
            log('T62: Internal evidence list (officer blocked) → 403', false, e.message);
        }
    } else {
        log('T62: Internal evidence list (officer blocked) → 403', false, 'Skipped: no officer token', true);
    }

    // T63: Internal batch verification (admin allowed)
    if (evidenceId) {
        try {
            const r = await http('POST', '/api/evidence/internal/verify-batch', {
                token: adminToken,
                body: { ids: [evidenceId] }
            });
            const success = r.status === 200 && r.data?.results?.[evidenceId]?.status === 'OK';
            log('T63: Internal batch verification (admin allowed) → 200', success,
                `Status: ${r.status}, result: ${r.data?.results?.[evidenceId]?.status}`);
        } catch (e) {
            log('T63: Internal batch verification (admin allowed) → 200', false, e.message);
        }
    } else {
        log('T63: Internal batch verification (admin allowed) → 200', false, 'Skipped: no evidence ID found', true);
    }

    // T64: Internal batch verification (officer blocked) → 403
    if (evidenceId && officerToken) {
        try {
            const r = await http('POST', '/api/evidence/internal/verify-batch', {
                token: officerToken,
                body: { ids: [evidenceId] }
            });
            log('T64: Internal batch verification (officer blocked) → 403', r.status === 403,
                `Status: ${r.status}`);
        } catch (e) {
            log('T64: Internal batch verification (officer blocked) → 403', false, e.message);
        }
    } else {
        log('T64: Internal batch verification (officer blocked) → 403', false, 'Skipped', true);
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
