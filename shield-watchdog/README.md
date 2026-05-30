# SHIELD — Integrity Watchdog Service (`shield-watchdog`)

The **Integrity Watchdog Service** is an automated background daemon container designed to constantly scan evidence records, recalculate SHA-256 signatures, and verify system integrity against the **Immudb** ledger. It acts as an automated anti-tampering sentinel.

## 🛠️ Tech Stack & Operation

- **Runtime**: Node.js
- **Mechanism**: Infinite loop with standard `setInterval` polling.
- **Workflow**:
  1. Boots and waits 15 seconds for surrounding microservices to warm up.
  2. Queries the Evidence Service `/internal/list` endpoint via keyset-paginated HTTP requests to fetch all evidence IDs.
  3. Splits results into sub-batches of 50.
  4. Triggers batch verification `/internal/verify-batch`, prompting the Evidence Service to recalculate hashes from MinIO storage and compare them with the immutable Immudb blockchain ledger.
  5. Outputs real-time reports and raises `🚨 TAMPER ALERT` errors in standard logging streams if a file has been modified behind the scenes.
  6. Sleeps for `WATCHDOG_INTERVAL` minutes, then repeats.

## ⚙️ Configuration (Environment Variables)

This service is configured strictly in `docker-compose.yml`:

| Variable | Description | Default |
|---|---|---|
| `WATCHDOG_INTERVAL` | The sleep period between database sweeps (in minutes) | `30` |
| `MASTER_KEY` | Symmetric key verifying internal communication with Evidence Service | `shield_worker_key_2026` |
| `API_BASE_URL` | Microservice URL target | `http://shield-evidence:4001/api/evidence/internal` |
