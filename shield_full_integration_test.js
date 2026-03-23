const crypto = require('crypto');
const fs = require('fs');


const GATEWAY = 'http://localhost:3001/api';

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
        console.log('🛡️ Starting Full SHIELD Native Integration Test Suite...');

        // 1. Super Admin Login
        console.log('\n[1] Testing Authentication: Super Admin Login...');
        const loginRes = await fetchWithTimeout(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@police.gov', password: 'Sh13ld@Pr0duct10n2026!', role: 'Super Admin' })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error(`Super Admin Login failed: ${loginData.error}`);
        const adminJwt = loginData.token;
        console.log('✅ Super Admin Logged In. JWT Issued.');

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

        // 3. Login as the newly created Police Officer
        console.log('\n[3] Testing Police Officer Login...');
        const polLogin = await fetchWithTimeout(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: uniqueEmail, password: 'secretpassword', role: 'Police Officer' })
        });
        if (!polLogin.ok) throw new Error('Police officer login failed!');
        const polJwt = (await polLogin.json()).token;
        console.log('✅ Police Officer Token Granted.');

        // 4. Create an FIR natively in PostgreSQL (must use multipart/form-data for busboy)
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
        let firData;
        try { firData = JSON.parse(firText); } catch { throw new Error(`FIR response not JSON: ${firText.substring(0, 200)}`); }
        if (!firRes.ok) throw new Error(`FIR Create failed: ${firData.error}`);
        const firId = firData.fir_id;
        console.log(`✅ FIR Created in PostgreSQL: ${firId}`);

        // 5. Upload Evidence via MinIO streams
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
        let evData;
        try { evData = JSON.parse(evText); } catch { throw new Error(`Evidence response not JSON: ${evText.substring(0, 200)}`); }
        if (!evRes.ok) throw new Error(`Evidence Upload failed: ${evData.error}`);
        const evId = evData.id;
        console.log(`✅ Evidence Uploaded & Secured on Ledger. ID: ${evId}`);

        // 6. Verify Evidence via the Pipeline
        console.log('\n[6] Testing Live Cryptographic Verification...');
        const verifyRes = await fetchWithTimeout(`${GATEWAY}/evidence/verify/${evId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        }, 8000);
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(`Verification failed: ${JSON.stringify(verifyData)}`);
        console.log(`✅ Hash Validation Status: ${verifyData.status}`);

        // 7. Verify Dashboard & Audit Service
        console.log('\n[7] Testing Dashboard & Centralized Logging APIs...');
        const statRes = await fetchWithTimeout(`${GATEWAY}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        const statData = await statRes.json();
        if (!statRes.ok) throw new Error(`Dashboard failed: ${JSON.stringify(statData)}`);
        console.log(`✅ Live System Stats: ${JSON.stringify(statData)}`);

        const auditRes = await fetchWithTimeout(`${GATEWAY}/audit`, {
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        const auditData = await auditRes.json();
        if (!auditRes.ok) throw new Error(`Audit failed: ${JSON.stringify(auditData)}`);
        console.log(`✅ Total Audit Log Entries: ${auditData.auditLog.length}`);

        console.log('\n🎉 ALL 7 STEPS PASSED — 100% NATIVE MICROSERVICE INTEGRATION VERIFIED. ZERO MOCKS.');

    } catch (err) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
    }
}

testSuite();
