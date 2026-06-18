const fs = require('fs');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000/api';

class ApiClient {
    constructor() { this.cookie = ''; }
    async request(endpoint, method, body, isFormData = false) {
        const headers = { 'Cookie': this.cookie };
        if (!isFormData && body) headers['Content-Type'] = 'application/json';
        const res = await fetch(`${BASE_URL}${endpoint}`, { method, headers, body: isFormData ? body : (body ? JSON.stringify(body) : undefined) });
        for (const [key, val] of res.headers.entries()) {
            if (key.toLowerCase() === 'set-cookie') {
                const match = val.match(/shield_access_token=([^;]+)/);
                if (match) this.cookie = `shield_access_token=${match[1]}`;
            }
        }
        const text = await res.text();
        try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, text }; }
    }
}

async function run() {
    console.log('--- STARTING CIRCUIT BREAKER E2E TEST (PART 2) ---');
    if (!fs.existsSync('.tamper_source_id')) {
        console.error('Run part 1 first!'); return;
    }
    const sourceId = fs.readFileSync('.tamper_source_id', 'utf8').trim();

    const client = new ApiClient();
    await client.request('/auth/login', 'POST', { email: 'fe@test.com', password: 'password123', role: 'Forensic Expert' });
    console.log('✔ Forensic Expert login success');

    console.log('\n[6] 🚨 Forensic Expert triggers Verify Integrity');
    // For testing, we get the evidence ID manually directly from Postgres container.
    // Assuming the user runs this with privileges or we just query the DB using pg library if we wanted to.
    let pgOutput;
    try {
        require('./shield-evidence/node_modules/dotenv').config({ path: './.env' });
        const { Client } = require('./shield-evidence/node_modules/pg');
        const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
        const dbClient = new Client({ connectionString: `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}` });
        await dbClient.connect();
        const resDb = await dbClient.query(`SELECT id FROM evidence WHERE source_id = $1 LIMIT 1`, [sourceId]);
        pgOutput = resDb.rows[0].id;
        await dbClient.end();
    } catch (e) {
        console.error('Database connection failed', e.message);
        return;
    }

    const resVerify = await client.request(`/evidence/verify/${pgOutput}`, 'GET');
    console.log('✔ Verify Result:', resVerify.data.status);
    if (resVerify.data.status !== 'TAMPERED') {
        console.error('❌ Verification did not return TAMPERED! Tampering script failed?');
        return;
    }

    console.log('\n[7] 🚨 Attempt to Upload Part B Signature (Testing Circuit Breaker Gatekeeper)');
    const certBFd = new FormData();
    certBFd.append('file', new Blob(['expert trying to bypass'], { type: 'application/pdf' }), 'signed_B.pdf');
    const resUpload = await client.request(`/evidence-source/${sourceId}/upload-signed-certificate`, 'POST', certBFd, true);
    
    console.log(`Gatekeeper Response: ${resUpload.status}`);
    console.log(`Gatekeeper Data:`, resUpload.data);

    if (resUpload.status === 403 && resUpload.data.error.includes('compromised')) {
        console.log('\n✅ CIRCUIT BREAKER ENGAGED SUCCESSFULLY! TERMINAL LOCKDOWN ENFORCED!');
    } else {
        console.error('\n❌ CIRCUIT BREAKER FAILED! Certificate accepted compromised evidence!');
    }
}
run().catch(console.error);
