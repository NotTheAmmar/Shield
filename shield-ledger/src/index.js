const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4002;

app.use(cors());
app.use(express.json());

// ── ImmuDB Connection ──────────────────────────────────────────────────────
const IMMUDB_HOST = process.env.IMMUDB_HOST || 'db-ledger';
const IMMUDB_PORT = parseInt(process.env.IMMUDB_PORT || '3322', 10);
const IMMUDB_USER = process.env.IMMUDB_USER || 'immudb';
const IMMUDB_PASSWORD = process.env.IMMUDB_ADMIN_PASSWORD || 'immudb';
const IMMUDB_DB = process.env.IMMUDB_DB || 'defaultdb';

let ImmudbClient;
try {
    ImmudbClient = require('immudb-node');
} catch (err) {
    console.warn('[Ledger] immudb-node not available, using fallback in-memory store');
}

// In-memory fallback map (used only if ImmuDB connection fails)
const memoryStore = new Map();
let immuClient = null;
let useMemoryFallback = false;

async function connectImmuDB() {
    if (!ImmudbClient) {
        console.warn('[Ledger] No immudb-node module — using in-memory fallback');
        useMemoryFallback = true;
        return;
    }

    try {
        // immudb-node v1.x uses getInstance pattern
        const cl = new ImmudbClient.default({
            host: IMMUDB_HOST,
            port: IMMUDB_PORT,
        });

        await cl.login({ user: IMMUDB_USER, password: IMMUDB_PASSWORD });
        await cl.useDatabase({ databasename: IMMUDB_DB });

        immuClient = cl;
        console.log(`[Ledger] Connected to ImmuDB at ${IMMUDB_HOST}:${IMMUDB_PORT}/${IMMUDB_DB}`);
    } catch (err) {
        console.error(`[Ledger] ImmuDB connection failed: ${err.message}`);
        console.warn('[Ledger] Falling back to in-memory store');
        useMemoryFallback = true;
    }
}

// ── Health Check ───────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.json({ service: 'SHIELD Ledger Service', status: 'running' });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        immudb: immuClient ? 'connected' : (useMemoryFallback ? 'fallback' : 'disconnected'),
        timestamp: new Date(),
    });
});

// ── POST /api/ledger/store ─────────────────────────────────────────────────
// Stores an evidence hash in the immutable ledger.
// Body: { evidenceId: string, hash: string }

app.post('/api/ledger/store', async (req, res) => {
    const { evidenceId, hash } = req.body;

    if (!evidenceId || !hash) {
        return res.status(400).json({ error: 'evidenceId and hash are required' });
    }

    const key = `evidence:${evidenceId}`;

    try {
        if (immuClient && !useMemoryFallback) {
            const result = await immuClient.set({ key, value: hash });
            console.log(`[Ledger] Stored hash for ${evidenceId} (tx: ${result?.id})`);
            return res.json({
                ok: true,
                txId: result?.id?.toString() || 'unknown',
                key,
            });
        }

        // Memory fallback
        memoryStore.set(key, { hash, storedAt: new Date().toISOString() });
        console.log(`[Ledger/Memory] Stored hash for ${evidenceId}`);
        return res.json({
            ok: true,
            txId: `mem_${Date.now()}`,
            key,
            fallback: true,
        });
    } catch (err) {
        console.error(`[Ledger] Store error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to store hash in ledger', details: err.message });
    }
});

// ── GET /api/ledger/:evidenceId ────────────────────────────────────────────
// Retrieves the stored hash for an evidence item.

app.get('/api/ledger/:evidenceId', async (req, res) => {
    const { evidenceId } = req.params;
    const key = `evidence:${evidenceId}`;

    try {
        if (immuClient && !useMemoryFallback) {
            const result = await immuClient.get({ key });
            if (!result || !result.value) {
                return res.status(404).json({ error: 'Hash not found in ledger' });
            }
            return res.json({
                evidenceId,
                hash: result.value.toString(),
                txId: result?.tx?.toString() || 'unknown',
            });
        }

        // Memory fallback
        const entry = memoryStore.get(key);
        if (!entry) {
            return res.status(404).json({ error: 'Hash not found in ledger' });
        }
        return res.json({
            evidenceId,
            hash: entry.hash,
            storedAt: entry.storedAt,
            fallback: true,
        });
    } catch (err) {
        // ImmuDB returns KEY_NOT_FOUND for missing keys
        if (err.message?.includes('key not found')) {
            return res.status(404).json({ error: 'Hash not found in ledger' });
        }
        console.error(`[Ledger] Get error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to retrieve hash from ledger', details: err.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
    console.log(`Ledger Service running on port ${PORT}`);
    await connectImmuDB();
});
