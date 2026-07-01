# SHIELD - **Secure Hash-based Immutable Evidence Locker & Database**

SHIELD is a secure, decentralized digital system designed to handle First Information Reports (FIR) and associated digital evidence for law enforcement and judicial systems. 

By generating cryptographic hash values (SHA-256) at the exact time of submission, SHIELD ensures the absolute data integrity of digital evidence (CCTV footage, documents, images) and FIR records. It enables tamper detection and maintains a cryptographically verifiable chain of custody without relying on centralized, vulnerable storage systems.

## 📖 Documentation

- [Architecture & Monorepo Structure](STRUCTURE.md): Learn how our 7 microservices connect.
- [Database & Storage Architecture](DATABASE.md): Understand PostgreSQL/PostGIS, Blockchain Ledger, and MinIO details.
- [Legal & Section 63 Compliance](LEGAL_COMPLIANCE.md): Deep-dive into the Section 63/65B certificate generation and the cryptographic tamper lock.
- [Contributing Guidelines](CONTRIBUTING.md): Please read this before opening a Pull Request!

---

## 🚀 Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. The project is designed to be **Cross-Platform** (Windows, macOS, & Linux) compatible via Docker.

### Prerequisites

You will need the following installed on your machine:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (Must be running before starting the project)
- **[Node.js](https://nodejs.org/)** (LTS Version Recommended)
- Git

### 1. Installation

First, clone the repository and navigate into it:

```bash
git clone https://github.com/your-org/shield-project.git
cd shield-project
```

Next, run the root setup script. This uses `concurrently` to install the `npm` dependencies for all microservices simultaneously:

```bash
npm run setup
```

### 2. Environment Variables

SHIELD uses a single `.env` file at the root level which is injected into the Docker containers via `docker-compose.yml`. 

Copy the example environment file and fill in any required development secrets:

```bash
cp .env.example .env
```

Ensure that variables are set before proceeding.

*(Note: Do not commit your `.env` file. It is ignored by Git.)*

### 3. Running the Project locally

We use Docker Compose to orchestrate the infrastructure (PostgreSQL, MinIO, Blockchain) and the Node.js application services.

For a step-by-step walk-through of starting a fresh system, deploying the smart contract, and launching the services, please refer to the comprehensive [Deployment & Setup Guide](DEPLOYMENT_GUIDE.md).

**To start the entire cluster in development mode:**

1. Create the shared network:
   ```bash
   docker network create --label "com.docker.compose.network=shield-network" --label "com.docker.compose.project=shield" --label "com.docker.compose.version=2" shield_shield-network
   ```
2. Start the blockchain:
   ```bash
   docker compose -f docker-compose.blockchain.yml up -d
   ```
3. Deploy the smart contracts:
   ```bash
   npx hardhat compile
   npx hardhat run scripts/deploy.js --network localnet
   ```
4. Copy the printed contract addresses into your `.env` as `BLOCKCHAIN_FIR_CONTRACT_ADDRESS` and `BLOCKCHAIN_EVIDENCE_CONTRACT_ADDRESS`.
5. Start the application stack:
   ```bash
   docker compose up -d --build
   ```

**To stop the cluster:**

```bash
npm run stop && npm run blockchain:down
```

## 🧪 Testing and Security Simulation Suite

SHIELD includes a centralized testing suite located in the `/tests` folder to verify the functionality of all services, enforce zero-trust constraints, and simulate security attacks.

For a detailed breakdown of the testing strategy, E2E assertions, and architecture, refer to the [Testing Documentation](tests/README.md).

### Quick Runners
Ensure that the Docker stack is running before executing these scripts.

```bash
npm run seed                 # Wipe and populate mock PG & MinIO data
npm run test:comprehensive   # Primary E2E test suite (69 advanced assertions)
npm run test:tamper          # Overwrite MinIO file directly and prove blockchain catches it
npm run watchdog:local       # Run a local database/ledger integrity cycle
npm run test:manual          # Run raw shell curl diagnostics
npm run test:contract        # Run Hardhat Solidity unit tests (no Docker needed)
npm run test:blockchain      # Run Docker blockchain network integration tests
```

## 🔗 Blockchain Network

SHIELD runs a private 3-node Clique Proof-of-Authority (PoA) Ethereum network to anchor evidence hashes on-chain.

### Officer-Level Signing Model

SHIELD uses a per-user cryptographic signature model to guarantee zero-trust chain of custody:

- **Key Automation**: When an administrator provisions a new officer, the system auto-generates a unique Ethereum wallet and encrypts its private key using AES-256-GCM under the `BLOCKCHAIN_ENCRYPTION_KEY`.
- **Client-Side Signing**: When an officer uploads evidence, the backend retrieves and decrypts their key, initializing an `ethers.Wallet` to sign transactions client-side before forwarding them to the ledger.
- **On-Chain Identity**: The `registeredBy` field in the `ShieldLedger` smart contract stores the unique public address of the specific officer who registered the evidence.

### Network Topology

```
blockchain-network (isolated)                  shield-network (shared with app)
┌────────────────────────────────┐             ┌──────────────────────────────┐
│  blockchain-bootnode           │             │  shield-ledger               │
│  node-police ◄─────────────────┼─────────────► node-police (RPC: 8545)     │
│  node-court  ◄─────────────────┼─────────────► node-court  (RPC: 8546)     │
└────────────────────────────────┘             └──────────────────────────────┘
```

### Starting the Blockchain Network

Refer to [Deployment & Setup Guide](DEPLOYMENT_GUIDE.md) for full setup details. Alternatively, start it directly with:

```bash
npm run blockchain:up
```

### Stopping the Blockchain Network

```bash
npm run blockchain:down
# or: docker compose -f docker-compose.blockchain.yml down
```

> **Note**: Blockchain chain data is persisted in `.docker-data/geth-*/`. To start fresh, delete those directories before running `blockchain:up`.

### Blockchain Accounts

| Account | Address | Private Key Location |
|---|---|---|
| Police Institution | `0x80de6eF5a945D6Cc1DAd5375E3CeD4DF466e0384` | `blockchain/keystore/police-account.json` |
| Court Institution | `0x01a08fc1e3c0EB8d2Be2301Ba36761485d1a2B4e` | `blockchain/keystore/court-account.json` |

Keystore password: `shield-dev-password-2026` (dev only — zero-value chain, no real ETH).


## 🚢 Service Ports & Unified Entrypoint

Once running, the entire SHIELD application is unified behind an **Nginx Reverse Proxy** (`shield-nginx`) exposing the standard HTTP port **80**.

**Unified Entrypoint:**
- **Web App (Frontend)**: `http://localhost` (Routes to React + Vite application)
- **API Gateway (Backend)**: `http://localhost/api/` (Routes to BFF Gateway API)

Alternatively, you can access the individual microservices and databases directly at their respective ports:

**Individual Microservices:**
- Frontend (React + Vite dev server): `http://localhost:3000`
- API Gateway (BFF): `http://localhost:3001`
- Auth Service: `http://localhost:4000`
- Evidence Service: `http://localhost:4001`
- Ledger Service (Blockchain Node Wrapper): `http://localhost:4002`

**Infrastructure & Consoles:**
- PostgreSQL Database (`db-users`): `5432`
- MinIO Object Store (`minio-store`): `9000` (Console Web UI at `http://localhost:9001`)


## Contributors
* Ammar Rangwala
* Vishvambar Udavant
* Ish Chaniyara
* Ziyadali Sayed
