const pool = require('./db');

const LEDGER_SERVICE_URL = process.env.LEDGER_SERVICE_URL || 'http://shield-ledger:4002';
const MASTER_KEY = process.env.MASTER_KEY || 'replace_this_with_a_32_byte_base64_key';

let isProcessing = false;

async function processQueue() {
    if (isProcessing) return false;
    isProcessing = true;
    let processedAny = false;

    try {
        while (true) {
            // Find one user who has not been provisioned on the blockchain
            // Use SKIP LOCKED to ensure atomic, sequential processing without nonce collisions
            const { rows } = await pool.query(`
                SELECT id, blockchain_address, role 
                FROM users 
                WHERE blockchain_provisioned = FALSE 
                AND blockchain_address IS NOT NULL
                ORDER BY created_at ASC
                LIMIT 1 
                FOR UPDATE SKIP LOCKED
            `);

            if (rows.length === 0) {
                break; // No pending users
            }

            const user = rows[0];
            console.log(`[ProvisionWorker] Processing user ${user.id} (${user.blockchain_address})`);

            // Admin does not need blockchain anchoring access, only Police and Judicial roles
            if (user.role.toLowerCase() === 'admin') {
                await pool.query('UPDATE users SET blockchain_provisioned = TRUE WHERE id = $1', [user.id]);
                processedAny = true;
                continue;
            }

            try {
                // Make synchronous HTTP call to Ledger service
                const response = await fetch(`${LEDGER_SERVICE_URL}/api/ledger/grant-anchor-role`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${MASTER_KEY}`
                    },
                    body: JSON.stringify({ address: user.blockchain_address })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Ledger API returned ${response.status}: ${JSON.stringify(errorData)}`);
                }

                // Transaction successfully mined
                await pool.query('UPDATE users SET blockchain_provisioned = TRUE WHERE id = $1', [user.id]);
                console.log(`[ProvisionWorker] Successfully provisioned user ${user.id} on the blockchain.`);
                processedAny = true;
            } catch (err) {
                // Log the error but CONTINUE to the next user instead of blocking the queue
                console.error(`[ProvisionWorker] Failed to provision user ${user.id}:`, err.message);
                // Break out of the loop for this tick — retry all pending users on the next interval
                break;
            }
        }
    } catch (err) {
        // Database-level errors (connection lost, etc.)
        console.error(`[ProvisionWorker] Database error:`, err.message);
    } finally {
        isProcessing = false;
    }

    return processedAny;
}

function startProvisionWorker() {
    console.log('[ProvisionWorker] Started blockchain queue processor (adaptive backoff).');

    const MIN_INTERVAL_MS = 2000;   // 2s — used when queue has work
    const MAX_IDLE_MS     = 60000;  // 60s — max interval when queue is empty
    const MAX_ERROR_MS    = 30000;  // 30s — max interval after DB/network errors

    let currentInterval = MIN_INTERVAL_MS;
    let timeoutHandle = null;

    async function tick() {
        let foundWork = false;
        try {
            // processQueue returns true if it processed at least one user
            foundWork = await processQueue();
            if (foundWork) {
                currentInterval = MIN_INTERVAL_MS; // Reset — keep polling fast while there's a backlog
            } else {
                // Idle: back off exponentially up to MAX_IDLE_MS
                currentInterval = Math.min(currentInterval * 2, MAX_IDLE_MS);
            }
        } catch (err) {
            // Unexpected error outside processQueue's own handler — back off, don't spin
            console.error('[ProvisionWorker] Unexpected tick error:', err.message);
            currentInterval = Math.min(currentInterval * 2, MAX_ERROR_MS);
        }

        timeoutHandle = setTimeout(tick, currentInterval);
    }

    // Kick off
    timeoutHandle = setTimeout(tick, MIN_INTERVAL_MS);
}

module.exports = { startProvisionWorker };
