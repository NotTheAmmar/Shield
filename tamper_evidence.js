/**
 * SHIELD — Evidence Tampering Test
 */
const crypto = require('crypto');

async function http(method, path, { token, body } = {}) {
    const url = `http://localhost:3001${path}`;
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
    
    // 1. Login
    console.log('\n[1] Logging in as Admin...');
    const loginRes = await http('POST', '/api/auth/login', {
        body: { email: 'admin@police.gov', password: 'Sh13ld@Pr0duct10n2026!', role: 'Super Admin' }
    });
    const token = loginRes.data.token;
    if (!token) throw new Error('Could not get admin token');
    console.log('✅ Logged in successfully');

    // 2. Fetch Evidence
    console.log('\n[2] Fetching evidence list...');
    const listRes = await http('GET', '/api/evidence', { token });
    if (!listRes.data || !listRes.data.data.length) {
        throw new Error('No evidence found.');
    }
    const evidence = listRes.data.data[0];
    const evidenceId = evidence.id;
    const originalHash = evidence.hash;
    console.log(`✅ Selected Evidence ID: ${evidenceId}`);
    console.log(`   Original Hash: ${originalHash.substring(0, 16)}...`);

    // 3. Verify BEFORE tampering
    console.log('\n[3] Verifying integrity BEFORE tampering...');
    const verifyBefore = await http('GET', `/api/evidence/verify/${evidenceId}`, { token });
    console.log(`   Status: ${verifyBefore.data.status} ${verifyBefore.data.status === 'OK' ? '✅' : '❌'}`);

    // 4. Tamper
    console.log('\n[4] Tampering with the evidence file in MinIO...');
    const Minio = require('minio');
    const minioClient = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'shield',
        secretKey: 'hJ7mN3xP9wQ2rK5bT8cF1vL4yD6aG0eS'
    });
    
    const { Client } = require('pg');
    const pg = new Client('postgresql://shield:kX9mPvQ7rW2sT4bN8cF1jL6hY3dA5gE0@localhost:5432/shield');
    await pg.connect();
    const res = await pg.query('SELECT bucket_name, object_key FROM evidence WHERE id = $1', [evidenceId]);
    await pg.end();
    
    if (res.rows.length === 0) throw new Error('Evidence not found in Postgres');
    const { bucket_name, object_key } = res.rows[0];
    console.log(`   Target Object: bucket='${bucket_name}', key='${object_key}'`);
    
    // Overwrite the file exactly where it sits
    const tamperedData = Buffer.from(`COMPROMISED DATA PAYLOAD ${crypto.randomUUID()}`);
    await minioClient.putObject(bucket_name, object_key, tamperedData);
    console.log(`✅ Evidence file OVERWRITTEN with malicious payload!`);

    // 5. Verify AFTER tampering
    console.log('\n[5] Verifying integrity AFTER tampering...');
    const verifyAfter = await http('GET', `/api/evidence/verify/${evidenceId}`, { token });
    console.log(`   Status: ${verifyAfter.data.status} ${verifyAfter.data.status === 'TAMPERED' ? '🚨✅' : '❌'}`);
    
    if (verifyAfter.data.status === 'TAMPERED') {
        console.log('\n🎉 SUCCESS: The ImmuDB ledger successfully caught the mismatch!');
    } else {
        console.log('\n❌ FAILURE: The system did not detect the tampering.');
    }
}

main().catch(console.error);
