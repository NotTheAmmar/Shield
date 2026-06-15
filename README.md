# SHIELD - **Secure Hash-based Immutable Evidence Locker & Database**

SHIELD is a secure, decentralized digital system designed to handle First Information Reports (FIR) and associated digital evidence for law enforcement and judicial systems. 

By generating cryptographic hash values (SHA-256) at the exact time of submission, SHIELD ensures the absolute data integrity of digital evidence (CCTV footage, documents, images) and FIR records. It enables tamper detection and maintains a cryptographically verifiable chain of custody without relying on centralized, vulnerable storage systems.

## 📖 Documentation

- [Architecture & Monorepo Structure](STRUCTURE.md): Learn how our 7 microservices connect.
- [Database & Storage Architecture](DATABASE.md): Understand PostgreSQL/PostGIS, Blockchain Ledger, and MinIO details.
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

**To start the entire cluster in development mode:**

```bash
docker compose build --no-cache
docker compose up
```

This builds fresh images for all services and starts them. The gateway and node microservices will reload on file changes automatically.

**To stop the cluster:**

```bash
npm run stop
```

## 🧪 Testing and Security Simulation Suite

SHIELD includes a centralized testing suite located in the `/tests` folder to verify the functionality of all services, enforce zero-trust constraints, and simulate security attacks.

For a detailed breakdown of the testing strategy, E2E assertions, and architecture, refer to the [Testing Documentation](tests/README.md).

### Quick Runners
Ensure that the Docker stack is running (`docker compose up`) before executing these scripts.

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

### Institutional Signer Model

Each node represents a real-world institution:

| Node | Institution | Role | RPC Port |
|---|---|---|---|
| `blockchain-bootnode` | — | Peer discovery relay | — |
| `node-police` | Police Station | Sealer + transaction signer | `8545` |
| `node-court` | Court / Judiciary | Sealer + transaction signer | `8546` |

When a police officer uploads a FIR, the `shield-ledger` service submits the anchoring transaction to `node-police`, which signs it with the police institution's Ethereum key. The `registeredBy` field in the `ShieldLedger` contract records the institution's address.

> **Future officer-key integration**: When individual officer private keys are introduced, officers will sign their own transactions. No blockchain infrastructure changes are required \u2014 it is purely an application-layer change.

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

```bash
# 1. Start the main stack first (required — creates the shield-network bridge)
docker compose up -d

# 2. Start the blockchain network (automatically compiles contracts & exports ABI)
npm run blockchain:up

# 3. Verify the network is running
npm run test:blockchain
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

Keystore password: `shield-dev-password-2026` (dev only \u2014 zero-value chain, no real ETH).


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
