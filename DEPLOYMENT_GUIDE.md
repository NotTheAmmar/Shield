# SHIELD — Complete Deployment Guide

This guide walks you through starting the entire SHIELD stack from a fresh clone to a fully running system. It covers the blockchain network, the application services, database management, and common operations.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Setup](#2-first-time-setup)
3. [Starting the Blockchain Network](#3-starting-the-blockchain-network)
4. [Deploying the Smart Contract](#4-deploying-the-smart-contract)
5. [Starting the Application Stack](#5-starting-the-application-stack)
6. [Verifying the System](#6-verifying-the-system)
7. [Resetting & Restarting](#7-resetting--restarting)
8. [Running Tests](#8-running-tests)
9. [Command Reference](#9-command-reference)

---

## 1. Prerequisites

Make sure the following tools are installed and available in your `PATH`:

| Tool | Minimum Version | Check Command |
|------|----------------|---------------|
| Docker + Docker Compose | Docker 24+ | `docker --version` |
| Node.js | v18+ | `node --version` |
| npm | v9+ | `npm --version` |

> [!NOTE]
> The project uses two separate Docker Compose files:
> - `docker-compose.blockchain.yml` — The private EVM blockchain network (Geth nodes)
> - `docker-compose.yml` — The full application stack (databases, services, frontend)
>
> They share a Docker network called `shield_shield-network`. **The blockchain must be started before the app stack.**

---

## 2. First-Time Setup

### 2a. Clone & Install Dependencies

```bash
git clone <repo-url>
cd Shield
npm install        # installs Hardhat and root tools
```

### 2b. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the required variables:

```env
# Database
POSTGRES_USER=shield
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=shield_db

# MinIO Object Storage
MINIO_ROOT_USER=shield
MINIO_ROOT_PASSWORD=your_secure_password

# Admin seed account (created automatically on first startup)
ADMIN_SEED_EMAIL=admin@shield.gov.in
ADMIN_SEED_PASSWORD=YourSecureAdminPassword!
ADMIN_SEED_NAME="System Administrator"
ADMIN_SEED_EMPLOYEE_ID=EMP-00000

# Auth & Encryption — generate with: openssl rand -base64 32
JWT_SECRET=<run: openssl rand -base64 32>
MASTER_KEY=<run: openssl rand -base64 32>

# AES-256-GCM key for encrypting officer blockchain private keys
# Must be exactly 32 bytes (44 base64 chars). Generate with: openssl rand -base64 32
BLOCKCHAIN_ENCRYPTION_KEY=<run: openssl rand -base64 32>

# Blockchain — set AFTER deploying the contract (Step 4)
BLOCKCHAIN_CONTRACT_ADDRESS=0x...
```

> [!IMPORTANT]
> `BLOCKCHAIN_ENCRYPTION_KEY` must be exactly 32 bytes (44 base64 characters). It is used to encrypt every officer's Ethereum private key. **Keep this secret and back it up** — losing it makes all stored keys unrecoverable.

---

## 3. Starting the Blockchain Network

The private EVM blockchain consists of a bootnode and two mining nodes (`node-police`, `node-court`). It runs independently from the application stack.

### Start the blockchain

```bash
docker compose -f docker-compose.blockchain.yml up -d
```

Or using the npm shorthand (also compiles the contract):

```bash
npm run blockchain:up
```

### Verify it's running

```bash
docker compose -f docker-compose.blockchain.yml ps
```

You should see three containers running:
- `blockchain-bootnode` — peer discovery
- `node-police` — primary mining node, RPC exposed on `localhost:8545`
- `node-court` — secondary mining node, RPC exposed on `localhost:8546`

### Check connectivity

```bash
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

A valid response with an incrementing block number confirms the chain is mining.

---

## 4. Deploying the Smart Contract

> [!NOTE]
> Skip this step if you are using the pre-deployed contract address (`0x110dc3e9304dd982F565aDa1343F746898941181`) which is already baked into the genesis block. Only re-deploy if you modify `contracts/ShieldLedger.sol`.

### Compile the contract

```bash
npx hardhat compile
```

This compiles `ShieldLedger.sol` and automatically exports the ABI to `shield-ledger/src/abis/ShieldLedger.json`.

### Deploy to the local blockchain

```bash
npx hardhat run scripts/deploy.js --network localnet
```

The output will print the new contract address:
```
ShieldLedger deployed to: 0x...
```

### Update your .env

```env
BLOCKCHAIN_CONTRACT_ADDRESS=0x<address-from-above>
```

### Run contract tests (optional)

```bash
npm run test:contract
```

---

## 5. Starting the Application Stack

The application stack requires the blockchain to already be running (Step 3).

### Start everything

```bash
docker compose up -d --build
```

This starts all services in order:
- `db-users` — PostgreSQL (user accounts)
- `minio-store` — Object storage (evidence files)
- `shield-auth` — Authentication & user management (port 4000)
- `shield-evidence` — Evidence upload & verification (port 4001)
- `shield-ledger` — Blockchain bridge (port 4002)
- `shield-watchdog` — Periodic integrity scanner
- `shield-gateway` — API gateway / reverse proxy (port 3001)
- `shield-frontend` — React web interface (port 3000)
- `nginx` — Edge reverse proxy (port 80)

### Verify all services are up

```bash
docker compose ps
```

All containers should show `Up`. Check logs for any errors:

```bash
docker compose logs --tail=20 shield-auth shield-ledger shield-evidence
```

### Access the application

- **Web UI**: http://localhost (via nginx) or http://localhost:3000 (direct)
- **API Gateway**: http://localhost:3001
- **MinIO Console**: http://localhost:9001

Default admin credentials (set in `.env`):
- Email: `ADMIN_SEED_EMAIL`
- Password: `ADMIN_SEED_PASSWORD`

---

## 6. Verifying the System

### Run the comprehensive integration test suite

```bash
node tests/integration/shield_comprehensive_test.js
```

All 69 tests should pass if both the blockchain and application stack are running correctly.

### Manually test the ledger

```bash
# Store a hash
curl -X POST http://localhost:4002/api/ledger/store \
  -H "Content-Type: application/json" \
  -d '{"evidenceId":"test-123","hash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","privateKey":"0x<officer-private-key>"}'

# Retrieve it
curl http://localhost:4002/api/ledger/test-123
```

---

## 7. Resetting & Restarting

### Restart a specific service (e.g., after a config change)

```bash
docker compose restart shield-ledger
docker compose restart shield-auth
docker compose restart shield-evidence
```

### Restart the entire application stack (without losing data)

```bash
docker compose down
docker compose up -d
```

### Restart a single blockchain node

```bash
docker compose -f docker-compose.blockchain.yml restart node-police
docker compose -f docker-compose.blockchain.yml restart node-court
```

### Stop the entire blockchain network

```bash
docker compose -f docker-compose.blockchain.yml down
```

---

### Resetting the Database (⚠ Destructive)

This will **permanently delete all users, FIRs, evidence records, and audit logs**. The database volume is stored in `.docker-data/postgres/`.

```bash
# 1. Stop the app stack
docker compose down

# 2. Delete the database volume
rm -rf .docker-data/postgres

# 3. Restart — the schema and admin seed will be recreated automatically
docker compose up -d
```

---

### Resetting the Blockchain (⚠ Destructive)

This will **permanently delete all on-chain transaction history**. The chain state is stored in `.docker-data/geth-police/` and `.docker-data/geth-court/`.

> [!CAUTION]
> If you reset the blockchain, **any evidence hashes already anchored on-chain are lost**. Evidence verification against the old chain will fail. Only reset during development.

```bash
# 1. Stop the blockchain network
docker compose -f docker-compose.blockchain.yml down

# 2. Delete the blockchain data directories
rm -rf .docker-data/geth-police
rm -rf .docker-data/geth-court

# 3. Restart — nodes will re-initialize from genesis.json
docker compose -f docker-compose.blockchain.yml up -d
```

### Full Reset (Database + Blockchain + MinIO)

```bash
# Stop everything
docker compose down
docker compose -f docker-compose.blockchain.yml down

# Delete all persistent data
rm -rf .docker-data/

# Restart blockchain first, then app stack
docker compose -f docker-compose.blockchain.yml up -d
# Wait ~5 seconds for nodes to initialize, then:
docker compose up -d --build
```

---

## 8. Running Tests

| Command | Description |
|---------|-------------|
| `npm run test:comprehensive` | Full end-to-end integration suite (69 tests) |
| `npm run test:integration` | Alternate integration test set |
| `npm run test:contract` | Solidity unit tests (Hardhat) |
| `npm run test:blockchain` | Blockchain network connectivity tests |
| `npm run test:tamper` | Evidence tampering simulation |
| `npm run test:manual` | Manual API tests via bash script |
| `npm run seed` | Seed the database with mock data |

---

## 9. Command Reference

### Application Stack

| Command | Description |
|---------|-------------|
| `docker compose up -d --build` | Start all services (rebuild images) |
| `docker compose up -d` | Start all services (use existing images) |
| `docker compose down` | Stop all services (preserve data) |
| `docker compose ps` | Check service status |
| `docker compose logs -f <service>` | Tail logs for a service |
| `docker compose restart <service>` | Restart a specific service |
| `docker compose exec db-users psql -U shield -d shield_db` | Open a database shell |

### Blockchain Network

| Command | Description |
|---------|-------------|
| `npm run blockchain:up` | Compile contracts + start blockchain network |
| `docker compose -f docker-compose.blockchain.yml up -d` | Start blockchain only |
| `docker compose -f docker-compose.blockchain.yml down` | Stop blockchain |
| `docker compose -f docker-compose.blockchain.yml ps` | Check blockchain node status |
| `docker compose -f docker-compose.blockchain.yml logs -f node-police` | Tail police node logs |

### Contract Development

| Command | Description |
|---------|-------------|
| `npx hardhat compile` | Compile Solidity contracts + export ABI |
| `npx hardhat run scripts/deploy.js --network localnet` | Deploy to private chain |
| `npx hardhat test` | Run Solidity unit tests |

### Key Generation

```bash
# Generate a 32-byte base64 key (for JWT_SECRET, MASTER_KEY, BLOCKCHAIN_ENCRYPTION_KEY)
openssl rand -base64 32
```

---

## Architecture Overview

```
Internet → nginx (port 80)
              ↓
       shield-gateway (port 3001)
         ↙        ↘
shield-auth    shield-evidence
(port 4000)      (port 4001)
    ↓               ↓
 db-users       minio-store
(PostgreSQL)     (S3 storage)
                    ↓
             shield-ledger (port 4002)
                    ↓
          Private EVM Blockchain
            ┌─────────────┐
            │ node-police │ ← shield-ledger connects here
            │ node-court  │ ← secondary mining node
            │  bootnode   │ ← peer discovery
            └─────────────┘

shield-watchdog — periodically verifies all evidence hashes against the chain
shield-frontend — React UI served on port 3000
```
