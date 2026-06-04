# SHIELD - **Secure Hash-based Immutable Evidence Locker & Database**

SHIELD is a secure, decentralized digital system designed to handle First Information Reports (FIR) and associated digital evidence for law enforcement and judicial systems. 

By generating cryptographic hash values (SHA-256) at the exact time of submission, SHIELD ensures the absolute data integrity of digital evidence (CCTV footage, documents, images) and FIR records. It enables tamper detection and maintains a cryptographically verifiable chain of custody without relying on centralized, vulnerable storage systems.

## 📖 Documentation

- [Architecture & Monorepo Structure](STRUCTURE.md): Learn how our 7 microservices connect.
- [Database & Storage Architecture](DATABASE.md): Understand PostgreSQL/PostGIS, Immudb Ledger, and MinIO details.
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

Ensure that variables such as `IMMUDB_USER` are set (it defaults to `immudb` for the primary system admin) before proceeding.

*(Note: Do not commit your `.env` file. It is ignored by Git.)*

### 3. Running the Project locally

We use Docker Compose to orchestrate the infrastructure (PostgreSQL, MinIO, Immudb) and the Node.js application services.

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

### 4. Production Deployment via Docker Hub

For production environments, the custom microservices of the SHIELD project are automatically compiled and published to **Docker Hub** via our automated CD pipeline. 

The underlying infrastructure databases (PostgreSQL/PostGIS, Immudb, MinIO) and the edge reverse proxy (Nginx) utilize their official, pre-built public images. When starting the stack, Docker Compose automatically fetches these from their official public registries! This ensures you only have to build and maintain the lightweight application images.

To deploy the unified production stack without compiling source code locally:

```bash
# 1. Set your Docker Hub username
export DOCKER_USER=your_dockerhub_username

# 2. Spin up the production-ready compose cluster
docker compose -f docker-compose.prod.yml up -d
```

This pulls your custom microservice images from Docker Hub, integrates them with the official database nodes, and boots the entire secure network in the background.

---

## 🧪 Testing and Security Simulation Suite

SHIELD includes a centralized testing suite located in the `/tests` folder to verify the functionality of all services, enforce zero-trust constraints, and simulate security attacks.

For a detailed breakdown of the testing strategy, E2E assertions, and architecture, refer to the [Testing Documentation](tests/README.md).

### Quick Runners
Ensure that the Docker stack is running (`docker compose up`) before executing these scripts.

```bash
npm run seed                 # Wipe and populate mock PG & MinIO data
npm run test:comprehensive   # Primary E2E test suite (69 advanced assertions)
npm run test:tamper          # Overwrite MinIO file directly and prove ImmuDB catches it
npm run watchdog:local       # Run a local database/ledger integrity cycle
npm run test:manual          # Run raw shell curl diagnostics
```

---

## 🚢 Continuous Integration (GitHub Actions)

SHIELD features automated E2E testing on every push and pull request. The configuration is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml).

The pipeline automatically:
1. Provisions dependencies across the monorepo.
2. Instantiates environment files from `.env.example`.
3. Boots the multi-container Docker Compose stack.
4. Executes database seeds and the entire 69-assertion functional comprehensive test suite.
5. Runs forensic tampering simulations.
6. Gracefully tears down all containers and volumes.

---

## ⛓️ EVM Smart Contract Anchor Preparation (Roadmap)

To prepare for future Ethereum Virtual Machine (EVM) anchoring, the repository includes a decentralized ledger design skeleton:
- **Solidity Smart Contract**: [ShieldLedger.sol](contracts/ShieldLedger.sol) contains the production-grade Solidity code to anchor evidence hashes and UUIDs in an immutable, decentralized manner.
- **Hardhat Compilation & Local Node**: [hardhat.config.js](hardhat.config.js) defines the development network workspace, ready for Solidity compilation and Ganache/Hardhat node integration.

---

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
- Ledger Service (Immudb Node Wrapper): `http://localhost:4002`

**Infrastructure & Consoles:**
- PostgreSQL Database (`db-users`): `5432`
- MinIO Object Store (`minio-store`): `9000` (Console Web UI at `http://localhost:9001`)
- Immudb Ledger Database (`db-ledger`): `3322` (Web Console at `http://localhost:8080`)

## Contributors
* Ammar Rangwala
* Vishvambar Udavant
* Ish Chaniyara
* Ziyadali Sayed
