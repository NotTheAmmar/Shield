const fs = require('fs');

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
        
        // Parse cookies properly (fetch returns multiple set-cookie headers joined by comma, but it's tricky)
        // We can iterate over Headers
        for (const [key, val] of res.headers.entries()) {
            if (key.toLowerCase() === 'set-cookie') {
                // simple extraction
                const match = val.match(/shield_access_token=([^;]+)/);
                if (match) {
                    this.cookie = `shield_access_token=${match[1]}`;
                }
            }
        }
        
        if (res.headers.get('content-type') === 'application/pdf') {
            return { status: res.status, type: 'pdf', buffer: Buffer.from(await res.arrayBuffer()) };
        }

        // if redirect
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
    console.log('--- STARTING SECTION 63 / 65B E2E API TEST ---');
    const client = new ApiClient();

    console.log('\n[1] Login as Admin');
    let res = await client.request('/auth/login', 'POST', {
        email: 'admin@police.gov',
        password: 'Sh13ld@Pr0duct10n2026!',
        role: 'Admin'
    });
    if (res.status !== 200) {
        console.error('Admin login failed:', res.data);
        return;
    }
    console.log('✔ Admin login success');

    console.log('\n[2] Ensure Test Users Exist');
    const usersToCreate = [
        { email: 'po@test.com', name: 'Test PO', employeeId: 'PO-001', role: 'Police Officer', plainPassword: 'password123' },
        { email: 'fe@test.com', name: 'Test FE', employeeId: 'FE-001', role: 'Forensic Expert', plainPassword: 'password123' }
    ];
    for (const u of usersToCreate) {
        let cres = await client.request('/admin/users', 'POST', u);
        if (cres.status === 201) {
            console.log(`✔ Created ${u.role}`);
        } else if (cres.status === 409) {
            console.log(`- ${u.role} already exists`);
            // Reset password to be sure
            const listRes = await client.request('/admin/users', 'GET');
            const existing = listRes.data.users.find(x => x.email === u.email);
            if (existing) {
                await client.request(`/admin/users/${existing.id}/reset-password`, 'POST', { plainPassword: 'password123' });
            }
        } else {
            console.error(`Failed to create ${u.role}:`, cres.data);
            return;
        }
    }

    client.cookie = ''; // clear session
    
    console.log('\n[3] Login as Police Officer');
    res = await client.request('/auth/login', 'POST', {
        email: 'po@test.com', password: 'password123', role: 'Police Officer'
    });
    if (res.status !== 200) {
        console.error('PO login failed:', res.data);
        return;
    }
    console.log('✔ Police Officer login success');

    console.log('\n[4] Create FIR');
    const firFd = new FormData();
    firFd.append('firNumber', 'FIR-TEST-' + Date.now());
    firFd.append('description', 'Test FIR for API E2E');
    firFd.append('file', new Blob(['dummy fir doc'], { type: 'text/plain' }), 'fir.txt');
    
    res = await client.request('/fir/create', 'POST', firFd, true);
    if (res.status !== 201) {
        console.error('FIR creation failed:', res.data);
        return;
    }
    const firId = res.data.fir_id;
    console.log('✔ FIR Created: ' + firId);

    console.log('\n[5] Upload Evidence with Section 63 Source Data');
    const evFd = new FormData();
    evFd.append('fir_id', firId);
    evFd.append('sourceData', JSON.stringify({
        sourceType: 'Mobile Phone',
        make: 'Apple',
        model: 'iPhone 13',
        serial: 'ABC123XYZ',
        deviceChain: [{ handler: 'PO-001', date: new Date().toISOString() }],
        lawfulControl: true,
        properOperation: true
    }));
    evFd.append('file', new Blob(['fake image data'], { type: 'image/jpeg' }), 'evidence.jpg');

    res = await client.request('/evidence/upload', 'POST', evFd, true);
    if (res.status !== 201) {
        console.error('Evidence upload failed:', res.data);
        return;
    }
    const sourceId = res.data.sourceId;
    console.log('✔ Evidence Uploaded. Source Batch ID: ' + sourceId);

    console.log('\n[6] Download Unsigned Certificate (Part A)');
    res = await client.request(`/evidence-source/${sourceId}/certificate`, 'GET');
    if (res.status !== 200 || res.type !== 'pdf') {
        console.error('Failed to download Part A certificate:', res.status);
        return;
    }
    console.log(`✔ Unsigned Certificate downloaded (${res.buffer.length} bytes)`);

    console.log('\n[7] Upload Signed Certificate (Part A)');
    const certFd = new FormData();
    certFd.append('file', new Blob([res.buffer], { type: 'application/pdf' }), 'signed_A.pdf');
    res = await client.request(`/evidence-source/${sourceId}/upload-signed-certificate`, 'POST', certFd, true);
    if (res.status !== 200 || res.data.status !== 'PENDING_PART_B') {
        console.error('Failed to upload Part A:', res.data);
        return;
    }
    console.log('✔ Part A Signed Certificate Uploaded. Status -> ' + res.data.status);

    client.cookie = ''; // logout PO

    console.log('\n[8] Login as Forensic Expert');
    res = await client.request('/auth/login', 'POST', {
        email: 'fe@test.com', password: 'password123', role: 'Forensic Expert'
    });
    if (res.status !== 200) {
        console.error('FE login failed:', res.data);
        return;
    }
    console.log('✔ Forensic Expert login success');

    console.log('\n[9] Verify Forensic Expert Dashboard Access');
    res = await client.request('/dashboard/stats', 'GET');
    if (res.status !== 200) {
        console.error('FE Dashboard failed:', res.data);
        return;
    }
    console.log('✔ Dashboard Stats fetched successfully');

    console.log('\n[10] Download Certificate Template (Part B)');
    res = await client.request(`/evidence-source/${sourceId}/certificate`, 'GET');
    if (res.status !== 200 || res.type !== 'pdf') {
        console.error('Failed to download Part B certificate:', res.status);
        return;
    }
    console.log(`✔ Part B Template downloaded (${res.buffer.length} bytes)`);

    console.log('\n[11] Upload Signed Certificate (Part B)');
    const certBFd = new FormData();
    certBFd.append('file', new Blob(['fake signed pdf part B completely done'], { type: 'application/pdf' }), 'signed_B.pdf');
    res = await client.request(`/evidence-source/${sourceId}/upload-signed-certificate`, 'POST', certBFd, true);
    if (res.status !== 200 || res.data.status !== 'COMPLETED') {
        console.error('Failed to upload Part B:', res.data);
        return;
    }
    console.log('✔ Part B Signed Certificate Uploaded. Status -> ' + res.data.status);

    console.log('\n[12] Download Final Completed PDF via new route');
    // fetch handles redirect natively, but we disabled auto-redirect or we can just fetch and expect the PDF content
    res = await fetch(`${BASE_URL}/evidence-source/${sourceId}/signed-certificate`, {
        headers: { Cookie: client.cookie },
        redirect: 'follow'
    });
    if (res.status === 200) {
        const buff = Buffer.from(await res.arrayBuffer());
        console.log(`✔ Final Signed Certificate downloaded successfully (${buff.length} bytes)`);
    } else {
        console.error('Failed to download final certificate:', res.status, await res.text());
        return;
    }

    console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY!');
}

run().catch(console.error);
