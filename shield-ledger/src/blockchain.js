const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://node-police:8545';
const FIR_CONTRACT_ADDRESS = process.env.FIR_CONTRACT_ADDRESS;
const EVIDENCE_CONTRACT_ADDRESS = process.env.EVIDENCE_CONTRACT_ADDRESS;

let provider;
let signer;
let firContract;
let evidenceContract;

function initProvider() {
    if (!provider) {
        provider = new ethers.JsonRpcProvider(RPC_URL);
    }
    return provider;
}

function getFIRContract() {
    if (firContract) return firContract;

    if (!FIR_CONTRACT_ADDRESS) {
        throw new Error('FIR_CONTRACT_ADDRESS environment variable is not set');
    }

    try {
        initProvider();
        const abiPath = path.join(__dirname, 'abis', 'FIRLedger.json');
        const contractJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        const abi = contractJson.abi || contractJson;
        firContract = new ethers.Contract(FIR_CONTRACT_ADDRESS, abi, provider);
        return firContract;
    } catch (err) {
        console.error('[Blockchain] Error initializing FIR contract:', err.message);
        throw err;
    }
}

function getEvidenceContract() {
    if (evidenceContract) return evidenceContract;

    if (!EVIDENCE_CONTRACT_ADDRESS) {
        throw new Error('EVIDENCE_CONTRACT_ADDRESS environment variable is not set');
    }

    try {
        initProvider();
        const abiPath = path.join(__dirname, 'abis', 'EvidenceLedger.json');
        const contractJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        const abi = contractJson.abi || contractJson;
        evidenceContract = new ethers.Contract(EVIDENCE_CONTRACT_ADDRESS, abi, provider);
        return evidenceContract;
    } catch (err) {
        console.error('[Blockchain] Error initializing Evidence contract:', err.message);
        throw err;
    }
}

async function getSignerFIRContract(privateKey) {
    const c = getFIRContract();
    if (privateKey) {
        const wallet = new ethers.Wallet(privateKey, provider);
        return c.connect(wallet);
    }
    if (!signer) signer = await provider.getSigner();
    return c.connect(signer);
}

async function getSignerEvidenceContract(privateKey) {
    const c = getEvidenceContract();
    if (privateKey) {
        const wallet = new ethers.Wallet(privateKey, provider);
        return c.connect(wallet);
    }
    if (!signer) signer = await provider.getSigner();
    return c.connect(signer);
}

// Ensure connection works
async function checkConnection() {
    try {
        const p = initProvider();
        const network = await p.getNetwork();
        return { connected: true, chainId: Number(network.chainId) };
    } catch (err) {
        return { connected: false, error: err.message };
    }
}

module.exports = {
    getFIRContract,
    getEvidenceContract,
    getSignerFIRContract,
    getSignerEvidenceContract,
    checkConnection
};
