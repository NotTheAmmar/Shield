const pool = require('./db');

const LEDGER_SERVICE_URL = process.env.LEDGER_SERVICE_URL || 'http://shield-ledger:4002';
const MASTER_KEY = process.env.MASTER_KEY || 'replace_this_with_a_32_byte_base64_key';

let isProcessing = false;

async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

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
                continue;
            }

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
        }
    } catch (err) {
        console.error(`[ProvisionWorker] Failed to process user:`, err.message);
        // We do not set blockchain_provisioned to TRUE, so it will retry on the next loop
    } finally {
        isProcessing = false;
    }
}

function startProvisionWorker() {
    console.log('[ProvisionWorker] Started blockchain queue processor.');
    // Run every 2 seconds to ensure fast provisioning
    setInterval(processQueue, 2000);
}

module.exports = { startProvisionWorker };

