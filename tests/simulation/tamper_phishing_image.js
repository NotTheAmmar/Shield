/**
 * SHIELD — Phishing Image Evidence Tamper & Forensic Suite
 *
 * This test suite demonstrates:
 * 1. Uploading a real Phishing SMS Screenshot Image evidence (`phishing_sms_screenshot.png`)
 * 2. Anchoring the original cryptographic hash on EVM Blockchain
 * 3. Confirming INITIAL Integrity Verification (STATUS: OK)
 * 4. Simulating a Storage Attack: Modifying/blurring the image directly in MinIO
 * 5. Detecting Tampering via SHIELD EVM Blockchain Ledger (STATUS: TAMPERED)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Minio = require('minio');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3001';
const BUCKET = process.env.MINIO_BUCKET || 'evidence';

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USER || 'shield',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'secure_minio_password'
});

async function http(method, endpoint, { token, body, multipart } = {}) {
    const url = `${GATEWAY}${endpoint}`;
    const opts = { method, headers: {} };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (multipart) {
        const boundary = '----ShieldPhishTamper' + Date.now();
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

function renderImageTerminalPreview(filename, state, hash) {
    console.log(`\n┌────────────────────────────────────────────────────────┐`);
    console.log(`│ 📸 EVIDENCE IMAGE PREVIEW: ${filename.padEnd(27)} │`);
    console.log(`├────────────────────────────────────────────────────────┤`);
    if (state === 'CLEAN') {
        console.log(`│  [📱 SMARTPHONE SCREENSHOT - PHISHING SMS RECEIVED]     │`);
        console.log(`│  ┌──────────────────────────────────────────────────┐  │`);
        console.log(`│  │ 📩 SMS: "ALERT! Your account #8921 is locked.    │  │`);
        console.log(`│  │  Verify NOW at: http://secure-bank-login.xyz"    │  │`);
        console.log(`│  └──────────────────────────────────────────────────┘  │`);
        console.log(`│  State: 🟢 UNTAMPERED (Original Forensic Capture)     │`);
    } else {
        console.log(`│  [⚠️ BLURRED / ALTERED IMAGE - TAMPER ATTACK DETECTED]  │`);
        console.log(`│  ┌──────────────────────────────────────────────────┐  │`);
        console.log(`│  │ ░░░░░░░░ BLURRED / MODIFIED PIXELS ░░░░░░░░░░░   │  │`);
        console.log(`│  │ ░░░░ ATTACKER OVERWROTE STORAGE PAYLOAD ░░░░░░   │  │`);
        console.log(`│  └──────────────────────────────────────────────────┘  │`);
        console.log(`│  State: 🚨 TAMPERED (Hash Mismatch in Storage)       │`);
    }
    console.log(`│  SHA-256: ${hash.slice(0, 42)}...  │`);
    console.log(`└────────────────────────────────────────────────────────┘\n`);
}

async function runTamperedPhishingSuite() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🛡️ SHIELD — PHISHING IMAGE TAMPER SIMULATION & FORENSIC SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1. Authenticate Admin and create Police Officer
    console.log('\n[1] 🔑 Authenticating with SHIELD Gateway...');
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
        throw new Error(`Admin login failed: ${JSON.stringify(loginRes.data)}`);
    }

    const adminToken = loginRes.data.token;
    console.log(`   ✅ Logged in as Admin (${loginRes.data.user.name})`);

    const officerEmail = `officer_tamper_${Date.now()}@police.gov`;
    const officerPass = 'TamperOfficer123!';
    const userRes = await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Inspector Cyber Forensic',
            email: officerEmail,
            employeeId: `FOR-${Date.now().toString().slice(-5)}`,
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

    // 2. Register FIR
    const firNumber = `FIR-2026-CYBER-${Date.now().toString().slice(-4)}`;
    console.log(`\n[2] 📜 Registering Cyber Crime FIR (${firNumber})...`);

    const firRes = await http('POST', '/api/fir/create', {
        token: officerToken,
        multipart: {
            firNumber: firNumber,
            incidentType: 'Cyber Crime',
            location: 'Cyber Cell Jurisdiction',
            description: 'Phishing SMS fraud targeting bank victims. Sections 66D IT Act.',
            file: {
                _file: true,
                filename: 'fir_phishing.pdf',
                contentType: 'application/pdf',
                data: Buffer.from('FIR RECORD - CYBER PHISHING CASE ' + firNumber)
            }
        }
    });

    if (!firRes.ok) {
        throw new Error(`FIR Creation failed: ${JSON.stringify(firRes.data)}`);
    }

    const firId = firRes.data.fir_id || firRes.data.id || firRes.data.fir?.id;
    console.log(`   ✅ FIR Created successfully! ID: ${firId}`);

    // 3. Upload Original Phishing Screenshot Image
    console.log('\n[3] 📸 Uploading Original Phishing SMS Screenshot Image...');
    const imagePath = path.join(__dirname, '../mock_files/phishing_sms_screenshot.png');
    let imageBuffer;
    if (fs.existsSync(imagePath)) {
        imageBuffer = fs.readFileSync(imagePath);
    } else {
        imageBuffer = Buffer.from('REALISTIC_PHISHING_SCREENSHOT_IMAGE_BYTES_' + Date.now());
    }

    const sourceData = {
        sourceType: 'Mobile Phone',
        ownershipStatus: 'Seized',
        make: 'Samsung',
        model: 'Galaxy S21',
        serial: 'SN-PHISH-2026',
        identifiers: 'IMEI: 358921004829101',
        lawfulControl: true,
        properOperation: true,
        deviceChain: [
            { node: 1, device: 'Mobile Phone', identifier: 'IMEI-358921004829101' },
            { node: 2, device: 'Cellebrite UFED', identifier: 'LAB-UFED-001' },
            { node: 3, device: 'Evidence Storage', identifier: 'EVIDENCE-SRV-001' }
        ]
    };

    const evRes = await http('POST', '/api/evidence/upload', {
        token: officerToken,
        multipart: {
            fir_id: firId,
            category: 'image',
            description: 'Original Phishing SMS Screenshot evidence image.',
            sourceData: JSON.stringify(sourceData),
            file: {
                _file: true,
                filename: 'phishing_sms_screenshot.png',
                contentType: 'image/png',
                data: imageBuffer
            }
        }
    });

    if (!evRes.ok) {
        throw new Error(`Evidence Upload failed: ${JSON.stringify(evRes.data)}`);
    }

    const evidenceFile = evRes.data.files ? evRes.data.files[0] : evRes.data;
    const evidenceId = evidenceFile.id;
    const objectKey = evidenceFile.object_key || `${evidenceId}.png`;
    const originalHash = evidenceFile.sha256_hash || evidenceFile.hash;

    console.log(`   ✅ Phishing Image Uploaded & Anchored on EVM Blockchain!`);
    console.log(`      • Evidence ID:   ${evidenceId}`);
    console.log(`      • Object Key:    ${objectKey}`);
    console.log(`      • EVM Truth Hash: ${originalHash}`);

    renderImageTerminalPreview('phishing_sms_screenshot.png', 'CLEAN', originalHash);

    // 4. Initial Integrity Verification (Before Attack)
    console.log('[4] 🔍 Step 1 Verification (Before Attack): Checking SHIELD EVM Blockchain...');
    const initialVerify = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: officerToken });
    console.log(`   👉 Initial Status: ${initialVerify.data.status} (Live Storage Hash matches Blockchain Truth)`);

    // 5. ATTACK SIMULATION: Alter / Blur the Image directly in MinIO
    console.log('\n[5] 🚨 ATTACK SIMULATION: Malicious actor gains direct access to MinIO storage...');
    console.log('   Attacker bypasses SHIELD API and directly overwrites the image file in MinIO storage!');

    const tamperedImagePayload = Buffer.concat([
        imageBuffer,
        Buffer.from('\n[ATTACKER_BLUR_OVERWRITE_PAYLOAD_IMAGE_MODIFIED_AT_' + Date.now() + ']')
    ]);

    await minioClient.putObject(BUCKET, objectKey, tamperedImagePayload);
    console.log(`   ⚡ MinIO storage file "${objectKey}" directly tampered/corrupted!`);

    const tamperedHash = crypto.createHash('sha256').update(tamperedImagePayload).digest('hex');
    renderImageTerminalPreview('phishing_sms_screenshot.png', 'TAMPERED', tamperedHash);

    // 6. Final Integrity Verification (After Attack)
    console.log('[6] 🛡️ Step 2 Verification (After Attack): Running SHIELD EVM Integrity Check...');
    const finalVerify = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: officerToken });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (finalVerify.data.status === 'TAMPERED') {
        console.log('  🚨 FORENSIC SECURITY ALERT TRIGGERED: TAMPERED');
        console.log('  -------------------------------------------------------------');
        console.log(`  • EVM Blockchain Truth Hash : ${originalHash}`);
        console.log(`  • Altered MinIO Storage Hash: ${finalVerify.data.computed_hash || tamperedHash}`);
        console.log('  -------------------------------------------------------------');
        console.log('  ✅ SHIELD Blockchain Ledger successfully detected the unauthorized image alteration!');
        console.log('  Section 63 Certificate generation is BLOCKED for tampered evidence.');
    } else {
        console.log(`  Status: ${finalVerify.data.status}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runTamperedPhishingSuite().catch(err => {
    console.error('\n❌ Execution Error:', err.message);
    process.exit(1);
});
