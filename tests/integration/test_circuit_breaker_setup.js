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
    console.log('--- STARTING CIRCUIT BREAKER E2E TEST (PART 1) ---');
    const client = new ApiClient();
    await client.request('/auth/login', 'POST', { email: 'po@test.com', password: 'password123', role: 'Police Officer' });
    console.log('✔ Police Officer login success');

    const firFd = new FormData();
    firFd.append('firNumber', 'FIR-TAMPER-' + Date.now());
    firFd.append('description', 'Test FIR for Circuit Breaker');
    firFd.append('file', new Blob(['dummy fir doc'], { type: 'text/plain' }), 'fir.txt');
    const firRes = await client.request('/fir/create', 'POST', firFd, true);
    console.log('✔ FIR Created: ' + firRes.data.fir_id);

    const evFd = new FormData();
    evFd.append('fir_id', firRes.data.fir_id);
    evFd.append('sourceData', JSON.stringify({
        sourceType: 'Mobile Phone', make: 'Samsung', model: 'Galaxy S21', serial: 'CORRUPTED123',
        deviceChain: [], lawfulControl: true, properOperation: true
    }));
    evFd.append('file', new Blob(['genuine valid evidence data'], { type: 'image/jpeg' }), 'evidence.jpg');
    const evRes = await client.request('/evidence/upload', 'POST', evFd, true);
    console.log('✔ Evidence Uploaded. Source Batch ID: ' + evRes.data.sourceId);
    
    require('fs').writeFileSync('.tamper_source_id', evRes.data.sourceId);
    console.log('\n✅ Setup complete. Now run the tamper command to corrupt this evidence!');
}
run().catch(console.error);
