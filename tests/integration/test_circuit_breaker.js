const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000/api';

class ApiClient {
    constructor() {
        this.cookie = '';
    }

    async request(endpoint, method, body, isFormData = false) {
        const headers = {
            'Cookie': this.cookie
        };
        if (!isFormData && body) {
            headers['Content-Type'] = 'application/json';
        }
        const options = {
            method,
            headers,
        };
        if (body) {
            options.body = isFormData ? body : JSON.stringify(body);
        }

        const res = await fetch(`${BASE_URL}${endpoint}`, options);
        
        for (const [key, val] of res.headers.entries()) {
            if (key.toLowerCase() === 'set-cookie') {
                const match = val.match(/shield_access_token=([^;]+)/);
                if (match) {
                    this.cookie = `shield_access_token=${match[1]}`;
                }
            }
        }
        
        if (res.headers.get('content-type') === 'application/pdf') {
            return { status: res.status, type: 'pdf', buffer: Buffer.from(await res.arrayBuffer()) };
        }

        if (res.redirected) {
             return { status: res.status, type: 'redirect', url: res.url };
        }

        const text = await res.text();
        try {
            return { status: res.status, data: JSON.parse(text) };
        } catch {
            return { status: res.status, text };
        }
    }
}

async function run() {
    console.log('--- STARTING CIRCUIT BREAKER E2E TEST ---');
    const client = new ApiClient();

    console.log('\n[1] Login as Police Officer');
    let res = await client.request('/auth/login', 'POST', {
        email: 'po@test.com', password: 'password123', role: 'Police Officer'
    });
    console.log('✔ Police Officer login success');

    console.log('\n[2] Create FIR');
    const firFd = new FormData();
    firFd.append('firNumber', 'FIR-TAMPER-' + Date.now());
    firFd.append('description', 'Test FIR for Circuit Breaker');
    firFd.append('file', new Blob(['dummy fir doc'], { type: 'text/plain' }), 'fir.txt');
    
    res = await client.request('/fir/create', 'POST', firFd, true);
    const firId = res.data.fir_id;
    console.log('✔ FIR Created: ' + firId);

    console.log('\n[3] Upload Evidence (Anchors to Blockchain)');
    const evFd = new FormData();
    evFd.append('fir_id', firId);
    evFd.append('sourceData', JSON.stringify({
        sourceType: 'Mobile Phone',
        make: 'Samsung',
        model: 'Galaxy S21',
        serial: 'CORRUPTED123',
        deviceChain: [],
        lawfulControl: true,
        properOperation: true
    }));
    evFd.append('file', new Blob(['genuine valid evidence data'], { type: 'image/jpeg' }), 'evidence.jpg');

    res = await client.request('/evidence/upload', 'POST', evFd, true);
    const sourceId = res.data.sourceId;
    console.log('✔ Evidence Uploaded. Source Batch ID: ' + sourceId);

    console.log('\n[4] 🚨 SIMULATING TAMPERING (Overwriting MinIO directly)...');
    try {
        const output = execSync('sudo docker exec shield-evidence node tamper.js').toString();
        console.log(output.trim());
    } catch (err) {
        console.error('Tamper execution failed:', err);
        return;
    }

    client.cookie = ''; // clear session

    console.log('\n[5] Login as Forensic Expert');
    res = await client.request('/auth/login', 'POST', {
        email: 'fe@test.com', password: 'password123', role: 'Forensic Expert'
    });

    console.log('\n[6] 🚨 Forensic Expert triggers Verify Integrity');
    // We need to fetch the evidence ID associated with this source
    const dashRes = await client.request('/dashboard/stats', 'GET');
    // we don't have a direct route to get evidence ID from source ID easily in tests without querying DB, 
    // but we can query the internal list or just query the DB using execSync
    const evidenceIdOutput = execSync(`sudo docker exec db-users psql -U postgres -d shield -t -c "SELECT id FROM evidence WHERE source_id = '${sourceId}' LIMIT 1;"`).toString().trim();
    
    res = await client.request(`/evidence/verify/${evidenceIdOutput}`, 'GET');
    console.log('✔ Verify Result:', res.data.status);
    if (res.data.status !== 'TAMPERED') {
        console.error('❌ Verification did not return TAMPERED!');
        return;
    }

    console.log('\n[7] 🚨 Attempt to Upload Part B Signature (Testing Circuit Breaker Gatekeeper)');
    const certBFd = new FormData();
    certBFd.append('file', new Blob(['expert trying to bypass'], { type: 'application/pdf' }), 'signed_B.pdf');
    res = await client.request(`/evidence-source/${sourceId}/upload-signed-certificate`, 'POST', certBFd, true);
    
    console.log(`Gatekeeper Response: ${res.status}`);
    console.log(`Gatekeeper Data:`, res.data);

    if (res.status === 403 && res.data.error.includes('compromised')) {
        console.log('\n✅ CIRCUIT BREAKER ENGAGED SUCCESSFULLY! TERMINAL LOCKDOWN ENFORCED!');
    } else {
        console.error('\n❌ CIRCUIT BREAKER FAILED! Certificate accepted compromised evidence!');
    }
}

run().catch(console.error);
