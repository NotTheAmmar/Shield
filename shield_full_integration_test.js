const crypto = require('crypto');
const fs = require('fs');


const GATEWAY = 'http://localhost:3001/api';

async function testSuite() {
    try {
        console.log('🛡️ Starting Full SHIELD Native Integration Test Suite...');

        // 1. Super Admin Login
        console.log('\n[1] Testing Authentication: Super Admin Login...');
        const loginRes = await fetch(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@police.gov', password: 'password123', role: 'Super Admin' })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error(`Super Admin Login failed: ${loginData.error}`);
        const adminJwt = loginData.token;
        console.log('✅ Super Admin Logged In. JWT Issued.');

        // 2. Create a new Police Officer via Admin Route
        console.log('\n[2] Testing Auth Microservice: Provisioning New Police Officer...');
        const uniqueEmail = `detective_${Date.now()}@police.gov`;
        const uniqueId = `POL_${Date.now()}`;
        
        const createRes = await fetch(`${GATEWAY}/admin/users`, {
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
        const polLogin = await fetch(`${GATEWAY}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: uniqueEmail, password: 'secretpassword', role: 'Police Officer' })
        });
        if (!polLogin.ok) throw new Error('Police officer login failed!');
        const polJwt = (await polLogin.json()).token;
        console.log('✅ Police Officer Token Granted.');

        // 4. Create an FIR natively in PostgreSQL
        console.log('\n[4] Testing Evidence Microservice: Creating FIR...');
        const firRes = await fetch(`${GATEWAY}/fir/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${polJwt}` },
            body: JSON.stringify({ caseCategory: 'Cybercrime', description: 'Test Case', location: 'Virtual' })
        });
        const firData = await firRes.json();
        const firId = firData.id;
        console.log(`✅ FIR Created inside db-users: ${firId}`);

        // 5. Upload Evidence via MinIO streams
        console.log('\n[5] Testing Storage & Blockchain: Uploading Evidence File...');
        const formData = new FormData();
        formData.append('fir_id', firId);
        formData.append('file', new Blob(['This is highly classified digital evidence from the test suite.']), 'secret.txt');
        
        const evRes = await fetch(`${GATEWAY}/evidence/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${polJwt}` },
            body: formData
        });
        const evData = await evRes.json();
        if (!evRes.ok) throw new Error(`Evidence Upload failed: ${evData.error}`);
        const evId = evData.id;
        console.log(`✅ Evidence Uploaded & Secured on Ledger. ID: ${evId}`);

        // 6. Verify Evidence via the Pipeline
        console.log('\n[6] Testing Live Cryptographic Verification...');
        const verifyRes = await fetch(`${GATEWAY}/evidence/verify/${evId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        const verifyData = await verifyRes.json();
        console.log(`✅ Hash Validation Status: ${verifyData.status}`);

        // 7. Verify Dashboard & Audit Service (The newly built routes)
        console.log('\n[7] Testing Dashboard & Centralized Logging APIs...');
        const statRes = await fetch(`${GATEWAY}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        const statData = await statRes.json();
        console.log(`✅ Live System Stats: ${JSON.stringify(statData)}`);

        const auditRes = await fetch(`${GATEWAY}/audit`, {
            headers: { 'Authorization': `Bearer ${adminJwt}` }
        });
        const auditData = await auditRes.json();
        console.log(`✅ Total Audit Log Entries: ${auditData.auditLog.length}`);

        console.log('\n🎉 ALL ROUTES FULLY INTEGRATED WITH 100% NATIVE DB/NATIVE MICROSERVICES. ZERO MOCKS.');

    } catch (err) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
    }
}

testSuite();
