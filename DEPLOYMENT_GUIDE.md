# SHIELD — Complete Deployment Guide

This guide walks you through starting the entire SHIELD stack from a fresh clone to a fully running system. It covers the blockchain network, the application services, database management, and common operations.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Setup](#2-first-time-setup)
3. [Create the Shared Docker Network](#3-create-the-shared-docker-network)
4. [Starting the Blockchain Network](#4-starting-the-blockchain-network)
5. [Deploying the Smart Contract](#5-deploying-the-smart-contract)
6. [Starting the Application Stack](#6-starting-the-application-stack)
7. [Verifying the System](#7-verifying-the-system)
8. [Resetting & Restarting](#8-resetting--restarting)
9. [Running Tests](#9-running-tests)
10. [Command Reference](#10-command-reference)

---

## 1. Prerequisites

Make sure the following tools are installed and available in your `PATH`:

| Tool | Minimum Version | Check Command |
|------|----------------|---------------|
| Docker + Docker Compose | Docker 24+ | `docker --version` |
| Node.js | v18+ | `node --version` |
| npm | v9+ | `npm --version` |

> [!NOTE]
> SHIELD uses **two separate Docker Compose files** that share one Docker network:
> - `docker-compose.blockchain.yml` — The private EVM blockchain (Geth nodes)
> - `docker-compose.yml` — The full application stack (databases, services, frontend)
>
> Because these files are separate, the shared network (`shield_shield-network`) must be **created manually** before starting either compose file. See Step 3.

---

## 2. First-Time Setup

### 2a. Clone & Install Dependencies

```bash
git clone <repo-url>
cd Shield
npm install        # installs Hardhat and root tools
```

### 2b. Configure Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Fill in the required variables. The table below explains each one:

| Variable | How to set it |
|----------|--------------|
| `POSTGRES_USER` | Any username, e.g. `shield` |
| `POSTGRES_PASSWORD` | Any secure password |
| `POSTGRES_DB` | Any database name, e.g. `shield_db` |
| `MINIO_ROOT_USER` | Any username |
| `MINIO_ROOT_PASSWORD` | Any secure password |
| `ADMIN_SEED_EMAIL` | The email of the auto-created admin account |
| `ADMIN_SEED_PASSWORD` | The password for the admin account |
| `ADMIN_SEED_NAME` | Display name, e.g. `"System Administrator"` |
| `ADMIN_SEED_EMPLOYEE_ID` | Employee ID, e.g. `EMP-00000` |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` |
| `MASTER_KEY` | Generate: `openssl rand -base64 32` |
| `BLOCKCHAIN_ENCRYPTION_KEY` | Generate: `openssl rand -base64 32` *(must be exactly 32 bytes / 44 base64 chars)* |
| `BLOCKCHAIN_DEPLOYER_PRIVATE_KEY` | Extract from keystore — see command below |
| `BLOCKCHAIN_FIR_CONTRACT_ADDRESS` | Set this **after Step 5** (smart contract deployment) |
| `BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS` | Set this **after Step 5** (smart contract deployment) |

To extract `BLOCKCHAIN_DEPLOYER_PRIVATE_KEY`, run this once after cloning:

```bash
node -e "
const { ethers } = require('ethers');
const fs = require('fs');
ethers.Wallet.fromEncryptedJson(
  fs.readFileSync('./blockchain/keystore/police-account.json', 'utf8'),
  fs.readFileSync('./blockchain/password.txt', 'utf8').trim()
).then(w => console.log('BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=' + w.privateKey));
"
```

Copy the printed value into your `.env`.

> [!IMPORTANT]
> **These three variables are fixed — copy them exactly from `.env.example`, do NOT change them:**
>
> ```env
> BLOCKCHAIN_POLICE_ADDRESS=0x80de6eF5a945D6Cc1DAd5375E3CeD4DF466e0384
> BLOCKCHAIN_COURT_ADDRESS=0x01a08fc1e3c0EB8d2Be2301Ba36761485d1a2B4e
> BLOCKCHAIN_CHAIN_ID=31337
> ```
>
> These are the Ethereum addresses of the two pre-configured blockchain nodes (`node-police` and `node-court`). They are defined by the keystore files inside `blockchain/keystore/` and are baked into the Clique PoA genesis block (`blockchain/genesis.json`). They will never change unless you regenerate the keystore from scratch.

> [!CAUTION]
> `BLOCKCHAIN_ENCRYPTION_KEY` must be exactly 32 bytes (44 base64 characters). It encrypts every officer's Ethereum private key stored in the database. **Back this up** — losing it makes all stored private keys unrecoverable and breaks evidence uploads.

---

## 3. Create the Shared Docker Network

Both compose files (`docker-compose.yml` and `docker-compose.blockchain.yml`) communicate over a shared Docker network named `shield_shield-network`. Because the blockchain compose declares it as `external: true`, this network must exist **before** either compose file is started.

Create it once with:

```bash
docker network create \
  --label "com.docker.compose.network=shield-network" \
  --label "com.docker.compose.project=shield" \
  --label "com.docker.compose.version=2" \
  shield_shield-network
```

> [!NOTE]
> The labels are required — Docker Compose checks them and refuses to use an unlabelled network. You only need to run this **once per machine**. The network persists across `docker compose down` restarts. Only `docker network rm shield_shield-network` (or a full Docker reset) removes it.

---

## 4. Starting the Blockchain Network

With the shared network in place, start the three blockchain containers:

```bash
docker compose -f docker-compose.blockchain.yml up -d
```

This starts:
- `blockchain-bootnode` — peer discovery
- `node-police` — primary mining/sealing node, RPC on `localhost:8545`
- `node-court` — secondary mining/sealing node, RPC on `localhost:8546`

### Verify the chain is running

```bash
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

A response containing a non-`null` `result` value confirms the chain is producing blocks.

---

## 5. Deploying the Smart Contract

The `ShieldLedger` smart contract must be compiled and deployed to the blockchain **before** the application services start.

### Compile

```bash
npx hardhat compile
```

This compiles `contracts/ShieldLedger.sol` and automatically exports the ABI to `shield-ledger/src/abis/ShieldLedger.json`.

### Deploy to the private chain

```bash
npx hardhat run scripts/deploy.js --network localnet
```

The script will print the deployed contract addresses:
```
FIRLedger deployed to: 0x...
EvidenceLedger deployed to: 0x...
```

### Update `.env`

Set `BLOCKCHAIN_FIR_CONTRACT_ADDRESS` and `BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS` to the addresses printed above:

```env
BLOCKCHAIN_FIR_CONTRACT_ADDRESS=0x<address-from-above>
BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS=0x<address-from-above>
```

> [!NOTE]
> Unlike the police/court addresses, these addresses **change every time you deploy**. If you reset the blockchain (Step 8), you must redeploy and update this value again before restarting the app stack.

---

## 6. Starting the Application Stack

```bash
docker compose up -d --build
```

This starts all services:

| Container | Role | Port |
|-----------|------|------|
| `db-users` | PostgreSQL (users, FIRs, audit log) | 5432 |
| `minio-store` | Object storage (evidence files) | 9000 / 9001 |
| `shield-auth` | Authentication & user management | 4000 |
| `shield-evidence` | Evidence upload & verification | 4001 |
| `shield-ledger` | Blockchain bridge | 4002 |
| `shield-watchdog` | Periodic integrity scanner | — |
| `shield-gateway` | API gateway / reverse proxy | 3001 |
| `shield-frontend` | React web interface | 3000 |
| `nginx` | Edge reverse proxy | 80 |

### Verify all services are up

```bash
docker compose ps
```

### Access the application

| URL | What it is |
|-----|-----------|
| http://localhost | Web UI (via nginx, recommended) |
| http://localhost:3000 | Web UI (direct Vite dev server) |
| http://localhost:3001 | API Gateway |
| http://localhost:9001 | MinIO console (file storage admin) |

Log in with the `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` you set in `.env`.

---

## 7. Verifying the System

Run the full integration test suite:

```bash
node tests/integration/shield_comprehensive_test.js
```

All 69 tests should pass if both the blockchain network and application stack are running correctly.

---

## 8. Resetting & Restarting

### Restart a single application service

```bash
docker compose restart shield-ledger
docker compose restart shield-auth
docker compose restart shield-evidence
```

### Restart the entire application stack (preserves all data)

```bash
docker compose down
docker compose up -d
```

### Restart a single blockchain node

```bash
docker compose -f docker-compose.blockchain.yml restart node-police
docker compose -f docker-compose.blockchain.yml restart node-court
```

---

### Reset the Application Database ⚠️ Destructive

This permanently deletes all users, FIRs, evidence records, and audit logs. Chain-of-custody data on the blockchain is **not** affected.

```bash
# 1. Stop the app stack
docker compose down

# 2. Delete the Postgres data volume
rm -rf .docker-data/postgres

# 3. Restart — schema and admin seed account are recreated automatically
docker compose up -d
```

---

### Reset the Blockchain ⚠️ Destructive

This permanently deletes all on-chain transaction history. Any evidence hashes anchored on-chain will be lost.

> [!CAUTION]
> After resetting the blockchain, you must **re-deploy the smart contracts** (Step 5) and **update `BLOCKCHAIN_FIR_CONTRACT_ADDRESS` and `BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS`** in your `.env` before restarting the app stack. Evidence that was verified against the old chain will fail re-verification.

```bash
# 1. Stop the blockchain
docker compose -f docker-compose.blockchain.yml down

# 2. Delete the chain state for both nodes
rm -rf .docker-data/geth-police
rm -rf .docker-data/geth-court

# 3. Restart — nodes re-initialize from genesis.json automatically
docker compose -f docker-compose.blockchain.yml up -d

# 4. Re-deploy the contract and update BLOCKCHAIN_FIR_CONTRACT_ADDRESS and BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS in .env
npx hardhat run scripts/deploy.js --network localnet

# 5. Restart the app stack to pick up the new contract address
docker compose down
docker compose up -d
```

---

### Full Reset (Everything) ⚠️ Destructive

Wipes the database, blockchain, and all uploaded evidence files.

```bash
# 1. Stop everything
docker compose down
docker compose -f docker-compose.blockchain.yml down

# 2. Delete all persistent data
rm -rf .docker-data/

# 3. Recreate the shared network with the required Compose labels
docker network create \
  --label "com.docker.compose.network=shield-network" \
  --label "com.docker.compose.project=shield" \
  --label "com.docker.compose.version=2" \
  shield_shield-network

# 4. Start blockchain first, then deploy contract
docker compose -f docker-compose.blockchain.yml up -d
npx hardhat run scripts/deploy.js --network localnet
# → Copy the printed addresses and set them in .env

# 5. Start the application stack
docker compose up -d --build
```

---

## 9. Running Tests

| Command | Description |
|---------|-------------|
| `npm run test:comprehensive` | Full end-to-end integration suite (69 tests) |
| `npm run test:integration` | Alternate integration test set |
| `npm run test:contract` | Solidity unit tests (Hardhat in-process EVM) |
| `npm run test:blockchain` | Blockchain network connectivity tests |
| `npm run test:tamper` | Evidence tampering simulation |
| `npm run test:manual` | Manual API tests via bash script |
| `npm run seed` | Seed the database with mock data |

---

## 10. Command Reference

### Shared Network

| Command | Description |
|---------|-------------|
| `docker network create --label "com.docker.compose.network=shield-network" --label "com.docker.compose.project=shield" --label "com.docker.compose.version=2" shield_shield-network` | Create the shared network (once per machine, before anything else) |
| `docker network rm shield_shield-network` | Remove it (only if doing a full tear-down) |

### Blockchain Stack

| Command | Description |
|---------|-------------|
| `docker compose -f docker-compose.blockchain.yml up -d` | Start the blockchain network |
| `docker compose -f docker-compose.blockchain.yml down` | Stop the blockchain network |
| `docker compose -f docker-compose.blockchain.yml ps` | Check node status |
| `docker compose -f docker-compose.blockchain.yml logs -f node-police` | Tail police node logs |
| `npx hardhat compile` | Compile contracts + export ABI |
| `npx hardhat run scripts/deploy.js --network localnet` | Deploy contract to private chain |
| `npm run test:contract` | Run Solidity unit tests |

### Application Stack

| Command | Description |
|---------|-------------|
| `docker compose up -d --build` | Start all services (rebuild images) |
| `docker compose up -d` | Start all services (use existing images) |
| `docker compose down` | Stop all services (preserve data) |
| `docker compose ps` | Check service status |
| `docker compose logs -f <service>` | Tail logs for a service |
| `docker compose restart <service>` | Restart a single service |
| `docker compose exec db-users psql -U shield -d shield_db` | Open a PostgreSQL shell |

### Key Generation

```bash
# Generate a 32-byte base64 key (for JWT_SECRET, MASTER_KEY, BLOCKCHAIN_ENCRYPTION_KEY)
openssl rand -base64 32
```

---

## Architecture Overview

```
                   Internet
                      │
                  nginx (:80)
                      │
            shield-gateway (:3001)
           ┌──────────┴──────────┐
       shield-auth          shield-evidence
       (:4000)                  (:4001)
           │                      │
        db-users             minio-store
      (PostgreSQL)           (S3 storage)
                                  │
                          shield-ledger (:4002)
                                  │
                    Private EVM Blockchain
               ┌──────────────────────────┐
               │  blockchain-bootnode      │  ← peer discovery
               │  node-police  (:8545)     │  ← shield-ledger connects here
               │  node-court   (:8546)     │  ← secondary sealing node
               └──────────────────────────┘

shield-watchdog  — periodically verifies all evidence hashes against the chain
shield-frontend  — React UI served on port 3000
```

### Correct Startup Order (First Time)

```
1. docker network create shield_shield-network
2. docker compose -f docker-compose.blockchain.yml up -d
3. npx hardhat compile && npx hardhat run scripts/deploy.js --network localnet
4. (set BLOCKCHAIN_FIR_CONTRACT_ADDRESS and BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS in .env)
5. docker compose up -d --build
```
