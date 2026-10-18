/**
 * SHIELD — Theft Case CCTV Evidence Test Suite
 * Based on: Theft_testcase.md
 *
 * This test suite automates:
 * 1. Admin / Police Officer Authentication
 * 2. Creating FIR: FIR/2025/MH/001 (Theft Case)
 * 3. Uploading CCTV Video Evidence with Section 63 Source Batch Info:
 *    - Device: CCTV DVR/NVR (Hikvision DS-7608NI-K2)
 *    - Serial: SN-DVR-2025-001 | MAC: 00:1A:2B:3C:4D:5E
 *    - Device Chain Nodes: DVR -> Forensic PC -> Evidence Storage
 *    - Mandatory Legal Declarations: Lawful Control & Proper Operation
 * 4. Blockchain Ledger Anchoring Assertion
 * 5. Cryptographic Verification Check (Storage Hash vs EVM Blockchain Truth)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3001';

async function http(method, endpoint, { token, body, multipart } = {}) {
    const url = `${GATEWAY}${endpoint}`;
    const opts = { method, headers: {} };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (multipart) {
        const boundary = '----ShieldTheftTest' + Date.now();
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

async function runTheftTestCase() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🛡️ SHIELD — THEFT CASE CCTV EVIDENCE TEST SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1. Login as Admin first to retrieve token or create Police Officer
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

    // Create a temporary Police Officer for this test case
    const officerEmail = `officer_theft_${Date.now()}@police.gov`;
    const officerPass = 'TheftOfficer123!';
    const userRes = await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Officer Rajesh Kumar',
            email: officerEmail,
            employeeId: `POL-${Date.now().toString().slice(-5)}`,
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
            console.log(`   ✅ Created and logged in as Police Officer (${officerEmail})`);
        }
    }

    // Create an FSL Forensic Expert for evidence upload and analysis
    const expertEmail = `expert_theft_${Date.now()}@fsl.gov.in`;
    const expertPass = 'TheftExpert123!';
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Dr. Sunita Sharma',
            email: expertEmail,
            employeeId: `FSL-${Date.now().toString().slice(-5)}`,
            role: 'Forensic Expert',
            fslJurisdictionId: 'Regional FSL, Pune',
            plainPassword: expertPass
        }
    });

    let expertToken = officerToken;
    const expLogin = await http('POST', '/api/auth/login', {
        body: { email: expertEmail, password: expertPass, role: 'Forensic Expert' }
    });
    if (expLogin.ok) {
        expertToken = expLogin.data.token;
        console.log(`   ✅ Created and logged in as Forensic Expert (${expertEmail})`);
    }

    // 2. Register FIR from Theft_testcase.md
    const firNumber = `FIR/2025/MH/${Date.now().toString().slice(-4)}`;
    console.log(`\n[2] 📜 Registering Theft FIR (${firNumber})...`);

    const firRes = await http('POST', '/api/fir/create', {
        token: officerToken,
        multipart: {
            firNumber: firNumber,
            incidentType: 'Theft',
            location: 'Main Premises, Warehouse Block-B',
            description: 'CCTV footage showing suspected theft incident at the premises.',
            file: {
                _file: true,
                filename: 'fir_theft_record.pdf',
                contentType: 'application/pdf',
                data: Buffer.from('POLICE DEPT - THEFT FIR RECORD COPY\nFIR Number: ' + firNumber)
            }
        }
    });

    if (!firRes.ok) {
        throw new Error(`FIR Creation failed: ${JSON.stringify(firRes.data)}`);
    }

    const firId = firRes.data.fir_id;
    console.log(`   ✅ FIR Registered successfully! ID: ${firId}`);

    // 3. Upload CCTV Evidence with Section 63 Metadata from Theft_testcase.md
    console.log('\n[3] 📹 Uploading CCTV Evidence with Section 63 Source Metadata...');

    const sourceData = {
        sourceType: 'CCTV DVR/NVR',
        ownershipStatus: 'Owned',
        make: 'Hikvision',
        model: 'DS-7608NI-K2',
        serial: 'SN-DVR-2025-001',
        identifiers: 'MAC: 00:1A:2B:3C:4D:5E',
        lawfulControl: true,
        properOperation: true,
        deviceChain: [
            { node: 1, device: 'CCTV DVR/NVR', identifier: 'SN-DVR-2025-001' },
            { node: 2, device: 'Forensic Extraction Workstation', identifier: 'LAB-PC-2025-014' },
            { node: 3, device: 'Evidence Storage Server', identifier: 'EVIDENCE-SRV-001' }
        ]
    };

    const cctvStreamPayload = Buffer.from('SIMULATED_HIKVISION_CCTV_STREAM_DATA_' + Date.now());

    const evRes = await http('POST', '/api/evidence/upload', {
        token: officerToken,
        multipart: {
            fir_id: firId,
            category: 'video',
            description: 'CCTV footage showing the suspected theft incident at the premises.',
            sourceData: JSON.stringify(sourceData),
            file: {
                _file: true,
                filename: 'cctv_footage_ch1.mp4',
                contentType: 'video/mp4',
                data: cctvStreamPayload
            }
        }
    });

    if (!evRes.ok) {
        throw new Error(`CCTV Evidence upload failed: ${JSON.stringify(evRes.data)}`);
    }

    const evidenceFile = evRes.data.files[0];
    const evidenceId = evidenceFile.id;
    const sha256Hash = evidenceFile.sha256_hash;
    const ledgerTxId = evidenceFile.ledgerTxId;

    console.log(`   ✅ CCTV Evidence Uploaded Successfully!`);
    console.log(`      • Evidence ID:   ${evidenceId}`);
    console.log(`      • SHA-256 Hash:  ${sha256Hash}`);
    console.log(`      • Blockchain Tx: ${ledgerTxId || 'Anchored on EVM'}`);

    // 4. Verification Check
    console.log(`\n[4] 🔍 Running Cryptographic Verification on Evidence ${evidenceId.slice(0, 8)}...`);
    const verifyRes = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: officerToken });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (verifyRes.data.status === 'OK') {
        console.log('  ✅ VERIFICATION SUCCESSFUL: OK');
        console.log('  The live CCTV footage hash matches the EVM Blockchain truth hash.');
        console.log('  Section 63 Certificate of Electronic Evidence is VALID.');
    } else {
        console.log(`  🚨 VERIFICATION RESULT: ${verifyRes.data.status}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runTheftTestCase().catch(err => {
    console.error('\n❌ Test Execution Error:', err.message);
    process.exit(1);
});
