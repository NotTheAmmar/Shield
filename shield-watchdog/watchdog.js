/**
 * SHIELD Integrity Watchdog — Automated Scheduler
 * Runs inside Docker, verifies ALL evidence integrity against the ImmuDB ledger
 * every INTERVAL_MINUTES (default: 30 minutes).
 */

const INTERVAL_MINUTES = parseInt(process.env.WATCHDOG_INTERVAL || '30', 10);
const API_BASE_URL = 'http://shield-evidence:4001/api/evidence/internal';
const INTERNAL_SERVICE_KEY = process.env.MASTER_KEY;

const chunkArray = (array, size) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

async function runVerification() {
    const startTime = new Date();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🛡️  SHIELD Watchdog — Integrity Scan Started`);
    console.log(`   Time: ${startTime.toISOString()}`);
    console.log(`${'═'.repeat(60)}`);

    let hasErrors = false;
    let totalOK = 0;
    let totalTampered = 0;
    let totalErrors = 0;

    try {
        let cursorDate = '';
        let cursorId = '';
        const limit = 1000;

        while (true) {
            const url = cursorDate && cursorId
                ? `${API_BASE_URL}/list?limit=${limit}&cursor_date=${encodeURIComponent(cursorDate)}&cursor_id=${encodeURIComponent(cursorId)}`
                : `${API_BASE_URL}/list?limit=${limit}`;

            const listResponse = await fetch(url, {
                method: 'GET',
                headers: { 'x-internal-service-key': INTERNAL_SERVICE_KEY }
            });

            if (!listResponse.ok) throw new Error(`List API returned ${listResponse.status}`);

            const listData = await listResponse.json();
            const records = listData.records || [];

            if (records.length === 0) break;

            const allIds = records.map(r => r.id);
            const batches = chunkArray(allIds, 50);

            for (const batch of batches) {
                try {
                    const verifyResponse = await fetch(`${API_BASE_URL}/verify-batch`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-internal-service-key': INTERNAL_SERVICE_KEY
                        },
                        body: JSON.stringify({ ids: batch })
                    });

                    if (!verifyResponse.ok) throw new Error(`Batch verify returned ${verifyResponse.status}`);

                    const resultData = await verifyResponse.json();

                    for (const [evidenceId, report] of Object.entries(resultData.results)) {
                        if (report.status === 'OK') {
                            totalOK++;
                        } else {
                            totalTampered++;
                            hasErrors = true;
                            console.error(`🚨 TAMPER ALERT: Evidence ${evidenceId} — ${JSON.stringify(report)}`);
                        }
                    }
                } catch (err) {
                    totalErrors++;
                    hasErrors = true;
                    console.error(`❌ Batch error: ${err.message}`);
                }
            }

            const lastRecord = records[records.length - 1];
            cursorDate = lastRecord.uploaded_at;
            cursorId = lastRecord.id;
        }

        const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
        console.log(`\n📊 Scan Complete in ${elapsed}s`);
        console.log(`   ✅ Verified: ${totalOK}  |  🚨 Tampered: ${totalTampered}  |  ❌ Errors: ${totalErrors}`);

        if (!hasErrors) {
            console.log(`   🟢 ALL EVIDENCE INTEGRITY CONFIRMED`);
        } else {
            console.log(`   🔴 INTEGRITY VIOLATIONS DETECTED`);
        }

    } catch (err) {
        console.error(`❌ Watchdog Fatal Error: ${err.message}`);
    }
}

// ── Scheduler ─────────────────────────────────────────────────────────────

async function start() {
    console.log(`🛡️  SHIELD Watchdog Container Started`);
    console.log(`   Scan interval: Every ${INTERVAL_MINUTES} minutes`);
    console.log(`   Target: ${API_BASE_URL}`);

    // Wait 15 seconds for other services to boot
    await new Promise(r => setTimeout(r, 15000));

    // Run immediately on startup
    await runVerification();

    // Then schedule on interval
    setInterval(runVerification, INTERVAL_MINUTES * 60 * 1000);
}

start();
