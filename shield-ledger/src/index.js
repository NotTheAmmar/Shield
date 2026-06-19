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
// Grants the EVIDENCE_ANCHOR_ROLE to a newly provisioned user wallet.
app.post('/api/ledger/grant-anchor-role', internalNetworkGuard, async (req, res) => {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ error: 'Valid Ethereum address is required' });
    }

    try {
        console.log(`[Ledger] Granting EVIDENCE_ANCHOR_ROLE to ${address}...`);
        const adminKey = process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY;
        if (!adminKey) throw new Error("Missing BLOCKCHAIN_DEPLOYER_PRIVATE_KEY");

        const contract = await getSignerContract(adminKey);
        
        const EVIDENCE_ANCHOR_ROLE = ethers.id("EVIDENCE_ANCHOR_ROLE");

        // grantRole(bytes32 role, address account)
        const tx = await contract.grantRole(EVIDENCE_ANCHOR_ROLE, address, { gasPrice: 0 });
        console.log(`[Ledger] Grant role TX submitted: ${tx.hash}, waiting...`);
        
        await tx.wait();
        console.log(`[Ledger] Role granted successfully to ${address}`);
        
        return res.json({ ok: true, address, role: 'EVIDENCE_ANCHOR_ROLE' });
    } catch (err) {
        console.error(`[Ledger] Grant role error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to grant role', details: err.message });
    }
});

// ── POST /api/ledger/store ─────────────────────────────────────────────────
// Stores an evidence hash in the immutable ledger.
// Body: { evidenceId: string, hash: string }

app.post('/api/ledger/store', async (req, res) => {
    const { evidenceId, hash, privateKey } = req.body;

    if (!evidenceId || !hash) {
        return res.status(400).json({ error: 'evidenceId and hash are required' });
    }

    try {
        console.log(`[Ledger] Anchoring hash for ${evidenceId}...`);
        const contract = await getSignerContract(privateKey);
        
        // anchorEvidence(string evidenceId, string sha256Hash)
        // Explicitly set gasPrice to 0 as node-police operates without gas fees
        const tx = await contract.anchorEvidence(evidenceId, hash, { gasPrice: 0 });
        console.log(`[Ledger] TX submitted: ${tx.hash}, waiting for confirmation...`);
        
        const receipt = await tx.wait();
        console.log(`[Ledger] Stored hash for ${evidenceId} (tx: ${receipt.hash})`);
        
        return res.json({
            ok: true,
            txId: receipt.hash,
            key: `evidence:${evidenceId}`,
        });
    } catch (err) {
        console.error(`[Ledger] Store error: ${err.message}`);
        // Handle custom contract reverts
        if (err.message.includes("already anchored")) {
            return res.status(409).json({ error: 'Evidence ID already anchored on ledger' });
        }
        return res.status(500).json({ error: 'Failed to store hash in ledger', details: err.message });
    }
});

// ── GET /api/ledger/:evidenceId ────────────────────────────────────────────
// Retrieves the stored hash for an evidence item.

app.get('/api/ledger/:evidenceId', async (req, res) => {
    const { evidenceId } = req.params;

    try {
        const contract = getContract();
        
        // getEvidence returns (string sha256Hash, uint256 blockTimestamp, address registeredBy)
        const [sha256Hash, blockTimestamp, registeredBy] = await contract.getEvidence(evidenceId);
        
        return res.json({
            evidenceId,
            hash: sha256Hash,
            registeredBy,
            timestamp: Number(blockTimestamp), // Convert BigInt to JS Number
        });
    } catch (err) {
        // Contract reverts if record is not found (blockTimestamp == 0) or if the contract has no code yet (decoding fails)
        if (err.message.includes("Evidence record not found") || 
            err.message.includes("revert") || 
            err.code === 'BAD_DATA' || 
            err.message.includes("could not decode result data")) {
            return res.status(404).json({ error: 'Hash not found in ledger' });
        }
        console.error(`[Ledger] Get error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to retrieve hash from ledger', details: err.message });
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
