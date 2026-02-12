# SHIELD Project

## Setup Guide

### Prerequisites
- Docker Desktop
- Node.js (LTS)
- VS Code

### Setup
Run `npm install` in the root directory to setup scripts.

### Environment Variables
Environment variables are managed in `docker-compose.yml`. `.env` files are not used.

### Ports
- Frontend: 3000
- Gateway: 3001
- Auth Service: 4000
- Evidence Service: 4001
- Ledger Service: 4002
- Postgres: 5432
- Immudb: 3322, 8080
- Minio: 9000, 9001
