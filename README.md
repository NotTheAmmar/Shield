# SHIELD - **Secure Hash-based Immutable Evidence Locker & Database**

SHIELD is a secure, decentralized digital system designed to handle First Information Reports (FIRs) and associated digital evidence for law enforcement and judicial systems. 

By generating cryptographic hash values (SHA-256) at the exact time of submission, SHIELD ensures the absolute data integrity of digital evidence (CCTV footage, documents, images) and FIR records. It enables tamper detection and maintains a cryptographically verifiable chain of custody without relying on centralized, vulnerable storage systems.

## 📖 Documentation

- [Architecture & Monorepo Structure](STRUCTURE.md): Learn how our 5 microservices connect.
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

Next, run the root setup script. This uses `concurrently` to install the `npm` dependencies for all 5 microservices simultaneously.

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

This builds fresh images for all services and starts them. The gateway runs with `node --watch`, and the frontend runs via `vite` dev server — both hot-reload on file changes automatically.

**To stop the cluster:**

```bash
docker compose down
```

*(Advanced: If you only want to run the infrastructure databases via Docker and run the Node services locally via terminal, you can use `npm run dev:infra`.)*

### 🚢 Service Ports

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
