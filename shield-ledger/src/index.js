const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { getContract, getSignerContract, checkConnection } = require('./blockchain');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 4002;

app.use(cors());
app.use(express.json());

// ── Health Check ───────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.json({ service: 'SHIELD Ledger Service', status: 'running' });
});

app.get('/health', async (req, res) => {
    const status = await checkConnection();
    res.json({
        status: 'OK',
        blockchain: status.connected ? 'connected' : 'disconnected',
        chainId: status.chainId,
        timestamp: new Date(),
    });
});

// ── Internal Network Guard ──────────────────────────────────────────────────
const internalNetworkGuard = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.MASTER_KEY}`) {
        return res.status(403).json({ error: 'Forbidden: Internal Master Key Required' });
    }
    next();
};

// ── POST /api/ledger/grant-anchor-role ─────────────────────────────────────
// Grants the ANCHOR_ROLE to a newly provisioned user wallet.
app.post('/api/ledger/grant-anchor-role', internalNetworkGuard, async (req, res) => {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ error: 'Valid Ethereum address is required' });
    }

    try {
        console.log(`[Ledger] Granting ANCHOR_ROLE to ${address}...`);
        const adminKey = process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY;
        if (!adminKey) throw new Error("Missing BLOCKCHAIN_DEPLOYER_PRIVATE_KEY");

        const contract = await getSignerContract(adminKey);
        
        const ANCHOR_ROLE = ethers.id("ANCHOR_ROLE");

        // grantRole(bytes32 role, address account)
        const tx = await contract.grantRole(ANCHOR_ROLE, address, { gasPrice: 0 });
        console.log(`[Ledger] Grant role TX submitted: ${tx.hash}, waiting...`);
        
        await tx.wait();
        console.log(`[Ledger] Role granted successfully to ${address}`);
        
        return res.json({ ok: true, address, role: 'ANCHOR_ROLE' });
    } catch (err) {
        console.error(`[Ledger] Grant role error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to grant role', details: err.message });
    }
});

// ── POST /api/ledger/store/fir ─────────────────────────────────────────────
// Stores an FIR hash in the immutable ledger.
// Body: { firId: string, hash: string, privateKey: string }
app.post('/api/ledger/store/fir', async (req, res) => {
    const { firId, hash, privateKey } = req.body;

    if (!firId || !hash) return res.status(400).json({ error: 'firId and hash are required' });

    try {
        console.log(`[Ledger] Anchoring hash for FIR ${firId}...`);
        const contract = await getSignerContract(privateKey);
        
        const tx = await contract.anchorFIR(firId, hash, { gasPrice: 0 });
        const receipt = await tx.wait();
        
        return res.json({ ok: true, txId: receipt.hash, key: `fir:${firId}` });
    } catch (err) {
        if (err.message.includes("already anchored")) {
            return res.status(409).json({ error: 'FIR ID already anchored on ledger' });
        }
        return res.status(500).json({ error: 'Failed to store FIR in ledger', details: err.message });
    }
});

// ── POST /api/ledger/store/evidence ────────────────────────────────────────
// Stores an evidence hash in the immutable ledger linked to an FIR.
// Body: { evidenceId: string, firId: string, hash: string, privateKey: string }
app.post('/api/ledger/store/evidence', async (req, res) => {
    const { evidenceId, firId, hash, privateKey } = req.body;

    if (!evidenceId || !firId || !hash) return res.status(400).json({ error: 'evidenceId, firId, and hash are required' });

    try {
        console.log(`[Ledger] Anchoring hash for Evidence ${evidenceId}...`);
        const contract = await getSignerContract(privateKey);
        
        const tx = await contract.anchorEvidence(evidenceId, firId, hash, { gasPrice: 0 });
        const receipt = await tx.wait();
        
        return res.json({ ok: true, txId: receipt.hash, key: `evidence:${evidenceId}` });
    } catch (err) {
        if (err.message.includes("already anchored")) {
            return res.status(409).json({ error: 'Evidence ID already anchored on ledger' });
        }
        return res.status(500).json({ error: 'Failed to store Evidence in ledger', details: err.message });
    }
});

// ── GET /api/ledger/fir/:firId ─────────────────────────────────────────────
// Retrieves the stored hash for an FIR.
app.get('/api/ledger/fir/:firId', async (req, res) => {
    try {
        const contract = getContract();
        const [sha256Hash, blockTimestamp, registeredBy] = await contract.getFIR(req.params.firId);
        
        return res.json({ firId: req.params.firId, hash: sha256Hash, registeredBy, timestamp: Number(blockTimestamp) });
    } catch (err) {
        if (err.message.includes("not found") || err.message.includes("revert") || err.code === 'BAD_DATA') {
            return res.status(404).json({ error: 'FIR hash not found in ledger' });
        }
        return res.status(500).json({ error: 'Failed to retrieve FIR hash', details: err.message });
    }
});

// ── GET /api/ledger/evidence/:evidenceId ───────────────────────────────────
// Retrieves the stored hash and FIR link for an evidence item.
app.get('/api/ledger/evidence/:evidenceId', async (req, res) => {
    try {
        const contract = getContract();
        const [sha256Hash, firId, blockTimestamp, registeredBy] = await contract.getEvidence(req.params.evidenceId);
        
        return res.json({ evidenceId: req.params.evidenceId, firId, hash: sha256Hash, registeredBy, timestamp: Number(blockTimestamp) });
    } catch (err) {
        if (err.message.includes("not found") || err.message.includes("revert") || err.code === 'BAD_DATA') {
            return res.status(404).json({ error: 'Evidence hash not found in ledger' });
        }
        return res.status(500).json({ error: 'Failed to retrieve Evidence hash', details: err.message });
    }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
    console.log(`Ledger Service running on port ${PORT}`);
    const status = await checkConnection();
    if (status.connected) {
        console.log(`[Ledger] Connected to EVM blockchain (Chain ID: ${status.chainId})`);
    } else {
        console.warn(`[Ledger] Failed to connect to blockchain: ${status.error}`);
    }
});
