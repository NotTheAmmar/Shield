const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'http://node-police:8545';
const CONTRACT_ADDRESS = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;

let provider;
let signer;
let contract;

function getContract() {
    if (contract) return contract;

    if (!CONTRACT_ADDRESS) {
        throw new Error('BLOCKCHAIN_CONTRACT_ADDRESS environment variable is not set');
    }

    try {
        // Initialize provider
        provider = new ethers.JsonRpcProvider(RPC_URL);
        
        // Since we are connecting to a local PoA node (node-police) that has its 
        // accounts unlocked, we can get the first signer directly from the node.
        
        // Note: ethers v6 async getSigner requires await, but for a simple 
        // connection module we'll construct it synchronously if possible, or
        // we'll fetch it lazily. To make it simple and robust, we'll fetch
        // the signer and contract dynamically.

        // Load ABI
        const abiPath = path.join(__dirname, 'abis', 'ShieldLedger.json');
        const contractJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        const abi = contractJson.abi || contractJson; // Handle different artifact formats

        // Create an un-connected contract first
        contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
        
        return contract;
    } catch (err) {
        console.error('[Blockchain] Error initializing contract:', err.message);
        throw err;
    }
}

async function getSignerContract(privateKey) {
    const c = getContract();
    if (privateKey) {
        // Use the user's explicit private key (unique signature)
        const wallet = new ethers.Wallet(privateKey, provider);
        return c.connect(wallet);
    }
    
    // Fallback if no private key provided
    if (!signer) {
        signer = await provider.getSigner();
    }
    return c.connect(signer);
}

// Ensure connection works
async function checkConnection() {
    try {
        const p = provider || new ethers.JsonRpcProvider(RPC_URL);
        const network = await p.getNetwork();
        return { connected: true, chainId: Number(network.chainId) };
    } catch (err) {
        return { connected: false, error: err.message };
    }
}

module.exports = {
    getContract,
    getSignerContract,
    checkConnection
};
