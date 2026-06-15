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
Triggers a local sweep of the integrity watchdog scan to cross-verify Postgres evidence hashes with the blockchain ledger, logging a forensic status audit:
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

---

## ⛓️ Blockchain Tests

Two dedicated test suites validate the private EVM blockchain layer.

### 6. Smart Contract Unit Tests

Tests the `ShieldLedger.sol` contract logic in isolation using the built-in Hardhat EVM. **No Docker required**.

```bash
npm run test:contract
# or: npx hardhat test
```

**Test cases (9 assertions):**
| # | Description |
|---|---|
| 1 | Contract deploys and sets owner correctly |
| 2 | Anchors valid evidence and emits `EvidenceAnchored` event |
| 3 | Retrieves correct hash, timestamp, and signer after anchoring |
| 4 | Reverts on duplicate evidence ID |
| 5 | Reverts on empty evidence ID |
| 6 | Reverts on hash shorter than 64 characters |
| 7 | Reverts on hash longer than 64 characters |
| 8 | Stores multiple distinct evidence records independently |
| 9 | Records the actual caller's address as `registeredBy` |

### 7. Docker Network Integration Tests

Validates the live Docker blockchain infrastructure end-to-end.

**Prerequisites:**
```bash
docker compose up -d                                         # main stack (creates shield-network)
npm run blockchain:up                                        # starts blockchain stack & compiles contracts
```

```bash
npm run test:blockchain
# or: bash tests/blockchain/blockchain_network_test.sh
```

**Test cases (12+ assertions):**
| # | Description |
|---|---|
| 1–3 | All 3 containers (`bootnode`, `node-police`, `node-court`) are running |
| 4–5 | `node-police` (port 8545) and `node-court` (port 8546) JSON-RPC endpoints respond |
| 6–7 | Both nodes report Chain ID `31337` (`0x7a69`) |
| 8–9 | Both nodes report ≥1 peer after bootnode discovery |
| 10 | Block number increases over time (sealing is active) |
| 11 | Zero-gas-price transaction is accepted by `node-police` |
| 12 | That transaction is visible on `node-court` after propagation |
| 13 | `shield-ledger/src/abis/ShieldLedger.json` exists and contains expected function signatures |

