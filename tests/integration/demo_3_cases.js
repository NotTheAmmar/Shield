const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Minio = require('minio');
const crypto = require('crypto');

const BASE_URL = 'http://localhost/api';

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
        
        if (res.headers.get('content-type')?.includes('application/pdf')) {
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
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   🛡️  SHIELD — Mock FIR & Evidence Testing Suite (3 Cases)  ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const client = new ApiClient();

    // Setup: Login as Admin first to ensure Police and Judge accounts exist with correct passwords if needed.
    console.log('[Setup] Verifying Police Officer and Judge accounts...');
    
    let loginRes = await client.request('/auth/login', 'POST', {
        email: process.env.ADMIN_SEED_EMAIL || 'admin@shield.gov.in',
        password: process.env.ADMIN_SEED_PASSWORD || 'admin@123',
        role: 'Admin'
    });
    if (loginRes.status !== 200) {
        console.error('❌ Admin login failed. Cannot setup tests. Error:', loginRes.data);
        process.exit(1);
    }
    console.log('✔ Admin login success. Checking user database...');

    const usersListRes = await client.request('/admin/users', 'GET');
    if (usersListRes.status !== 200) {
        console.error('❌ Failed to fetch users list:', usersListRes.data);
        process.exit(1);
    }
    const users = usersListRes.data.users || [];
    
    // Ensure Police Officer exists
    const poEmail = process.env.police_Email || 'singam@officer.gov.in';
    const poPassword = process.env.police_password || '@Ajay1234';
    const poUser = users.find(u => u.email === poEmail);
    if (!poUser) {
        console.log(`Creating missing Police Officer (${poEmail})...`);
        const res = await client.request('/admin/users', 'POST', {
            email: poEmail,
            name: 'Singam Officer',
            employeeId: 'EMP_PO_01',
            role: 'Police Officer',
            plainPassword: poPassword
        });
        if (res.status !== 201) {
            console.error('❌ Failed to create Police Officer:', res.data);
            process.exit(1);
        }
        console.log('✔ Police Officer created successfully');
    } else {
        console.log('✔ Police Officer exists in DB. Resetting password to ensure correctness...');
        await client.request(`/admin/users/${poUser.id}/reset-password`, 'POST', { plainPassword: poPassword });
    }

    // Ensure Judicial Authority exists
    const judgeEmail = process.env.Judge_Email || 'amitabh@judge.gov.in';
    const judgePassword = process.env.Judge_Password || '@Amitabh1234';
    const judgeUser = users.find(u => u.email === judgeEmail);
    if (!judgeUser) {
        console.log(`Creating missing Judicial Authority (${judgeEmail})...`);
        const res = await client.request('/admin/users', 'POST', {
            email: judgeEmail,
            name: 'Amitabh Judge',
            employeeId: 'EMP_JUDGE_01',
            role: 'Judicial Authority',
            plainPassword: judgePassword
        });
        if (res.status !== 201) {
            console.error('❌ Failed to create Judge:', res.data);
            process.exit(1);
        }
        console.log('✔ Judicial Authority created successfully');
    } else {
        console.log('✔ Judicial Authority exists in DB. Resetting password to ensure correctness...');
        await client.request(`/admin/users/${judgeUser.id}/reset-password`, 'POST', { plainPassword: judgePassword });
    }

    client.cookie = ''; // Clear admin session
    
    console.log('⏳ Waiting 10s for blockchain role provisioning queue...');
    await new Promise(r => setTimeout(r, 10000));

    // ==========================================
    // TEST CASE 1: Cyber Crime & Financial Phishing (Happy Path & Tampering Detection)
    // ==========================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  TEST CASE 1: CYBER CRIME & PHISHING (Happy Path & Tampering)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('[1] Logging in as Police Officer...');
    let poLogin = await client.request('/auth/login', 'POST', {
        email: poEmail,
        password: poPassword,
        role: 'Police Officer'
    });
    if (poLogin.status !== 200) {
        console.error('❌ Police Officer login failed:', poLogin.data);
        process.exit(1);
    }
    console.log('✔ Police Officer logged in successfully.');

    console.log('[2] Creating Cyber Crime Phishing FIR...');
    const cyberFirNumber = 'FIR-2026-CYBER-8921';
    const cyberFirFd = new FormData();
    cyberFirFd.append('firNumber', cyberFirNumber);
    cyberFirFd.append('incidentType', 'Cyber Crime');
    cyberFirFd.append('description', 'Complaint filed by Ramesh Kumar regarding unauthorized debit of INR 1,50,000 from HDFC Bank account. Victim received SMS from sender "AD-HDFCBK" containing phishing link "hdfc-verification-portal.com". Upon clicking, UPI credentials exfiltrated and funds transferred to third-party beneficiary account. Violations under Section 66D IT Act and Section 420 IPC.');
    cyberFirFd.append('location', 'Bengaluru Cyber Cell, Sector 5');
    
    const cyberFirContent = 'POLICE DEPT CYBER CELL - FIRST INFORMATION REPORT\nNumber: FIR-2026-CYBER-8921\nComplainant: Ramesh Kumar\nSections: 66D IT Act, 420 IPC\nDetails: Victim clicked link in phishing SMS. Funds transferred to beneficiary UPI ID: rajesh99@oksbi.';
    cyberFirFd.append('file', new Blob([cyberFirContent], { type: 'text/plain' }), 'fir_cyber_phishing_8921.txt');
    
    let cyberFirRes = await client.request('/fir/create', 'POST', cyberFirFd, true);
    if (cyberFirRes.status !== 201) {
        console.error('❌ Cyber FIR creation failed:', cyberFirRes.data);
        process.exit(1);
    }
    const cyberFirId = cyberFirRes.data.fir_id;
    console.log(`✔ Cyber FIR Created successfully. ID: ${cyberFirId}, Number: ${cyberFirNumber}`);

    console.log('[3] Uploading Mobile Phone Forensic Evidence...');
    const cyberEvFd = new FormData();
    cyberEvFd.append('fir_id', cyberFirId);
    cyberEvFd.append('sourceData', JSON.stringify({
        sourceType: 'Mobile Phone Memory Dump',
        make: 'OnePlus',
        model: 'Nord CE 3',
        serial: 'OP-NORD-9921A',
        deviceChain: [{ handler: 'Inspector Singam', date: new Date().toISOString() }],
        lawfulControl: true,
        properOperation: true
    }));
    
    const phishingSmsEvidence = JSON.stringify({
        sms_header: "AD-HDFCBK",
        sms_body: "Dear customer, your HDFC account will be suspended. Please verify your details immediately at https://hdfc-verification-portal.com/login",
        received_time: "2026-06-24T18:22:04Z",
        victim_phone: "+91 98765 43210",
        ip_resolution: {
            domain: "hdfc-verification-portal.com",
            resolved_ip: "104.21.32.110",
            hosting_provider: "Cloudflare Inc."
        },
        forensic_hash: "2f71661601a4e101f31d0442345d3f23a4b0811e55047b77f9e8a8b8d5e95b43"
    }, null, 2);
    cyberEvFd.append('file', new Blob([phishingSmsEvidence], { type: 'application/json' }), 'phishing_sms_screenshot_metadata.json');
    
    let cyberEvRes = await client.request('/evidence/upload', 'POST', cyberEvFd, true);
    if (cyberEvRes.status !== 201) {
        console.error('❌ Cyber evidence upload failed:', cyberEvRes.data);
        process.exit(1);
    }
    
    const cyberEvidence = cyberEvRes.data.files[0];
    const cyberEvidenceId = cyberEvidence.id;
    const cyberOriginalHash = cyberEvidence.sha256_hash;
    const cyberBucketName = 'evidence';
    const cyberObjectKey = `${cyberEvidenceId}${path.extname('phishing_sms_screenshot_metadata.json')}`;
    
    console.log(`✔ Cyber evidence uploaded successfully.`);
    console.log(`   - Evidence ID: ${cyberEvidenceId}`);
    console.log(`   - Object Key in MinIO: ${cyberObjectKey}`);
    console.log(`   - SHA-256 Hash stored on blockchain: ${cyberOriginalHash}`);

    console.log('⏳ Waiting 5s for block mining confirmation...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('[4] Verifying evidence integrity via the SHIELD API...');
    let cyberVerifyRes = await client.request(`/evidence/verify/${cyberEvidenceId}`, 'GET');
    if (cyberVerifyRes.status !== 200) {
        console.error('❌ Cyber verification request failed:', cyberVerifyRes.data);
        process.exit(1);
    }
    
    console.log(`✔ Integrity Check Status: ${cyberVerifyRes.data.status}`);
    if (cyberVerifyRes.data.status === 'OK') {
        console.log('   ✅ Verification SUCCESS: Phishing SMS forensic evidence matches ledger.');
    } else {
        console.error('   ❌ Verification FAILURE: File hash mismatch.');
        process.exit(1);
    }

    console.log('[5] Simulating direct attacker database/storage tamper to cover tracks...');
    const minioClient = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: process.env.MINIO_ROOT_USER || 'shield',
        secretKey: process.env.MINIO_ROOT_PASSWORD || 'secure_minio_password'
    });

    const tamperedPhishingSms = JSON.stringify({
        sms_header: "AD-HDFCBK",
        sms_body: "Dear customer, your HDFC account will be suspended. Please verify your details immediately at https://hdfc-verification-portal.com/login",
        received_time: "2026-06-24T18:22:04Z",
        victim_phone: "+91 98765 43210",
        ip_resolution: {
            domain: "hdfc-verification-portal.com",
            resolved_ip: "127.0.0.1",
            hosting_provider: "Local Host"
        },
        forensic_hash: "2f71661601a4e101f31d0442345d3f23a4b0811e55047b77f9e8a8b8d5e95b43"
    }, null, 2);

    await minioClient.putObject(cyberBucketName, cyberObjectKey, Buffer.from(tamperedPhishingSms));
    console.log(`✔ Success: Object "${cyberObjectKey}" has been directly altered in MinIO.`);
    console.log('   - Changed IP 104.21.32.110 -> 127.0.0.1 to cover up phisher host location.');
    console.log('   - NOTE: This bypasses the API completely. No audit logs were created!');

    console.log('[6] Triggering verification of the tampered evidence via SHIELD API...');
    let cyberVerifyTamperRes = await client.request(`/evidence/verify/${cyberEvidenceId}`, 'GET');
    if (cyberVerifyTamperRes.status !== 200) {
        console.error('❌ Verification request failed:', cyberVerifyTamperRes.data);
        process.exit(1);
    }

    console.log(`✔ Integrity Check Status: ${cyberVerifyTamperRes.data.status}`);
    if (cyberVerifyTamperRes.data.status === 'TAMPERED') {
        console.log('   ✅ Detection SUCCESS: SHIELD caught the offline tampering attempt!');
        console.log(`   - Original ledger hash: ${cyberOriginalHash}`);
        console.log(`   - Tampered storage hash: ${crypto.createHash('sha256').update(tamperedPhishingSms).digest('hex')}`);
    } else {
        console.error('   ❌ Detection FAILURE: The tampering was NOT caught by the system.');
        process.exit(1);
    }

    console.log('[7] Restoring original file to keep storage clean...');
    await minioClient.putObject(cyberBucketName, cyberObjectKey, Buffer.from(phishingSmsEvidence));
    console.log('✔ Original file restored.');

    // ==========================================
    // TEST CASE 2: Narcotics Seizure (Integrity Preservation & Verification)
    // ==========================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  TEST CASE 2: NARCOTICS SEIZURE (Integrity Preservation)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('[1] Creating Narcotics Seizure (NDPS Act) FIR...');
    const ndpsFirNumber = 'FIR-2026-NDPS-0472';
    const ndpsFirFd = new FormData();
    ndpsFirFd.append('firNumber', ndpsFirNumber);
    ndpsFirFd.append('incidentType', 'Narcotics Seizure');
    ndpsFirFd.append('description', 'Under NDPS Act 1985 Section 20/22. Interception of vehicle MH-12-PQ-9988 at highway checkpoint. Search of the vehicle trunk revealed a hidden compartment containing 5.2 kg of high-grade cannabis (Ganja) packaged in 5 distinct sealed packets. Driver identified as Suresh Patil arrested on site.');
    ndpsFirFd.append('location', 'NH-48 Toll Plaza, Pune-Mumbai Highway');
    
    const ndpsFirContent = 'MAHARASHTRA POLICE - FIRST INFORMATION REPORT\nNumber: FIR-2026-NDPS-0472\nUnder Section: 20/22 NDPS Act 1985\nSeizure: 5.2 kg Cannabis (Ganja)\nAccused: Suresh Patil';
    ndpsFirFd.append('file', new Blob([ndpsFirContent], { type: 'text/plain' }), 'fir_ndps_seizure_0472.txt');
    
    let ndpsFirRes = await client.request('/fir/create', 'POST', ndpsFirFd, true);
    if (ndpsFirRes.status !== 201) {
        console.error('❌ NDPS FIR creation failed:', ndpsFirRes.data);
        process.exit(1);
    }
    const ndpsFirId = ndpsFirRes.data.fir_id;
    console.log(`✔ NDPS FIR Created successfully. ID: ${ndpsFirId}, Number: ${ndpsFirNumber}`);

    console.log('[2] Uploading Physical Evidence Seizure Memo...');
    const ndpsEvFd = new FormData();
    ndpsEvFd.append('fir_id', ndpsFirId);
    ndpsEvFd.append('sourceData', JSON.stringify({
        sourceType: 'Physical Evidence Seizure Bag',
        make: 'ForensicSec Ltd',
        model: 'Tamper-Evident Bag A-Grade',
        serial: 'BAG-NDPS-77123',
        deviceChain: [{ handler: 'Inspector Singam', date: new Date().toISOString() }],
        lawfulControl: true,
        properOperation: true
    }));
    
    const seizureMemoContent = `SEIZURE MEMORANDUM (NDPS ACT SECTION 50)
Date: 2026-06-25
Location: NH-48 Toll Plaza
Officer In-Charge: Inspector Singam (ID: EMP_PO_01)
Witness 1: Anil Deshmukh (Merchant, Pune)
Witness 2: Vijay Shinde (NHAI Toll Operator)

Seized Items:
1. 5.2 Kilograms of Greenish-Brown vegetative substance testing positive for Cannabis.
2. Packaged in 5 plastic bags, labeled P1 to P5.
3. Wrapped in brown tape and sealed with official Police Seal No. 9.

Signatures:
- Suresh Patil (Accused)
- Anil Deshmukh (Witness)
- Inspector Singam`;

    ndpsEvFd.append('file', new Blob([seizureMemoContent], { type: 'text/plain' }), 'seizure_memo_signed.txt');
    
    let ndpsEvRes = await client.request('/evidence/upload', 'POST', ndpsEvFd, true);
    if (ndpsEvRes.status !== 201) {
        console.error('❌ NDPS evidence upload failed:', ndpsEvRes.data);
        process.exit(1);
    }
    
    const ndpsEvidence = ndpsEvRes.data.files[0];
    const ndpsEvidenceId = ndpsEvidence.id;
    const ndpsOriginalHash = ndpsEvidence.sha256_hash;
    
    console.log(`✔ NDPS evidence uploaded successfully.`);
    console.log(`   - Evidence ID: ${ndpsEvidenceId}`);
    console.log(`   - SHA-256 Hash stored on blockchain: ${ndpsOriginalHash}`);

    console.log('⏳ Waiting 5s for block mining confirmation...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('[3] Verifying NDPS evidence integrity via the SHIELD API...');
    let ndpsVerifyRes = await client.request(`/evidence/verify/${ndpsEvidenceId}`, 'GET');
    if (ndpsVerifyRes.status !== 200) {
        console.error('❌ NDPS verification request failed:', ndpsVerifyRes.data);
        process.exit(1);
    }
    
    console.log(`✔ Integrity Check Status: ${ndpsVerifyRes.data.status}`);
    if (ndpsVerifyRes.data.status === 'OK') {
        console.log('   ✅ Verification SUCCESS: NDPS Seizure Memo matches blockchain registry.');
    } else {
        console.error('   ❌ Verification FAILURE: File hash mismatch.');
        process.exit(1);
    }

    // ==========================================
    // TEST CASE 3: Corporate Espionage & RBAC Boundary
    // ==========================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  TEST CASE 3: CORPORATE ESPIONAGE (RBAC Boundary)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('[1] Logging in back as Police Officer...');
    let poLoginAgain = await client.request('/auth/login', 'POST', {
        email: poEmail,
        password: poPassword,
        role: 'Police Officer'
    });
    if (poLoginAgain.status !== 200) {
        console.error('❌ Police Officer re-login failed:', poLoginAgain.data);
        process.exit(1);
    }

    console.log('[2] Creating Corporate Espionage (IP Theft) FIR...');
    const corpFirNumber = 'FIR-2026-CORP-1049';
    const corpFirFd = new FormData();
    corpFirFd.append('firNumber', corpFirNumber);
    corpFirFd.append('incidentType', 'Corporate Espionage');
    corpFirFd.append('description', 'Complaint filed by HR of TechVanguard Solutions Pvt Ltd. Former Senior AI Research Engineer, Amit Verma, exfiltrated proprietary deep learning model weights and source code to a personal OneDrive repository using unauthorized USB storage devices. Violations under Sections 43 & 66 of IT Act and Section 406 IPC.');
    corpFirFd.append('location', 'Cyberabad Police Station, Hyderabad');
    
    const corpFirContent = 'CYBER INTELLECTUAL PROPERTY CRIME REPORT\nNumber: FIR-2026-CORP-1049\nCompany: TechVanguard Solutions\nAccused: Amit Verma\nSections: 43 & 66 IT Act, 406 IPC';
    corpFirFd.append('file', new Blob([corpFirContent], { type: 'text/plain' }), 'fir_corporate_espionage_1049.txt');
    
    let corpFirRes = await client.request('/fir/create', 'POST', corpFirFd, true);
    if (corpFirRes.status !== 201) {
        console.error('❌ Corporate FIR creation failed:', corpFirRes.data);
        process.exit(1);
    }
    const corpFirId = corpFirRes.data.fir_id;
    console.log(`✔ Corporate FIR Created successfully. ID: ${corpFirId}, Number: ${corpFirNumber}`);

    console.log('[3] Uploading USB Registry Logs Evidence...');
    const corpEvFd = new FormData();
    corpEvFd.append('fir_id', corpFirId);
    corpEvFd.append('sourceData', JSON.stringify({
        sourceType: 'Forensic Workstation Image',
        make: 'Dell',
        model: 'Precision 5820',
        serial: 'TAG-CORP-AI-82',
        deviceChain: [{ handler: 'Forensic Expert Singam', date: new Date().toISOString() }],
        lawfulControl: true,
        properOperation: true
    }));
    
    const usbRegistryLogs = `Timestamp,RegistryKey,ValueName,ValueData,Interpretation
2026-06-24T09:12:00Z,HKLM\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR,Disk&Ven_SanDisk&Prod_Ultra&Rev_1.00,4C531001350225114170,SanDisk USB Connected
2026-06-24T09:15:30Z,HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\{e81a32-11e2-b92},VolumeName,Backup_AI,USB volume mounted
2026-06-24T09:20:12Z,UserAssist\\{CEBFF5CD-094B-4662-8E6A-19E15EA15112},cmd.exe,"robocopy C:\\projects\\ai-core F:\\backup /E",Command executed to copy source code`;

    corpEvFd.append('file', new Blob([usbRegistryLogs], { type: 'text/csv' }), 'usb_forensics_registry_log.csv');
    
    let corpEvRes = await client.request('/evidence/upload', 'POST', corpEvFd, true);
    if (corpEvRes.status !== 201) {
        console.error('❌ Corporate evidence upload failed:', corpEvRes.data);
        process.exit(1);
    }
    
    const corpEvidence = corpEvRes.data.files[0];
    console.log(`✔ Corporate evidence uploaded successfully. ID: ${corpEvidence.id}`);

    console.log('[4] Logging in as Judicial Authority (Judge)...');
    let judgeLogin = await client.request('/auth/login', 'POST', {
        email: judgeEmail,
        password: judgePassword,
        role: 'Judicial Authority'
    });
    if (judgeLogin.status !== 200) {
        console.error('❌ Judge login failed:', judgeLogin.data);
        process.exit(1);
    }
    console.log('✔ Judge logged in successfully.');

    console.log('[5] Judge attempts to upload new evidence (should be BLOCKED)...');
    const judgeEvFd = new FormData();
    judgeEvFd.append('fir_id', corpFirId);
    judgeEvFd.append('sourceData', JSON.stringify({
        sourceType: 'Judicial Document',
        lawfulControl: true,
        properOperation: true,
        deviceChain: [{ handler: 'Judge Amitabh', date: new Date().toISOString() }]
    }));
    judgeEvFd.append('file', new Blob(['Judge uploading supplementary file'], { type: 'text/plain' }), 'judge_file.txt');
    
    let judgeUploadRes = await client.request('/evidence/upload', 'POST', judgeEvFd, true);
    console.log(`✔ Server Response Status: ${judgeUploadRes.status}`);
    if (judgeUploadRes.status === 403) {
        console.log('   ✅ RBAC SUCCESS: Judicial Authority is correctly BLOCKED from writing evidence.');
    } else {
        console.error('   ❌ RBAC FAILURE: Judicial Authority was allowed to write evidence or returned wrong status:', judgeUploadRes);
        process.exit(1);
    }

    console.log('[6] Attempting anonymous upload without any token (should be BLOCKED)...');
    client.cookie = ''; // Clear authentication session cookie
    let anonUploadRes = await client.request('/evidence/upload', 'POST', judgeEvFd, true);
    console.log(`✔ Server Response Status: ${anonUploadRes.status}`);
    if (anonUploadRes.status === 401) {
        console.log('   ✅ RBAC SUCCESS: Unauthenticated request is correctly BLOCKED with 401.');
    } else {
        console.error('   ❌ RBAC FAILURE: Unauthenticated request was not blocked correctly:', anonUploadRes);
        process.exit(1);
    }

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  🎉 ALL 3 REAL-WORLD TEST CASES EXECUTED AND PASSED!     ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
}

run().catch(err => {
    console.error('💀 Fatal execution error:', err);
    process.exit(1);
});
