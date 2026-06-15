# SHIELD Blockchain Deployment Guide

This guide provides instructions for deploying the `ShieldLedger` smart contract to the private EVM blockchain.

## Prerequisites
Ensure the blockchain network is running:
```bash
npm run blockchain:up
```

## Deployment Steps

1. **Compile the Smart Contract**
   Compile the Solidity contract to generate the latest ABI and bytecode:
   ```bash
   npx hardhat compile
   ```

2. **Deploy to the Local Network**
   Run the deployment script against the `localnet` network configured in `hardhat.config.js`:
   ```bash
   npx hardhat run scripts/deploy.js --network localnet
   ```

3. **Configure Environment Variables**
   The deployment script will output the new contract address (e.g., `0x...`).
   Copy this address and set it in your `.env` file at the root of the project:
   ```env
   BLOCKCHAIN_CONTRACT_ADDRESS=0x...
   ```

4. **Restart Application Stack**
   If the `shield-ledger` service is already running, restart it to pick up the new contract address:
   ```bash
   docker compose restart shield-ledger
   ```

## Verification

You can verify the deployment by calling the `shield-ledger` API manually:

**Store Evidence:**
```bash
curl -X POST http://localhost:4002/api/ledger/store \
  -H "Content-Type: application/json" \
  -d '{"evidenceId":"test-123","hash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}'
```

**Retrieve Evidence:**
```bash
curl http://localhost:4002/api/ledger/test-123
```
