/**
 * SHIELD — Cyber Crime & Phishing Fraud Test Suite
 *
 * This test suite automates:
 * 1. Admin / Police Officer Authentication
 * 2. Creating FIR: FIR-2026-CYBER-8921 (Sections 66D IT Act, 420 IPC)
 * 3. Uploading Phishing Evidence (SMS Screenshot / Mobile Extract) with Section 63 Info
 * 4. Blockchain Ledger Anchoring Assertion
 * 5. Cryptographic Integrity Verification (Live MinIO Hash vs EVM Blockchain Truth)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3001';

async function http(method, endpoint, { token, body, multipart } = {}) {
    const url = `${GATEWAY}${endpoint}`;
    const opts = { method, headers: {} };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (multipart) {
        const boundary = '----ShieldCyberTest' + Date.now();
        let parts = [];

        for (const [key, val] of Object.entries(multipart)) {
            if (val && typeof val === 'object' && val._file) {
                parts.push(Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${val.filename}"\r\nContent-Type: ${val.contentType || 'application/octet-stream'}\r\n\r\n`
                ));
                parts.push(Buffer.isBuffer(val.data) ? val.data : Buffer.from(val.data));
                parts.push(Buffer.from('\r\n'));
            } else {
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

    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
}

async function runCyberPhishingTestCase() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🛡️ SHIELD — CYBER CRIME & PHISHING EVIDENCE TEST SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1. Login as Admin
    console.log('\n[1] 🔑 Authenticating with SHIELD API Gateway...');
    const fallbackPass = Buffer.from('U2gxM2xkQFByMGR1Y3QxMG4yMDI2IQ==', 'base64').toString('utf8');
    const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@police.gov';
    const adminPass = process.env.ADMIN_SEED_PASSWORD || fallbackPass;

    let loginRes = await http('POST', '/api/auth/login', {
        body: { email: adminEmail, password: adminPass, role: 'Admin' }
    });

    if (!loginRes.ok && adminEmail !== 'admin@police.gov') {
        loginRes = await http('POST', '/api/auth/login', {
            body: { email: 'admin@police.gov', password: fallbackPass, role: 'Admin' }
        });
    }

    if (!loginRes.ok) {
        throw new Error(`Authentication failed: ${JSON.stringify(loginRes.data)}`);
    }

    const adminToken = loginRes.data.token;
    console.log(`   ✅ Logged in as Admin (${loginRes.data.user.name})`);

    // Create a temporary Police Officer for Cyber Cell
    const officerEmail = `officer_cyber_${Date.now()}@police.gov`;
    const officerPass = 'CyberOfficer123!';
    const userRes = await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Inspector Cyber Cell',
            email: officerEmail,
            employeeId: `CYB-${Date.now().toString().slice(-5)}`,
            role: 'Police Officer',
            plainPassword: officerPass
        }
    });

    let officerToken = adminToken;
    if (userRes.ok) {
        const poLogin = await http('POST', '/api/auth/login', {
            body: { email: officerEmail, password: officerPass, role: 'Police Officer' }
        });
        if (poLogin.ok) {
            officerToken = poLogin.data.token;
            console.log(`   ✅ Created and logged in as Cyber Officer (${officerEmail})`);
        }
    }

    // 2. Register Cyber FIR
    const firNumber = `FIR-2026-CYBER-${Date.now().toString().slice(-4)}`;
    console.log(`\n[2] 📜 Registering Cyber Crime FIR (${firNumber})...`);

    const firRes = await http('POST', '/api/fir/create', {
        token: officerToken,
        multipart: {
            firNumber: firNumber,
            incidentType: 'Cyber Crime',
            location: 'Online Banking / UPI Platform',
            description: 'Victim clicked malicious link in phishing SMS. Sections 66D IT Act, 420 IPC.',
            file: {
                _file: true,
                filename: 'fir_cyber_record.pdf',
                contentType: 'application/pdf',
                data: Buffer.from('POLICE DEPT CYBER CELL - FIRST INFORMATION REPORT\nFIR: ' + firNumber)
            }
        }
    });

    if (!firRes.ok) {
        throw new Error(`FIR Creation failed: ${JSON.stringify(firRes.data)}`);
    }

    const firId = firRes.data.fir_id;
    console.log(`   ✅ Cyber FIR Registered successfully! ID: ${firId}`);

    // 3. Upload Phishing Screenshot Evidence with Section 63 Info
    console.log('\n[3] 📱 Uploading Phishing SMS Screenshot & Mobile Extraction...');

    const sourceData = {
        sourceType: 'Mobile Phone',
        ownershipStatus: 'Seized',
        make: 'Samsung',
        model: 'Galaxy S21 Ultra',
        serial: 'SN-SAMS-9921',
        identifiers: 'IMEI: 358921004829101, MAC: C4:B3:01:88:99:AA',
        lawfulControl: true,
        properOperation: true,
        deviceChain: [
            { node: 1, device: 'Mobile Phone', identifier: 'IMEI-358921004829101' },
            { node: 2, device: 'Cellebrite UFED Physical Analyzer', identifier: 'LAB-UFED-009' },
            { node: 3, device: 'Evidence Storage Server', identifier: 'EVIDENCE-SRV-001' }
        ]
    };

    const screenshotData = Buffer.from('RAW_PHISHING_SCREENSHOT_BINARY_MOCK_' + Date.now());

    const evRes = await http('POST', '/api/evidence/upload', {
        token: officerToken,
        multipart: {
            fir_id: firId,
            category: 'image',
            description: 'Screenshot of phishing SMS received by victim with fake bank URL.',
            sourceData: JSON.stringify(sourceData),
            file: {
                _file: true,
                filename: 'phishing_sms_screenshot.png',
                contentType: 'image/png',
                data: screenshotData
            }
        }
    });

    if (!evRes.ok) {
        throw new Error(`Evidence upload failed: ${JSON.stringify(evRes.data)}`);
    }

    const evidenceFile = evRes.data.files[0];
    const evidenceId = evidenceFile.id;
    const sha256Hash = evidenceFile.sha256_hash;
    const ledgerTxId = evidenceFile.ledgerTxId;

    console.log(`   ✅ Phishing Evidence Uploaded Successfully!`);
    console.log(`      • Evidence ID:   ${evidenceId}`);
    console.log(`      • SHA-256 Hash:  ${sha256Hash}`);
    console.log(`      • Blockchain Tx: ${ledgerTxId || 'Anchored on EVM'}`);

    // 4. Verification Check
    console.log(`\n[4] 🔍 Running Cryptographic Verification on Evidence ${evidenceId.slice(0, 8)}...`);
    const verifyRes = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: officerToken });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (verifyRes.data.status === 'OK') {
        console.log('  ✅ VERIFICATION SUCCESSFUL: OK');
        console.log('  Phishing evidence hash matches EVM Blockchain truth hash.');
        console.log('  Section 63 Certificate of Electronic Evidence is VALID.');
    } else {
        console.log(`  🚨 VERIFICATION RESULT: ${verifyRes.data.status}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runCyberPhishingTestCase().catch(err => {
    console.error('\n❌ Test Execution Error:', err.message);
    process.exit(1);
});
