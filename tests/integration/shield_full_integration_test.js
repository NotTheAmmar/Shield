const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const GATEWAY = 'http://localhost:3001/api';
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@shield.gov.in';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'admin@123';

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const id = setTimeout(() => {
            console.log(`[TEST DEBUG] Timeout reached for ${url}!`);
            controller.abort();
            reject(new Error('Request Timeout'));
        }, timeoutMs);

        fetch(url, { ...options, signal: controller.signal })
            .then(res => { clearTimeout(id); resolve(res); })
            .catch(err => { clearTimeout(id); reject(err); });
    });
}

async function testSuite() {
    try {
        console.log('🛡️ Starting Full SHIELD Native Integration Test Suite (Zero-Trust)...');

        // 1. Admin Login
        console.log('\n[1] Testing Authentication: Admin Login...');
        const loginRes = await fetchWithTimeout(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'Admin' })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error(`Admin Login failed: ${loginData.error}`);
        const adminJwt = loginData.token;
        console.log('✅ Admin Logged In. JWT Issued.');

        // 2. Create a new Police Officer via Admin Route
        console.log('\n[2] Testing Auth Microservice: Provisioning New Police Officer...');
        const uniqueEmail = `detective_${Date.now()}@police.gov`;
        const uniqueId = `POL_${Date.now()}`;
        
        const createRes = await fetchWithTimeout(`${GATEWAY}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
            body: JSON.stringify({
                name: 'Detective Test', email: uniqueEmail, employeeId: uniqueId, 
                role: 'Police Officer', plainPassword: 'secretpassword'
            })
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(`Create User failed: ${createData.error}`);
        console.log(`✅ Created Police Officer via Admin Route: ${uniqueEmail}`);

        // 2b. Create a new Judicial Authority via Admin Route
        console.log('\n[2b] Testing Auth Microservice: Provisioning New Judicial Authority...');
        const judgeEmail = `judge_${Date.now()}@court.gov.in`;
        const judgeId = `JUD_${Date.now()}`;
        
        const createJudgeRes = await fetchWithTimeout(`${GATEWAY}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminJwt}` },
            body: JSON.stringify({
                name: 'Judge Test', email: judgeEmail, employeeId: judgeId, 
                role: 'Judicial Authority', plainPassword: 'secretpassword'
            })
        });
        if (!createJudgeRes.ok) throw new Error(`Create Judge failed`);
        console.log(`✅ Created Judicial Authority via Admin Route: ${judgeEmail}`);

        // 3. Login as the newly created Police Officer & Judge
        console.log('\n[3] Testing Police & Judge Login...');
        const polLogin = await fetchWithTimeout(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: uniqueEmail, password: 'secretpassword', role: 'Police Officer' })
        });
        if (!polLogin.ok) throw new Error('Police officer login failed!');
        const polJwt = (await polLogin.json()).token;
        console.log('✅ Police Officer Token Granted.');

        const judgeLogin = await fetchWithTimeout(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: judgeEmail, password: 'secretpassword', role: 'Judicial Authority' })
        });
        if (!judgeLogin.ok) throw new Error('Judge login failed!');
        const judgeJwt = (await judgeLogin.json()).token;
        console.log('✅ Judicial Authority Token Granted.');

        // 4. Create an FIR natively (Police Only)
        console.log('\n[4] Testing Evidence Microservice: Creating FIR...');
        const firForm = new FormData();
        firForm.append('firNumber', `TEST/AUTO/${Date.now()}`);
        firForm.append('incidentType', 'Cybercrime');
        firForm.append('description', 'Automated Integration Test Case');
        firForm.append('location', 'Virtual Lab');
        
        const firRes = await fetchWithTimeout(`${GATEWAY}/fir/create`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${polJwt}` },
            body: firForm
        }, 8000);
        const firText = await firRes.text();
        let firData = JSON.parse(firText);
        if (!firRes.ok) throw new Error(`FIR Create failed: ${firData.error}`);
        const firId = firData.fir_id;
        console.log(`✅ FIR Created natively: ${firId}`);

        // 5. Upload Evidence via MinIO streams (Police/Judge Only)
        console.log('\n[5] Testing Storage & Blockchain: Uploading Evidence File...');
        const evForm = new FormData();
        evForm.append('fir_id', firId);
        evForm.append('file', new Blob(['This is highly classified digital evidence from the test suite.']), 'secret.txt');
        
        const evRes = await fetchWithTimeout(`${GATEWAY}/evidence/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${polJwt}` },
            body: evForm
        }, 10000);
        const evText = await evRes.text();
        let evData = JSON.parse(evText);
        if (!evRes.ok) throw new Error(`Evidence Upload failed: ${evData.error}`);
        const evId = evData.id;
        console.log(`✅ Evidence Uploaded & Secured on Ledger. ID: ${evId}`);

        // 6. Verify Evidence via the Pipeline (Police/Judge Only)
        console.log('\n[6] Testing Live Cryptographic Verification...');
        const verifyRes = await fetchWithTimeout(`${GATEWAY}/evidence/verify/${evId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${polJwt}` }
        }, 8000);
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(`Verification failed: ${JSON.stringify(verifyData)}`);
        console.log(`✅ Hash Validation Status: ${verifyData.status}`);

        // 7. Verify Dashboard & Audit Service with Strict RBAC limits
        console.log('\n[7] Testing Zero-Trust Dashboard & Audit APIs...');
        
        // Admin SHOULD NOT be able to view evidence dashboard stats
        const adminStatRes = await fetchWithTimeout(`${GATEWAY}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        if (adminStatRes.status !== 403) throw new Error(`Zero-Trust FAILED: Admin accessed evidence dashboard (Got ${adminStatRes.status})`);
        
        const statRes = await fetchWithTimeout(`${GATEWAY}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${polJwt}` }
        });
        const statData = await statRes.json();
        if (!statRes.ok) throw new Error(`Dashboard failed: ${JSON.stringify(statData)}`);
        console.log(`✅ Live System Stats (Police Officer allowed): ${JSON.stringify(statData)}`);

        // Audit Log only accessible by Judicial Authority
        const auditAdminRes = await fetchWithTimeout(`${GATEWAY}/audit`, {
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        if (auditAdminRes.status !== 403) throw new Error(`Zero-Trust FAILED: Admin accessed audit log (Got ${auditAdminRes.status})`);

        const auditPolRes = await fetchWithTimeout(`${GATEWAY}/audit`, {
            headers: { 'Authorization': `Bearer ${polJwt}` }
        });
        if (auditPolRes.status !== 403) throw new Error(`Zero-Trust FAILED: Police accessed audit log (Got ${auditPolRes.status})`);

        const auditRes = await fetchWithTimeout(`${GATEWAY}/audit`, {
            headers: { 'Authorization': `Bearer ${judgeJwt}` }
        });
        const auditData = await auditRes.json();
        if (!auditRes.ok) throw new Error(`Audit failed: ${JSON.stringify(auditData)}`);
        console.log(`✅ Total Audit Log Entries (Judicial Authority allowed): ${auditData.auditLog.length}`);

        console.log('\n🎉 ALL STEPS PASSED — 100% NATIVE ZERO-TRUST MICROSERVICE VERIFIED.');

    } catch (err) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
    }
}

testSuite();
