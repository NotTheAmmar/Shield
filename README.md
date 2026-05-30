# SHIELD - **Secure Hash-based Immutable Evidence Locker & Database**

SHIELD is a secure, decentralized digital system designed to handle First Information Reports (FIRs) and associated digital evidence for law enforcement and judicial systems. 

By generating cryptographic hash values (SHA-256) at the exact time of submission, SHIELD ensures the absolute data integrity of digital evidence (CCTV footage, documents, images) and FIR records. It enables tamper detection and maintains a cryptographically verifiable chain of custody without relying on centralized, vulnerable storage systems.

## 📖 Documentation

- [Architecture & Monorepo Structure](STRUCTURE.md): Learn how our 7 microservices connect.
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

---

## 🧪 Testing and Security Simulation Suite

SHIELD includes a centralized testing suite located in the `/tests` folder to verify the functionality of all services and simulate security attacks.

Ensure that the Docker stack is running (`docker compose up`) before executing these scripts.

### 1. Seeding Mock Data
Populate the PostgreSQL database and MinIO storage with mock case data and digital evidence files for local testing:
```bash
npm run seed
```

### 2. Running Automated Functional Tests
Execute the comprehensive test suites against the live API Gateway (runs 50+ assertions evaluating authentication, role-based access control (RBAC), FIR management, zero-trust constraints, and evidence uploading):
```bash
npm run test:comprehensive   # Runs the full functional test suite
npm run test:integration     # Runs the core API gateway integration test
npm run test:sprint1         # Runs the legacy functional verification script
```

### 3. Executing Security & Tampering Simulations
SHIELD's flagship feature is ledger-backed verification. To simulate an attacker gaining direct access to the raw MinIO storage layer and modifying a file (completely bypassing the API Gateway), run:
```bash
npm run test:tamper          # Overwrites a MinIO file directly and shows that ImmuDB catches the attack
```

### 4. Running the Local Watchdog
Run the ledger-backed watchdog verifier in a local terminal to scan all existing database records and verify their integrity:
```bash
npm run watchdog:local       # Run a local integrity check cycle
```

---

## 🚢 Service Ports

Once running, the services will be available on your `localhost` at the following ports:

**Applications:**

- Frontend (React + Vite): `http://localhost:3000`
- API Gateway: `http://localhost:3001`
- Auth Service: `http://localhost:4000`
- Evidence Service: `http://localhost:4001`
- Ledger Service: `http://localhost:4002`

**Infrastructure:**

- PostgreSQL (`db-users`): `5432`
- MinIO Object Store (`minio-store`): `9000` (Console at `9001`)
- Immudb Ledger (`db-ledger`): `3322` (Web Console at `8080`)
