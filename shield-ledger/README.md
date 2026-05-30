# SHIELD — Ledger Service (`shield-ledger`)

The **Ledger Service** is a lightweight Node.js Express service serving as an API wrapper for **Immudb**, our high-speed, cryptographic, tamper-evident immutable ledger. It guarantees that evidence hashes cannot be altered once written.

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Database Backend**: Immudb (`db-ledger`) via the official `immudb-node` client SDK
- **Framework**: Express.js

## 📁 Key Files & Structure

- `src/index.js`: Service bootstrapping, Express route setups.
- `src/immudb.js`: Initializes and manages the gRPC connection pool to the Immudb server.

## ⚙️ Configuration (Environment Variables)

The service binds locally to port `4002` and requires access to the ledger database:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Listening port for ledger microservice | `4002` |
| `IMMUDB_HOST` | Hostname of the Immudb ledger engine | `db-ledger` |
| `IMMUDB_PORT` | Port of the Immudb engine | `3322` |
| `IMMUDB_USER` | System admin username | `immudb` |
| `IMMUDB_ADMIN_PASSWORD` | Password for the Immudb service account | `immudb_password` |

## 🚀 API Endpoints

This service is locked behind internal firewall layers and should only be accessed by the Evidence Service:

- **`POST /ledger/record`**: Saves a cryptographic signature (hash + timestamp + case UUID) into Immudb.
- **`POST /ledger/verify`**: Queries the ledger for the absolute, initial hash associated with a given evidence UUID, returning cryptographic proofs.
- **`GET /ledger/audit`**: Fetches all case events, transaction chains, and ledger block properties.
