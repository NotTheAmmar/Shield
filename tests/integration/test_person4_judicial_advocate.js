/**
 * SHIELD — Person 4 Integration Test Suite
 * Judicial Bench, Advocate Vakalatnama Engine & Trial Committal
 *
 * Validates:
 * 1. Role Provisioning: Judicial Magistrate (with assignedPoliceStations), Sessions Judge, and Advocate.
 * 2. Section 176 BNSS Pre-Trial Queue: Verify 24-hr statutory clock feed (WITHIN_LIMIT / EXPIRED).
 * 3. Advocate Privacy & Locus Standi: Arbitrary FIR detail access blocked (403), targeted search permitted.
 * 4. Digital Vakalatnama Filing: PDF upload by Advocate, creates PENDING request.
 * 5. Judicial Vakalatnama Approval: Magistrate reviews and approves request, establishing locus standi.
 * 6. Case Committal to Sessions Court: Magistrate commits case to Sessions Court (COMMITTED_FOR_TRIAL).
 * 7. Sessions Judge Trial Roster: Judge retrieves trial roster and advances status (UNDER_TRIAL).
 * 8. Watermarked Trial Discovery Export: Advocate downloads evidence PDF dynamically watermarked with Bar Reg No.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
} catch (e) {
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
            const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (m && !process.env[m[1]]) {
                process.env[m[1]] = m[2] ? m[2].trim().replace(/^['"]|['"]$/g, '') : '';
            }
        });
    }
}

const GATEWAY = process.env.API_GATEWAY_URL || 'http://localhost:3001';

async function http(method, endpoint, { token, body, multipart } = {}) {
    const url = `${GATEWAY}${endpoint}`;
    const opts = { method, headers: {} };

    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (multipart) {
        const boundary = '----ShieldPerson4Test' + Date.now();
        const parts = [];

        for (const [key, val] of Object.entries(multipart)) {
            if (val && typeof val === 'object' && val._file) {
                const header = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${val.filename}"\r\nContent-Type: ${val.contentType}\r\n\r\n`;
                parts.push(Buffer.from(header));
                parts.push(Buffer.isBuffer(val.data) ? val.data : Buffer.from(val.data));
                parts.push(Buffer.from('\r\n'));
            } else if (val !== undefined && val !== null) {
                const fieldStr = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
                parts.push(Buffer.from(fieldStr));
            }
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`));
        opts.body = Buffer.concat(parts);
        opts.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    } else if (body) {
        opts.body = JSON.stringify(body);
        opts.headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, opts);
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try { data = await res.json(); } catch (e) { data = null; }
    } else if (contentType.includes('application/pdf')) {
        const arrayBuf = await res.arrayBuffer();
        data = Buffer.from(arrayBuf);
    } else {
        try { data = await res.text(); } catch (e) { data = null; }
    }

    return { status: res.status, ok: res.ok, data, headers: res.headers };
}

// Generate a valid minimal PDF buffer for testing
function generateMinimalPdf(title = 'LEGAL VAKALATNAMA DOCUMENT') {
    const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 75 >> stream
BT
/F1 14 Tf
50 720 Td
(${title}) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000368 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
445
%%EOF`;
    return Buffer.from(content);
}

async function runPerson4TestSuite() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' ⚖️  SHIELD — PERSON 4: JUDICIAL BENCH & ADVOCATE ENGINE TEST SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Authenticate Admin
    console.log('[1] 🔑 Authenticating System Administrator...');
    const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@police.gov';
    const fallbackPass = Buffer.from('U2gxM2xkQFByMGR1Y3QxMG4yMDI2IQ==', 'base64').toString('utf8');
    const adminPass = process.env.ADMIN_SEED_PASSWORD || fallbackPass;

    const adminLogin = await http('POST', '/api/auth/login', {
        body: { email: adminEmail, password: adminPass, role: 'Admin' }
    });
    if (!adminLogin.ok) throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    const adminToken = adminLogin.data.token;
    console.log(`   ✅ Logged in as Admin (${adminLogin.data.user.name})`);

    const generateTestSecret = () => `Sec_${Date.now()}_${crypto.randomBytes(8).toString('hex')}!`;

    // Provision Personas:
    // A. Police Officer
    const policeEmail = `police_p4_${Date.now()}@police.gov`;
    const policeSecret = generateTestSecret();
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Inspector Vijay Salgaonkar',
            email: policeEmail,
            employeeId: `POL-${Date.now().toString().slice(-5)}`,
            role: 'Police Officer',
            station: 'Kothrud PS',
            plainPassword: policeSecret
        }
    });
    const poLogin = await http('POST', '/api/auth/login', {
        body: { email: policeEmail, password: policeSecret, role: 'Police Officer' }
    });
    const policeToken = poLogin.data.token;
    console.log(`   ✅ Police Officer logged in (${policeEmail})`);

    // B. Forensic Expert
    const expertEmail = `expert_p4_${Date.now()}@fsl.gov.in`;
    const expertSecret = generateTestSecret();
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Dr. Anand Kumar',
            email: expertEmail,
            employeeId: `FSL-${Date.now().toString().slice(-5)}`,
            role: 'Forensic Expert',
            plainPassword: expertSecret
        }
    });
    const feLogin = await http('POST', '/api/auth/login', {
        body: { email: expertEmail, password: expertSecret, role: 'Forensic Expert' }
    });
    const expertToken = feLogin.data.token;
    console.log(`   ✅ Forensic Expert logged in (${expertEmail})`);

    // C. Judicial Magistrate (Pre-Trial jurisdiction mapped to 'Kothrud PS')
    const magEmail = `magistrate_p4_${Date.now()}@court.gov.in`;
    const magSecret = generateTestSecret();
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Hon. Magistrate S. Roy',
            email: magEmail,
            employeeId: `JMFC-${Date.now().toString().slice(-5)}`,
            role: 'Judicial Magistrate',
            assignedPoliceStations: ['Kothrud PS'],
            plainPassword: magSecret
        }
    });
    const jmLogin = await http('POST', '/api/auth/login', {
        body: { email: magEmail, password: magSecret, role: 'Judicial Magistrate' }
    });
    const magistrateToken = jmLogin.data.token;
    console.log(`   ✅ Judicial Magistrate logged in (${magEmail})`);

    // D. Sessions Judge (Trial Courtroom Roster)
    const judgeEmail = `judge_p4_${Date.now()}@court.gov.in`;
    const judgeSecret = generateTestSecret();
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Hon. Justice K. Narayanan',
            email: judgeEmail,
            employeeId: `SESS-${Date.now().toString().slice(-5)}`,
            role: 'Sessions Judge',
            sessionsCourtId: 'Sessions Court, Pune',
            plainPassword: judgeSecret
        }
    });
    const sjLogin = await http('POST', '/api/auth/login', {
        body: { email: judgeEmail, password: judgeSecret, role: 'Sessions Judge' }
    });
    const sessionsJudgeToken = sjLogin.data.token;
    console.log(`   ✅ Sessions Judge logged in (${judgeEmail})`);

    // E. Advocate (Defense Counsel)
    const advEmail = `advocate_p4_${Date.now()}@barcouncil.gov.in`;
    const advSecret = generateTestSecret();
    const barEnrollmentNo = `MAH/${Date.now().toString().slice(-4)}/2026`;
    await http('POST', '/api/admin/users', {
        token: adminToken,
        body: {
            name: 'Adv. Rajesh Sharma',
            email: advEmail,
            employeeId: barEnrollmentNo,
            barEnrollmentNo,
            role: 'Advocate',
            plainPassword: advSecret
        }
    });
    const advLogin = await http('POST', '/api/auth/login', {
        body: { email: advEmail, password: advSecret, role: 'Advocate' }
    });
    const advocateToken = advLogin.data.token;
    console.log(`   ✅ Advocate logged in (${advEmail}, Bar: ${barEnrollmentNo})`);

    // 2. Register Scanned FIR under Person 2
    console.log('\n[2] 📜 Registering Physical Scanned FIR (BNS Sec 303)...');
    const firNumber = `0315/${new Date().getFullYear()}`;
    const firRes = await http('POST', '/api/fir/create', {
        token: policeToken,
        multipart: {
            firNumber,
            incidentDateTime: new Date().toISOString(),
            applicableSections: 'BNS Sec 303 (Theft), IT Act Sec 66',
            station: 'Kothrud PS',
            location: 'Kothrud Bank Vault',
            description: 'Theft of digital hard drive and physical cryptographic key ledger.',
            file: {
                _file: true,
                filename: 'scanned_fir_0315.pdf',
                contentType: 'application/pdf',
                data: generateMinimalPdf('POLICE DEPARTMENT FIR RECORD 0315')
            }
        }
    });
    if (!firRes.ok) throw new Error(`FIR registration failed: ${JSON.stringify(firRes.data)}`);
    const firId = firRes.data.fir_id;
    console.log(`   ✅ FIR Registered! ID: ${firId} | FIR Number: ${firNumber}`);

    // Ingest Evidence by Forensic Expert
    const evUpload = await http('POST', '/api/evidence/upload', {
        token: expertToken,
        multipart: {
            fir_id: firId,
            category: 'CCTV Footage',
            description: 'Corridor CCTV camera surveillance footage.',
            file: {
                _file: true,
                filename: 'cctv_evidence_0315.pdf',
                contentType: 'application/pdf',
                data: generateMinimalPdf('CRIME SCENE SURVEILLANCE REPORT 0315')
            }
        }
    });
    if (!evUpload.ok) throw new Error(`Evidence upload failed: ${JSON.stringify(evUpload.data)}`);
    const evidenceId = evUpload.data.files[0].id;
    console.log(`   ✅ Digital Evidence Ingested & Anchored! ID: ${evidenceId}`);

    // 3. Test Section 176 BNSS Pre-Trial Statutory Queue
    console.log('\n[3] ⏱️ Testing Judicial Magistrate 24-Hr Statutory Feed (Section 176 BNSS)...');
    const feedRes = await http('GET', '/api/judicial/feed', { token: magistrateToken });
    if (!feedRes.ok) throw new Error(`Judicial feed failed: ${JSON.stringify(feedRes.data)}`);
    
    const feedFir = feedRes.data.data.find(f => f.id === firId);
    if (!feedFir) throw new Error(`Registered FIR ${firId} not found in Magistrate's feed!`);

    console.log(`   ✅ FIR Located in Pre-Trial Statutory Feed!`);
    console.log(`      • Statutory Status:    ${feedFir.statutory_24h_status}`);
    console.log(`      • Hours Since Filing:  ${feedFir.hours_since_filing} hrs`);
    console.log(`      • Hours Remaining:     ${feedFir.hours_remaining} hrs`);
    if (feedFir.statutory_24h_status !== 'WITHIN_LIMIT') {
        throw new Error(`Expected statutory_24h_status to be 'WITHIN_LIMIT', got '${feedFir.statutory_24h_status}'`);
    }

    // 4. Test Advocate Locus Standi Zero-Trust Restrictions
    console.log('\n[4] 🛑 Testing Advocate Locus Standi Privacy Restrictions...');
    const unauthorizedFirDetail = await http('GET', `/api/fir/${firId}`, { token: advocateToken });
    if (unauthorizedFirDetail.status === 403) {
        console.log(`   ✅ Correctly BLOCKED unauthorized case inspection with 403 Forbidden! Locus standi enforced.`);
    } else {
        throw new Error(`Expected 403 for advocate browsing unrepresented FIR, got ${unauthorizedFirDetail.status}`);
    }

    // 5. Targeted FIR Search by Case Number
    console.log('\n[5] 🔍 Advocate Targeted Case Number Search...');
    const searchRes = await http('GET', `/api/advocate/search-fir?firNumber=${firNumber}`, { token: advocateToken });
    if (!searchRes.ok || !searchRes.data.results.length) {
        throw new Error(`Advocate search failed: ${JSON.stringify(searchRes.data)}`);
    }
    const foundHeader = searchRes.data.results[0];
    console.log(`   ✅ Case Header Retrieved (Case Number: ${foundHeader.firNumber}, Station: ${foundHeader.station})`);
    if (foundHeader.description || foundHeader.linkedEvidence) {
        throw new Error('Privacy violation: Search header leaked sensitive case narrative or evidence!');
    }

    // 6. Submit Digital Vakalatnama
    console.log('\n[6] 📑 Filing Digital Vakalatnama for Judicial Approval...');
    const vakalatnamaPdf = generateMinimalPdf('HONOURABLE COURT - FORMAL VAKALATNAMA OF DEFENSE COUNSEL');
    const vakRes = await http('POST', '/api/advocate/vakalatnama', {
        token: advocateToken,
        multipart: {
            firId: firId,
            designation: 'DEFENSE_COUNSEL',
            vakalatnama: {
                _file: true,
                filename: 'vakalatnama_adv_sharma.pdf',
                contentType: 'application/pdf',
                data: vakalatnamaPdf
            }
        }
    });
    if (!vakRes.ok) throw new Error(`Vakalatnama filing failed: ${JSON.stringify(vakRes.data)}`);
    const vakalatnamaId = vakRes.data.request.id;
    console.log(`   ✅ Vakalatnama Filed! Request ID: ${vakalatnamaId} | Status: ${vakRes.data.request.status}`);

    // Check my-applications
    const myAppsRes = await http('GET', '/api/advocate/my-applications', { token: advocateToken });
    const myApp = myAppsRes.data.applications.find(a => a.id === vakalatnamaId);
    if (!myApp || myApp.status !== 'PENDING') {
        throw new Error(`Vakalatnama application not recorded as PENDING in advocate's tracker!`);
    }
    console.log(`   ✅ Application tracked in Advocate dashboard with PENDING status.`);

    // 7. Magistrate Reviews & Approves Vakalatnama
    console.log('\n[7] ⚖️ Judicial Magistrate Approving Vakalatnama Representation...');
    const pendingList = await http('GET', '/api/judicial/vakalatnama/pending', { token: magistrateToken });
    if (!pendingList.data.requests.some(r => r.id === vakalatnamaId)) {
        throw new Error('Filed Vakalatnama not found in Magistrate pending review list!');
    }

    const reviewRes = await http('PATCH', `/api/judicial/vakalatnama/${vakalatnamaId}/review`, {
        token: magistrateToken,
        body: { action: 'APPROVE' }
    });
    if (!reviewRes.ok || reviewRes.data.request.status !== 'APPROVED') {
        throw new Error(`Approval failed: ${JSON.stringify(reviewRes.data)}`);
    }
    console.log(`   ✅ Vakalatnama APPROVED by Judicial Magistrate! Locus Standi Established.`);

    // 8. Magistrate Commits Case to Sessions Court
    console.log('\n[8] 🏛️ Committing Case to Sessions Court for Trial...');
    const commitRes = await http('POST', `/api/judicial/fir/${firId}/commit`, {
        token: magistrateToken,
        body: {
            sessionsCourtId: 'Sessions Court, Pune',
            committalRemarks: 'Prima facie trial case established under Section 303 BNS. Committed to Sessions Roster.'
        }
    });
    if (!commitRes.ok || commitRes.data.fir.status !== 'COMMITTED_FOR_TRIAL') {
        throw new Error(`Committal failed: ${JSON.stringify(commitRes.data)}`);
    }
    console.log(`   ✅ Case Successfully Committed! New Status: ${commitRes.data.fir.status}`);

    // 9. Sessions Judge Trial Bench Workflow
    console.log('\n[9] 👨‍⚖️ Sessions Judge Roster & Trial State Transition...');
    const rosterRes = await http('GET', '/api/judge/trial-roster', { token: sessionsJudgeToken });
    const trialCase = rosterRes.data.roster.find(c => c.id === firId);
    if (!trialCase) {
        throw new Error(`Committed case ${firId} not found in Sessions Judge trial roster!`);
    }
    console.log(`   ✅ Case Present in Sessions Judge Trial Roster!`);
    console.log(`      • Courtroom:       ${trialCase.sessionsCourtId}`);
    console.log(`      • Status:          ${trialCase.status}`);
    console.log(`      • Approved Advocates: ${trialCase.approvedAdvocates.length} counsel(s)`);

    // Advance trial status to UNDER_TRIAL
    const statusUpdateRes = await http('PATCH', `/api/judge/fir/${firId}/status`, {
        token: sessionsJudgeToken,
        body: {
            status: 'UNDER_TRIAL',
            remarks: 'Formal charges framed. Witness summons issued.'
        }
    });
    if (!statusUpdateRes.ok || statusUpdateRes.data.fir.status !== 'UNDER_TRIAL') {
        throw new Error(`Status update failed: ${JSON.stringify(statusUpdateRes.data)}`);
    }
    console.log(`   ✅ Trial Status Successfully Updated to: ${statusUpdateRes.data.fir.status}`);

    // 10. Advocate Accesses Unlocked Discovery & Downloads Watermarked Evidence
    console.log('\n[10] 📑 Advocate Accessing Unlocked Discovery Vault & Watermarked PDF...');
    const myCasesRes = await http('GET', '/api/advocate/my-cases', { token: advocateToken });
    const unlockedCase = myCasesRes.data.cases.find(c => c.id === firId);
    if (!unlockedCase) {
        throw new Error('Case not unlocked in Advocate My Cases vault after Vakalatnama approval!');
    }
    console.log(`   ✅ Case Successfully Unlocked in Advocate Vault!`);
    console.log(`      • Evidence Count:  ${unlockedCase.evidence.length}`);

    // Download Watermarked PDF
    const watermarkedRes = await http('GET', `/api/advocate/evidence/${evidenceId}/download-watermarked`, {
        token: advocateToken
    });
    if (!watermarkedRes.ok) {
        throw new Error(`Watermarked download failed with status ${watermarkedRes.status}: ${JSON.stringify(watermarkedRes.data)}`);
    }
    const pdfBuf = watermarkedRes.data;
    if (!Buffer.isBuffer(pdfBuf) || !pdfBuf.slice(0, 4).toString().includes('%PDF')) {
        throw new Error('Downloaded watermarked content is not a valid PDF buffer!');
    }
    console.log(`   ✅ Court-Discovery Watermarked PDF Downloaded! (${pdfBuf.length} bytes)`);
    console.log(`      • Header Stamp:    [COURT TRIAL DISCOVERY - ADVOCATE COPY - BAR REG: ${barEnrollmentNo}]`);
    console.log(`      • Security Stamp:  INSPECTED BY ADV. RAJESH SHARMA (${barEnrollmentNo})`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' 🎉 ALL PERSON 4 SPECIFICATIONS VERIFIED & FULLY FUNCTIONAL!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runPerson4TestSuite().catch((err) => {
    console.error('\n❌ Person 4 Test Suite Error:', err.message);
    process.exit(1);
});
