/**
 * SHIELD — Evidence Tampering Test
 */
const path = require('path');
const fs = require('fs');

// Load environment variables from .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            }
            process.env[key] = value;
        }
    });
}

async function http(method, p, { token, body } = {}) {
    const url = `http://localhost:3001${p}`;
    const opts = { method, headers: {} };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    return { status: res.status, data: await res.json() };
}

async function main() {
    console.log('--- 🛡️ SHIELD TAMPERING SIMULATION ---');
    
    // 1. Login as Admin
    console.log('\n[1] Logging in as Admin...');
    const loginRes = await http('POST', '/api/auth/login', {
        body: { email: 'admin@police.gov', password: 'Sh13ld@Pr0duct10n2026!', role: 'Admin' }
    });
    const adminToken = loginRes.data.token;
    if (!adminToken) throw new Error('Could not get admin token');
    console.log('✅ Logged in successfully as Admin');

    // 2. Create a test police officer to fetch evidence
    console.log('\n[2] Provisioning temp Police Officer for zero-trust evidence access...');
    const uniqueEmail = `officer_${Date.now()}@police.gov`;
    const createRes = await http('POST', '/api/admin/users', {
        token: adminToken,
        body: { name: 'Tamper Tester', email: uniqueEmail, employeeId: `POL_${Date.now()}`, role: 'Police Officer', plainPassword: 'secretpassword' }
    });

    const polLogin = await http('POST', '/api/auth/login', {
        body: { email: uniqueEmail, password: 'secretpassword', role: 'Police Officer' }
    });
    const token = polLogin.data.token;
    if (!token) throw new Error('Could not get police token');

    console.log('\n[3] Fetching evidence list...');
    const listRes = await http('GET', '/api/evidence', { token });
    if (!listRes.data || !listRes.data.data.length) {
        throw new Error('No evidence found. Please run integration tests to seed real evidence first.');
    }
    const evidence = listRes.data.data[0];
    const evidenceId = evidence.id;
    const originalHash = evidence.hash;
    const fileName = evidence.fileName; // Returned by the API
    console.log(`✅ Selected Evidence ID: ${evidenceId}`);
    console.log(`   Internal Filename: ${fileName}`);
    console.log(`   Original Hash: ${originalHash.substring(0, 16)}...`);

    console.log('\n[4] Verifying integrity BEFORE tampering (Should be OK)...');
    const verifyBefore = await http('GET', `/api/evidence/verify/${evidenceId}`, { token });
    console.log(`   Status: ${verifyBefore.data.status} ${verifyBefore.data.status === 'OK' ? '✅' : '❌'}`);

    console.log('\n[5] Tampering with the evidence file directly in MinIO...');
    // We can deduce the object key without Postgres! (It is evidenceId + original extension)
    const ext = path.extname(fileName) || '';
    const objectKey = `${evidenceId}${ext}`;
    const bucketName = 'evidence';
    
    console.log(`   Derived Target Object: bucket='${bucketName}', key='${objectKey}'`);
    
    // Connect to MinIO API directly using the host-mapped port 9000
    const Minio = require('minio');
    const minioClient = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: process.env.MINIO_ROOT_USER || 'your_minio_admin_user',
        secretKey: process.env.MINIO_ROOT_PASSWORD || 'your_secure_minio_password'
    });
    
    // Upload malicious data payload right over the immutable file
    const tamperedData = Buffer.from(`MALICIOUS HACKER PAYLOAD INJECTED AT ${Date.now()}`);
    await minioClient.putObject(bucketName, objectKey, tamperedData);
    console.log(`✅ Evidence file OVERWRITTEN with malicious payload directly in object storage!`);

    console.log('\n[6] Verifying integrity AFTER tampering (Should be TAMPERED)...');
    const verifyAfter = await http('GET', `/api/evidence/verify/${evidenceId}`, { token });
    console.log(`   Status: ${verifyAfter.data.status} ${verifyAfter.data.status === 'TAMPERED' ? '🚨✅' : '❌'}`);
    
    if (verifyAfter.data.status === 'TAMPERED') {
        console.log('\n🎉 SUCCESS: The ImmuDB ledger successfully caught the covert MinIO tampering!');
    } else {
        console.log('\n❌ FAILURE: The system did not detect the tampering.');
    }
}

main().catch(console.error);
