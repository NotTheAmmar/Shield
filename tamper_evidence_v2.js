/**
 * SHIELD — Evidence Tampering Test
 */
const path = require('path');

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
    
    console.log('\n[1] Logging in as Admin...');
    const loginRes = await http('POST', '/api/auth/login', {
        body: { email: 'admin@police.gov', password: 'Sh13ld@Pr0duct10n2026!', role: 'Super Admin' }
    });
    const token = loginRes.data.token;
    if (!token) throw new Error('Could not get admin token');
    console.log('✅ Logged in successfully');

    console.log('\n[2] Fetching evidence list...');
    const listRes = await http('GET', '/api/evidence', { token });
    if (!listRes.data || !listRes.data.data.length) {
        throw new Error('No evidence found. Please create one first.');
    }
    const evidence = listRes.data.data[0];
    const evidenceId = evidence.id;
    const originalHash = evidence.hash;
    const fileName = evidence.fileName; // Returned by the API
    console.log(`✅ Selected Evidence ID: ${evidenceId}`);
    console.log(`   Internal Filename: ${fileName}`);
    console.log(`   Original Hash: ${originalHash.substring(0, 16)}...`);

    console.log('\n[3] Verifying integrity BEFORE tampering (Should be OK)...');
    const verifyBefore = await http('GET', `/api/evidence/verify/${evidenceId}`, { token });
    console.log(`   Status: ${verifyBefore.data.status} ${verifyBefore.data.status === 'OK' ? '✅' : '❌'}`);

    console.log('\n[4] Tampering with the evidence file directly in MinIO...');
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
        accessKey: 'shield',
        secretKey: 'hJ7mN3xP9wQ2rK5bT8cF1vL4yD6aG0eS'
    });
    
    // Upload malicious data payload right over the immutable file
    const tamperedData = Buffer.from(`MALICIOUS HACKER PAYLOAD INJECTED AT ${Date.now()}`);
    await minioClient.putObject(bucketName, objectKey, tamperedData);
    console.log(`✅ Evidence file OVERWRITTEN with malicious payload directly in object storage!`);

    console.log('\n[5] Verifying integrity AFTER tampering (Should be TAMPERED)...');
    const verifyAfter = await http('GET', `/api/evidence/verify/${evidenceId}`, { token });
    console.log(`   Status: ${verifyAfter.data.status} ${verifyAfter.data.status === 'TAMPERED' ? '🚨✅' : '❌'}`);
    
    if (verifyAfter.data.status === 'TAMPERED') {
        console.log('\n🎉 SUCCESS: The ImmuDB ledger successfully caught the covert MinIO tampering!');
    } else {
        console.log('\n❌ FAILURE: The system did not detect the tampering.');
    }
}

main().catch(console.error);
