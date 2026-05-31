# SHIELD Monorepo Testing Framework & Architecture

Welcome to the central testing suite of the SHIELD monorepo. This directory houses all integration, E2E, mock database seeding, security tampering simulations, and local diagnostics.

---

## 📂 Testing Directory Structure

```text
tests/
├── helpers/
│   └── seed_mock_data.js             # Wipes databases & seeds PostgreSQL and MinIO
├── integration/
│   ├── run_manual_tests.sh           # Native curl-based integration test script
│   ├── shield_comprehensive_test.js  # Main E2E test suite (69 advanced assertions)
│   ├── shield_full_integration_test.js # Core integration test suite
│   └── watchdog_local.js             # Local integrity audit scan runner
├── simulation/
│   └── tamper_evidence_v2.js         # Advanced database vs storage tampering suite
└── README.md                         # This file (Testing Documentation)
```

---

## 🚀 Running Tests Locally

### Prerequisite: Live Stack
Make sure the Docker Compose microservice stack is running and healthy:
```bash
docker compose up -d
```

### 1. Database & Object Storage Seeding
Wipes existing PostgreSQL tables and MinIO buckets, and seeds them with baseline testing records:
```bash
npm run seed
```

### 2. E2E Comprehensive Backend Test
This is the primary backend test suite. It executes **69 rigorous assertions** across all 7 microservices via the BFF Gateway, covering health checks, complex role-based RBAC, FIR registration, multipart evidence upload, cryptographic integrity checks, and zero-trust limits.
```bash
npm run test:comprehensive
```

### 3. Forensic Tampering Simulations
Simulates manual storage tampering by modifying evidence payloads inside MinIO buckets directly, and asserts that the verification pipeline and watchdogs correctly identify and log the security anomalies.
```bash
npm run test:tamper
```

### 4. Integrity Watchdog Local Scan
Triggers a local sweep of the integrity watchdog scan to cross-verify Postgres evidence hashes with the ImmuDB ledger, logging a forensic status audit:
```bash
npm run watchdog:local
```

### 5. Bash Manual Diagnostics
Executes a suite of raw shell curl queries to check REST routes natively:
```bash
npm run test:manual
```

---

## 🛠️ Automated CI/CD Pipeline (GitHub Actions)

We use **GitHub Actions** to automate continuous integration. The pipeline configuration is located in [.github/workflows/ci.yml](file:///home/ammar/Programs/Shield/.github/workflows/ci.yml).

### Pipeline Workflow
1. **Checkout & Node Setup**: Pulls the codebase and configures Node.js 20.
2. **Dependency Bootstrapping**: Installs npm dependencies across all microservices via `npm run setup`.
3. **Environment Setup**: Configures default development secrets from the `.env.example` template.
4. **Stack Spin-Up**: Boots the full multi-container cluster using `docker compose up -d`.
5. **Database Seeding**: Populates PostgreSQL and MinIO with mock data.
6. **E2E Comprehensive Execution**: Executes `npm run test:comprehensive`. If any of the 69 tests fail, the build fails.
7. **Simulation Validation**: Runs the evidence tampering simulation to verify anomaly detection.
8. **Teardown**: Gracefully shuts down and destroys compose volumes.

---

## 🔐 Zero-Trust Verification Strategy

Our test suites explicitly assert zero-trust constraints:
- **Admin Users**: Can manage users and reset passwords, but are strictly **forbidden (403)** from viewing the evidence dashboard stats or reading operational audit trails.
- **Police Officers**: Can create FIRs and upload digital evidence, but are **blocked (403)** from viewing administrative pages.
- **Judicial Authorities**: Have exclusive access to the forensic operational audit logs, but are **blocked (403)** from registering evidence.
- **Internal Routes**: Routes under `/api/evidence/internal/*` are guarded by an IP perimeter whitelist (`internalNetworkGuard`), allowing only localhost or internal Docker Class A/B/C subnets.
