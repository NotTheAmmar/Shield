require('./shield-evidence/node_modules/dotenv').config({ path: './shield-evidence/.env' });

// Configuration from environment variables
const API_BASE_URL = 'http://localhost:4001/api/evidence/internal';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'shield_worker_key_2026';

// Helper function to chunk array
const chunkArray = (array, size) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

async function main() {
    console.log("🛡️  Starting SHIELD Integrity Watchdog (Ledger-Backed Verifier)...");

    let hasErrors = false;

    try {
        // 1. Fetch the list of IDs from the internal API in batches
        // This enforces microservice boundaries and prevents OOM crashes
        let cursorDate = '';
        let cursorId = '';
        const limit = 1000;
        let totalRecordsProcessed = 0;

        console.log(`🔍 Starting keyset paginated hash verification via Ledger API...`);
        console.log("--------------------------------------------------");

        while (true) {
            const url = cursorDate && cursorId
                ? `${API_BASE_URL}/list?limit=${limit}&cursor_date=${encodeURIComponent(cursorDate)}&cursor_id=${encodeURIComponent(cursorId)}`
                : `${API_BASE_URL}/list?limit=${limit}`;

            const listResponse = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-internal-service-key': INTERNAL_SERVICE_KEY
                }
            });

            if (!listResponse.ok) {
                throw new Error(`Failed to fetch evidence list: ${listResponse.status}`);
            }

            const listData = await listResponse.json();
            const records = listData.records || [];

            if (records.length === 0) {
                if (totalRecordsProcessed === 0) {
                    console.log("ℹ️  No evidence records found. Exiting.");
                    process.exit(0);
                }
                break; // We've processed all records
            }

            totalRecordsProcessed += records.length;

            // 2. Extract IDs and split into sub-batches of 50 to prevent DDoS lockups
            const allIds = records.map(r => r.id);
            const batches = chunkArray(allIds, 50);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];

                try {
                    const verifyResponse = await fetch(`${API_BASE_URL}/verify-batch`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-internal-service-key': INTERNAL_SERVICE_KEY
                        },
                        body: JSON.stringify({ ids: batch })
                    });

                    if (!verifyResponse.ok) {
                        throw new Error(`Batch verification failed with status ${verifyResponse.status}`);
                    }

                    const resultData = await verifyResponse.json();
                    const results = resultData.results;

                    for (const [evidenceId, report] of Object.entries(results)) {
                        if (report.status === 'OK') {
                            console.log(`✅ INTEGRITY VERIFIED: Evidence UUID '${evidenceId}'`);
                        } else {
                            console.error(`🚨 TAMPER ALERT [MISMATCH / ERROR]: Evidence UUID '${evidenceId}'`);
                            console.error(`   Details: ${JSON.stringify(report)}`);
                            hasErrors = true;
                        }
                    }

                } catch (err) {
                    console.error(`❌ Network error verifying batch:`, err.message);
                    hasErrors = true;
                }
            }

            // Advance cursor to the very last record processed in this batch
            const lastRecord = records[records.length - 1];
            cursorDate = lastRecord.uploaded_at;
            cursorId = lastRecord.id;
        }

        console.log("--------------------------------------------------");
        if (hasErrors) {
            console.error("❌ Integrity verification completed with ERRORS or TAMPERING detected.");
            process.exitCode = 1;
        } else {
            console.log("✅ All evidence files successfully verified against the immutable ledger.");
        }

    } catch (err) {
        if (err.cause && err.cause.code === 'ECONNREFUSED') {
            console.error("❌ Error: Connection Refused. It looks like the API server is not running!");
            console.log(`   Attempted to connect to: ${API_BASE_URL}`);
        } else {
            console.error("❌ Fatal Worker Error:", err.message);
        }
        process.exitCode = 1;
    }
}

main();
