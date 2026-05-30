/**
 * SHIELD — Evidence Tampering Simulation (Realistic Hacker Scenario)
 *
 * This script simulates a REAL attack where a malicious actor has gained
 * direct access to the MinIO object storage (e.g., stolen credentials,
 * compromised server, insider threat) and tampers with evidence files
 * WITHOUT ever touching the SHIELD API.
 *
 * The script then demonstrates that SHIELD's ImmuDB-backed integrity
 * verification catches the tampering despite the API being bypassed entirely.
 *
 * Usage:
 *   node tamper_evidence_v2.js                  # Tampers a random evidence file
 *   node tamper_evidence_v2.js <object-key>     # Tampers a specific file by key
 */
const Minio = require('minio');
const path = require('path');

// ── MinIO connection (simulating stolen/leaked credentials) ──
const minioClient = new Minio.Client({
    endPoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'shield',       // Attacker obtained these credentials
    secretKey: 'key_pass'
});

const BUCKET = 'evidence';

// ── Helper: list all objects in the evidence bucket ──────────
function listAllObjects(bucket) {
    return new Promise((resolve, reject) => {
        const objects = [];
        const stream = minioClient.listObjectsV2(bucket, '', true);
        stream.on('data', obj => objects.push(obj));
        stream.on('end', () => resolve(objects));
        stream.on('error', reject);
    });
}

// ── Helper: SHIELD API call (only used for detection phase) ──
async function http(method, p, { cookies, body } = {}) {
    const url = `http://localhost:3001${p}`;
    const opts = { method, headers: {}, redirect: 'manual' };
    if (cookies) opts.headers['Cookie'] = cookies;
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    let data;
    try { data = await res.json(); } catch { data = {}; }
    return { status: res.status, data, setCookies };
}

function extractCookies(headers) {
    return headers.map(c => c.split(';')[0]).join('; ');
}

async function main() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🛡️  SHIELD — REALISTIC EVIDENCE TAMPERING SIMULATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ═══════════════════════════════════════════════════════════
    //  PHASE 1: THE ATTACK (Direct MinIO — no SHIELD API used)
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  PHASE 1: THE ATTACK                        ║');
    console.log('║  (Direct MinIO access — SHIELD API bypassed) ║');
    console.log('╚══════════════════════════════════════════════╝');

    console.log('\n[1] Connecting to MinIO with stolen credentials...');
    // Verify connection by checking if bucket exists
    const bucketExists = await minioClient.bucketExists(BUCKET);
    if (!bucketExists) {
        throw new Error(`Bucket "${BUCKET}" not found. Is the system running?`);
    }
    console.log(`   ✅ Connected! Bucket "${BUCKET}" is accessible.`);

    console.log('\n[2] Scanning evidence storage for files...');
    const objects = await listAllObjects(BUCKET);
    if (objects.length === 0) {
        throw new Error('No evidence files found in MinIO. Upload evidence via the UI first.');
    }

    // Let user target a specific file via CLI arg, or pick the first untampered one
    const targetKey = process.argv[2];
    let target;

    if (targetKey) {
        target = objects.find(o => o.name === targetKey);
        if (!target) throw new Error(`Object "${targetKey}" not found in bucket.`);
    } else {
        // Sort by lastModified descending → newest file first
        objects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        target = objects[0]; // Pick the newest file
    }

    console.log(`   📂 Found ${objects.length} evidence file(s) in storage:`);
    objects.forEach((obj, i) => {
        const marker = obj.name === target.name ? ' ◄── TARGET' : '';
        const size = (obj.size / 1024).toFixed(1) + ' KB';
        console.log(`      ${i + 1}. ${obj.name} (${size})${marker}`);
    });

    console.log('\n[3] Reading original file before tampering...');
    const originalData = await new Promise((resolve, reject) => {
        const chunks = [];
        minioClient.getObject(BUCKET, target.name, (err, stream) => {
            if (err) return reject(err);
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    });
    console.log(`   Original file size: ${originalData.length} bytes`);

    console.log('\n[4] 🔓 OVERWRITING evidence file with malicious payload...');
    const tamperedPayload = Buffer.from(
        `!!! EVIDENCE FILE TAMPERED !!!\n` +
        `Attack Timestamp: ${new Date().toISOString()}\n` +
        `Original Size: ${originalData.length} bytes\n` +
        `Attacker: Direct MinIO access (SHIELD API completely bypassed)\n` +
        `\n` +
        `This file has been replaced by an attacker who gained direct\n` +
        `access to the object storage layer, circumventing all API\n` +
        `security controls, authentication, and audit logging.\n`
    );
    await minioClient.putObject(BUCKET, target.name, tamperedPayload);
    console.log(`   ✅ File "${target.name}" has been OVERWRITTEN!`);
    console.log(`   Original size: ${originalData.length} bytes → Tampered size: ${tamperedPayload.length} bytes`);

    console.log('\n   ⚠️  The attack left NO trace in SHIELD\'s audit log.');
    console.log('   ⚠️  The API was never called. No authentication occurred.');
    console.log('   ⚠️  From SHIELD\'s API perspective, nothing happened.');

    // ═══════════════════════════════════════════════════════════
    //  PHASE 2: THE DETECTION (Using SHIELD API to verify)
    // ═══════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  PHASE 2: THE DETECTION                     ║');
    console.log('║  (SHIELD verification via ImmuDB ledger)     ║');
    console.log('╚══════════════════════════════════════════════╝');

    // Extract the evidence UUID from the object key (strip extension)
    const evidenceId = target.name.replace(/\.[^/.]+$/, '');

    console.log('\n[5] Logging into SHIELD to run integrity verification...');
    // Try both credential sets
    let cookies;
    const login1 = await http('POST', '/api/auth/login', {
        body: { email: 'admin@police.gov', password: 'Sh13ld@Pr0duct10n2026!', role: 'Admin' }
    });
    if (login1.data?.user) {
        cookies = extractCookies(login1.setCookies);
    } else {
        const login2 = await http('POST', '/api/auth/login', {
            body: { email: 'admin@shield.gov.in', password: 'admin@123', role: 'Admin' }
        });
        if (!login2.data?.user) throw new Error('Cannot login to verify. Try manually in the UI.');
        cookies = extractCookies(login2.setCookies);
    }
    console.log('   ✅ Logged in for verification');

    console.log(`\n[6] Verifying evidence ${evidenceId.substring(0, 8)}... against ImmuDB ledger...`);
    const verifyRes = await http('GET', `/api/evidence/verify/${evidenceId}`, { cookies });

    if (verifyRes.status === 404) {
        console.log('   ⚠️  Evidence ID not found in SHIELD database.');
        console.log('   This object may not be tracked evidence. Try another file.');
        return;
    }

    const status = verifyRes.data.status;

    // ═══════════════════════════════════════════════════════════
    //  VERDICT
    // ═══════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (status === 'TAMPERED') {
        console.log('  🚨 RESULT: TAMPERED');
        console.log('');
        console.log('  The ImmuDB immutable ledger stored the original SHA-256');
        console.log('  hash at the time of upload. When verification ran, it');
        console.log('  recomputed the hash from the current MinIO file and found');
        console.log('  a MISMATCH — proving the file was altered after upload.');
        console.log('');
        console.log('  ✅ SHIELD successfully detected the covert storage-level attack!');
    } else if (status === 'OK') {
        console.log('  ❌ RESULT: OK (tampering NOT detected)');
        console.log('  Something went wrong — the system should have caught this.');
    } else {
        console.log(`  ⚠️  RESULT: ${status}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
