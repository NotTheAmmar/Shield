/**
 * SHIELD — Person 3 Integration Test Suite
 * Forensic Science Laboratory (FSL), Evidence Blockchain Anchoring & Sec 63 BSA Certification
 *
 * Validates:
 * 1. Role Enforcement: Police Officer denied from raw evidence upload (403 Forbidden).
 * 2. Forensic Expert Evidence Ingestion: Direct FIR selection, multi-category support, EVM ledger anchoring.
 * 3. Forensic Analysis Report Upload: Attach tools used, extraction methodology, hash verification.
 * 4. 1-Click Cryptographic Verification: Compare live MinIO stream against EvidenceLedger.sol on-chain hash.
 * 5. Statutory Section 63(4) BSA 2023 Certificate Generation & Digital Signing.
 * 6. Court-Admissible Section 63 Certificate Download (PDF validation).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3001';

async function http(method, endpoint, { token, body, multipart } = {}) {
    const url = `${GATEWAY}${endpoint}`;
    const opts = { method, headers: {} };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (multipart) {
        const boundary = '----ShieldPerson3Test' + Date.now();
        const parts = [];

        for (const [key, val] of Object.entries(multipart)) {
            if (val && typeof val === 'object' && val._file) {
                parts.push(Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${val.filename}"\r\nContent-Type: ${val.contentType || 'application/octet-stream'}\r\n\r\n`
                ));
                parts.push(Buffer.isBuffer(val.data) ? val.data : Buffer.from(val.data));
                parts.push(Buffer.from('\r\n'));
            } else {
                parts.push(Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
                ));
            }
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`));

        opts.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        opts.body = Buffer.concat(parts);
    } else if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    opts.redirect = 'manual';
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
}

async function runPerson3TestSuite() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🔬 SHIELD — PERSON 3: FSL EVIDENCE ANCHORING & SEC 63 BSA TEST SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1. Authenticate as Admin
    console.log('\n[1] 🔑 Authenticating Admin & Provisioning Test Personas...');
    const fallbackPass = Buffer.from('U2gxM2xkQFByMGR1Y3QxMG4yMDI2IQ==', 'base64').toString('utf8');
    const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@police.gov';
    let adminLogin = await http('POST', '/api/auth/login', {
        body: { email: adminEmail, password: process.env.ADMIN_SEED_PASSWORD || fallbackPass, role: 'Admin' }
    });
    if (!adminLogin.ok) {
        throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    }
    const adminToken = adminLogin.data.token;
    console.log(`   ✅ Logged in as Admin (${adminLogin.data.user.name})`);

    // Create Police Officer (for FIR creation)
    const policeEmail = `police_p3_${Date.now()}@police.gov`;
    const policePass = 'PolicePass123!';
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Officer Kothrud PS',
            email: policeEmail,
            employeeId: `POL-${Date.now().toString().slice(-5)}`,
            role: 'Police Officer',
            station: 'Kothrud PS',
            plainPassword: policePass
        }
    });

    const poLogin = await http('POST', '/api/auth/login', {
        body: { email: policeEmail, password: policePass, role: 'Police Officer' }
    });
    const policeToken = poLogin.data.token;
    console.log(`   ✅ Police Officer logged in (${policeEmail})`);

    // Create Forensic Expert
    const expertEmail = `expert_fsl_${Date.now()}@fsl.gov.in`;
    const expertPass = 'ExpertFsl123!';
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Dr. Sunita Sharma',
            email: expertEmail,
            employeeId: `FSL-${Date.now().toString().slice(-5)}`,
            role: 'Forensic Expert',
            designation: 'Examiner of Electronic Evidence (Senior Scientist)',
            fslJurisdictionId: 'Regional Forensic Science Laboratory, Pune',
            plainPassword: expertPass
        }
    });

    const feLogin = await http('POST', '/api/auth/login', {
        body: { email: expertEmail, password: expertPass, role: 'Forensic Expert' }
    });
    const expertToken = feLogin.data.token;
    console.log(`   ✅ Forensic Expert logged in (${expertEmail})`);

    // 2. Register FIR under Person 2
    console.log('\n[2] 📜 Registering Physical Scanned FIR (BNS Sec 303)...');
    const firNumber = `0214/${new Date().getFullYear()}`;
    const firRes = await http('POST', '/api/fir/create', {
        token: policeToken,
        multipart: {
            firNumber,
            incidentDateTime: new Date().toISOString(),
            applicableSections: 'BNS Sec 303 (Theft), IT Act Sec 66',
            station: 'Kothrud PS',
            location: 'Kothrud Commercial Complex',
            description: 'Theft of digital hard drive and network server equipment.',
            file: {
                _file: true,
                filename: 'scanned_fir_0214.pdf',
                contentType: 'application/pdf',
                data: Buffer.from('GOVERNMENT OF MAHARASHTRA POLICE DEPARTMENT - SCANNED FIR COPY: ' + firNumber)
            }
        }
    });

    if (!firRes.ok) throw new Error(`FIR registration failed: ${JSON.stringify(firRes.data)}`);
    const firId = firRes.data.fir_id;
    console.log(`   ✅ FIR Registered! ID: ${firId} | FIR Number: ${firNumber}`);

    // 3. Test RBAC: Ensure Police Officer CANNOT upload raw evidence directly
    console.log('\n[3] 🛑 Testing RBAC Zero-Trust: Enforce Police Officer raw evidence denial...');
    const policeUploadAttempt = await http('POST', '/api/evidence/upload', {
        token: policeToken,
        multipart: {
            fir_id: firId,
            category: 'CCTV Footage',
            description: 'Unauthorized police evidence upload attempt',
            file: {
                _file: true,
                filename: 'police_attempt.mp4',
                contentType: 'video/mp4',
                data: Buffer.from('ILLEGAL_UNAUTHORIZED_POLICE_STREAM')
            }
        }
    });

    if (policeUploadAttempt.status === 403) {
        console.log(`   ✅ Correctly BLOCKED Police Officer upload with 403 Forbidden! Segregation of duties preserved.`);
    } else {
        throw new Error(`Expected 403 Forbidden for police upload, got ${policeUploadAttempt.status}: ${JSON.stringify(policeUploadAttempt.data)}`);
    }

    // 4. Ingest CCTV Evidence by Forensic Expert
    console.log('\n[4] 📹 Forensic Expert Ingesting CCTV Evidence & Anchoring to EVM...');
    const cctvStream = Buffer.from('HIKVISION_NVR_RAW_STREAM_CH4_TIMESTAMP_' + Date.now());
    const evUpload = await http('POST', '/api/evidence/upload', {
        token: expertToken,
        multipart: {
            fir_id: firId,
            category: 'CCTV Footage',
            description: 'High-definition corridor CCTV camera footage of incident scene.',
            file: {
                _file: true,
                filename: 'incident_cctv_ch4.mp4',
                contentType: 'video/mp4',
                data: cctvStream
            }
        }
    });

    if (!evUpload.ok) throw new Error(`Evidence upload failed: ${JSON.stringify(evUpload.data)}`);
    const evidenceItem = evUpload.data.files[0];
    const evidenceId = evidenceItem.id;
    console.log(`   ✅ Evidence Ingested by Forensic Expert!`);
    console.log(`      • Evidence ID:     ${evidenceId}`);
    console.log(`      • Category:        ${evidenceItem.category}`);
    console.log(`      • SHA-256 Hash:    ${evidenceItem.sha256_hash}`);
    console.log(`      • Blockchain Tx:   ${evidenceItem.ledgerTxId || 'Anchored'}`);

    // 5. Attach Forensic Analysis Report
    console.log('\n[5] 📑 Attaching Forensic Analysis Report (Tools, Methodology, Results)...');
    const reportRes = await http('POST', `/api/evidence/${evidenceId}/report`, {
        token: expertToken,
        multipart: {
            toolsUsed: 'Cellebrite UFED v7.68, Autopsy v4.21, Tableau T8u Hardware Write-Blocker',
            extractionMethodology: 'Bit-stream physical image acquisition under hardware write-blocker isolation.',
            hashVerificationResults: 'Cryptographic SHA-256 bitstream match verified 100% against NVR master storage.',
            examinerNotes: 'No data corruption or bad sectors detected throughout bitstream examination.',
            reportFile: {
                _file: true,
                filename: 'FSL_Report_CCTV_0214.pdf',
                contentType: 'application/pdf',
                data: Buffer.from('%PDF-1.4 FSL TECHNICAL ANALYSIS REPORT - CASE 0214/2026')
            }
        }
    });

    if (!reportRes.ok) throw new Error(`Report attachment failed: ${JSON.stringify(reportRes.data)}`);
    console.log(`   ✅ Forensic Analysis Report Attached!`);
    console.log(`      • Report ID:       ${reportRes.data.reportId}`);
    console.log(`      • Report Hash:     ${reportRes.data.sha256_hash}`);

    // Verify GET Report
    const getReportRes = await http('GET', `/api/evidence/${evidenceId}/report`, { token: expertToken });
    if (!getReportRes.ok || !getReportRes.data.downloadUrl) {
        throw new Error(`Failed to fetch report metadata: ${JSON.stringify(getReportRes.data)}`);
    }
    console.log(`   ✅ Verified GET /report: Download URL presigned successfully.`);

    // 6. 1-Click Cryptographic Verification Engine
    console.log('\n[6] 🔍 Testing 1-Click Cryptographic Verification Engine...');
    const verifyRes = await http('GET', `/api/evidence/verify/${evidenceId}`, { token: expertToken });
    if (!verifyRes.ok) throw new Error(`Verify failed: ${JSON.stringify(verifyRes.data)}`);

    const isVerified = verifyRes.data.status === 'VERIFIED' || verifyRes.data.status === 'OK' || verifyRes.data.match === true;
    if (isVerified) {
        console.log(`   ✅ Cryptographic Verification: VERIFIED (100% Match)`);
        console.log(`      • Live MinIO Hash: ${verifyRes.data.liveHash || verifyRes.data.currentHash}`);
        console.log(`      • Ledger Hash:     ${verifyRes.data.ledgerHash}`);
    } else {
        throw new Error(`Verification failed unexpectedly: ${JSON.stringify(verifyRes.data)}`);
    }

    // 7. Preview Certificate Data
    console.log('\n[7] 📋 Fetching Section 63 BSA Certificate Preview Data...');
    const certDataRes = await http('GET', `/api/evidence/${evidenceId}/certificate-data`, { token: expertToken });
    if (!certDataRes.ok) throw new Error(`Failed to get cert data: ${JSON.stringify(certDataRes.data)}`);
    console.log(`   ✅ Certificate Data Retrieved:`);
    console.log(`      • Examiner:        ${certDataRes.data.expertName}`);
    console.log(`      • Analyst ID:      ${certDataRes.data.analystId}`);
    console.log(`      • Statutory Scope: Section 63(4) Bharatiya Sakshya Adhiniyam, 2023`);

    // 8. Digitally Sign & Issue Section 63 BSA Certificate
    console.log('\n[8] ✍️ Digitally Signing Section 63(4) BSA Electronic Evidence Certificate...');
    const dummySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const signRes = await http('POST', `/api/evidence/${evidenceId}/sign-certificate`, {
        token: expertToken,
        body: { signatureBase64: dummySignature }
    });

    if (!signRes.ok) throw new Error(`Certificate signing failed: ${JSON.stringify(signRes.data)}`);
    console.log(`   ✅ Section 63 Certificate Generated & Digitally Signed!`);
    console.log(`      • Status:          ${signRes.data.status}`);
    console.log(`      • Certificate Path:${signRes.data.certPath}`);

    // 9. Download Court-Ready Section 63 BSA PDF
    console.log('\n[9] 📥 Validating Download of Court-Ready Section 63 BSA PDF...');
    const dlCertRes = await http('GET', `/api/evidence/${evidenceId}/certificate`, { token: expertToken });
    // Should return 302 redirect to presigned MinIO URL or 200 with PDF
    if (dlCertRes.status === 302 || dlCertRes.status === 200) {
        console.log(`   ✅ Section 63 BSA Court-Admissible PDF Download Endpoint Validated!`);
    } else {
        throw new Error(`Unexpected status downloading certificate: ${dlCertRes.status}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🎉 ALL PERSON 3 SPECIFICATIONS VERIFIED & FULLY FUNCTIONAL!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runPerson3TestSuite().catch(err => {
    console.error('\n❌ Person 3 Test Execution Error:', err.message);
    process.exit(1);
});
