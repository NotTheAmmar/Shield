# SHIELD — Ledger Service (`shield-ledger`)

The **Ledger Service** is a lightweight Node.js Express service serving as an API wrapper for the **private EVM blockchain ledger**. It guarantees that evidence hashes cannot be altered once written by interacting with the `ShieldLedger` smart contract.

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Database Backend**: Private EVM blockchain (Clique PoA) via the `ethers` library
- **Framework**: Express.js

## 📁 Key Files & Structure

- `src/index.js`: Service bootstrapping, Express route setups.
- `src/blockchain.js`: Initializes and manages the `ethers.JsonRpcProvider` connection to the blockchain node and the `ShieldLedger` contract instance.
- `src/abis/ShieldLedger.json`: The compiled ABI of the `ShieldLedger` smart contract.

## ⚙️ Configuration (Environment Variables)

The service binds locally to port `4002` and requires access to the blockchain network:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Listening port for ledger microservice | `4002` |
| `BLOCKCHAIN_RPC_URL` | RPC URL of the blockchain node | `http://node-police:8545` |
| `FIR_CONTRACT_ADDRESS` | Deployed address of the `FIRLedger` contract | (Required) |
| `EVIDENCE_CONTRACT_ADDRESS` | Deployed address of the `EvidenceLedger` contract | (Required) |

## 🚀 API Endpoints

This service is locked behind internal firewall layers and should only be accessed by the Evidence Service:

- **`POST /api/ledger/store`**: Calls `anchorEvidence` on the smart contract to save a cryptographic signature (hash + timestamp + user address) onto the blockchain.
- **`GET /api/ledger/:evidenceId`**: Queries the `getEvidence` function on the smart contract for the absolute, initial hash associated with a given evidence UUID, returning cryptographic proofs.
