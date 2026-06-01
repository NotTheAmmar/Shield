# SHIELD — API Gateway (`shield-gateway`)

The **API Gateway** acts as the Backend-for-Frontend (BFF) and security perimeter for the SHIELD application stack. Built with Node.js and Express, it acts as a reverse proxy, routing incoming frontend HTTP requests to the appropriate microservices while handling authentication checks, rate limiting, and security headers.

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Framework**: Express.js
- **Network Routing**: Internal proxying rules and routes.

## 📁 Key Files & Structure

- `src/index.js`: Gateway setup, cors configurations, global error handling, port `3001` binding.
- `src/routes/`: Route forwarding configurations routing client traffic to Auth, Evidence, FIR, and Telemetry services.
- `src/mockData.js`: Seeding configurations and mock analytics fallback.

## ⚙️ Configuration (Environment Variables)

The gateway routes internal traffic to Docker network hosts:

| Service | Environment Var (Optional) | Default Downstream Target |
|---|---|---|
| Auth Service | `AUTH_SERVICE_URL` | `http://shield-auth:4000` |
| Evidence Service | `EVIDENCE_SERVICE_URL` | `http://shield-evidence:4001` |
| Ledger Service | `LEDGER_SERVICE_URL` | `http://shield-ledger:4002` |

## 🔒 Security Gatekeeping

1. **Token Propagation**: Extracts the `Authorization: Bearer <JWT>` header from incoming user requests, decodes roles, and safely forwards credentials to downstream microservices.
2. **Internal Endpoint Protection**: Explicitly filters and drops any traffic targeting internal routes (e.g. `/api/evidence/internal/*`), returning a clean 404/403 to prevent perimeter leaks.
3. **CORS Enforcement**: Enforces cross-origin policies allowing only approved origins (e.g., the Vite frontend at port `3000`) to initiate requests.
