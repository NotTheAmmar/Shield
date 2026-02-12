# SHIELD Project Structure & Setup Guide

This document serves as a blueprint for setting up the SHIELD development environment. It is designed to be **Cross-Platform (Windows & Linux)** compatible.

## 1. Directory Structure

The project will follow a **Monorepo-style** structure.

```text
shield-project/
├── .gitignore             # Global gitignore (Recursive)
├── .dockerignore          # Global dockerignore
├── README.md              # Setup & Config Documentation
├── package.json           # Root scripts (Cross-platform runner)
├── docker-compose.yml     # Main composition
├── .docker-data/          # [GitIgnored] Local persistence for DBs
│   ├── postgres/
│   ├── immudb/
│   └── minio/
├── .vscode/               # VS Code Workspace settings
│   ├── launch.json        # Debug configurations
│   └── tasks.json         # Task definitions
├── shield-frontend/       # [Next.js] User Interface
│   ├── Dockerfile
│   ├── package.json
│   └── ...
├── shield-gateway/        # [Next.js] API Gateway / BFF
│   ├── Dockerfile
│   ├── package.json
│   └── ...
├── shield-auth/           # [Node.js] Authentication Service
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── shield-evidence/       # [Node.js] Evidence Management
│   ├── Dockerfile
│   ├── package.json
│   └── src/
└── shield-ledger/         # [Node.js] Ledger Interface
    ├── Dockerfile
    ├── package.json
    └── src/
```

## 2. Configuration & Git

### .gitignore (Root)
This single file handles ignores for the entire project recursively. Sub-folder `.gitignore` files are not strictly needed unless you have service-specific exceptions.

```gitignore
node_modules/
.env
.DS_Store
dist/
coverage/
.next/
build/
*.log
.vscode/chrome
# Ignore local DB data
.docker-data/
```

### README.md
Should contain the following setup details:
1.  **Prerequisites**: Docker Desktop, Node.js (LTS), VS Code.
2.  **Setup**: Run `npm install` in root to setup scripts.
3.  **Environment Variables**: Explain that `.env` files are not used (vars are in docker-compose) OR provide a `.env.example`.
4.  **Ports**: List of ports (3000, 3001, 3322, etc.).

## 3. Docker Configuration (Cross-Platform)

We use **relative paths** for volumes and a customized **Bridge Network** for internal DNS resolution.

### docker-compose.yml

```yaml
version: '3.8'

networks:
  shield-network:
    driver: bridge

services:
  # --- Infrastructure ---
  db-users:
    image: postgres:15-alpine
    container_name: db-users
    networks:
      - shield-network
    environment:
      POSTGRES_USER: shield_user
      POSTGRES_PASSWORD: shield_password
      POSTGRES_DB: shield_users
    ports:
      - "5432:5432"
    volumes:
      - ./.docker-data/postgres:/var/lib/postgresql/data

  db-ledger:
    image: codenotary/immudb:latest
    container_name: db-ledger
    networks:
      - shield-network
    ports:
      - "3322:3322"
      - "8080:8080"
    volumes:
      - ./.docker-data/immudb:/var/lib/immudb

  minio-store:
    image: minio/minio
    container_name: minio-store
    networks:
      - shield-network
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: shield_minio
      MINIO_ROOT_PASSWORD: shield_minio_password
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - ./.docker-data/minio:/data

  # --- Application Services ---
  shield-gateway:
    build: ./shield-gateway
    container_name: shield-gateway
    networks:
      - shield-network
    ports:
      - "3001:3000"
    depends_on:
      - shield-auth
      - shield-evidence

  shield-frontend:
    build: ./shield-frontend
    container_name: shield-frontend
    networks:
      - shield-network
    ports:
      - "3000:3000"
    depends_on:
      - shield-gateway

  shield-auth:
    build: ./shield-auth
    container_name: shield-auth
    networks:
      - shield-network
    ports:
      - "4000:4000"
    environment:
      DB_HOST: db-users
      JWT_SECRET: dev_secret_key
    depends_on:
      - db-users

  shield-evidence:
    build: ./shield-evidence
    container_name: shield-evidence
    networks:
      - shield-network
    ports:
      - "4001:4001"
    environment:
      MINIO_ENDPOINT: minio-store
      MINIO_ACCESS_KEY: shield_minio
      MINIO_SECRET_KEY: shield_minio_password
      MASTER_KEY: dev_master_key_32_bytes_long_exact!!
    depends_on:
      - minio-store
      - shield-ledger

  shield-ledger:
    build: ./shield-ledger
    container_name: shield-ledger
    networks:
      - shield-network
    ports:
      - "4002:4002"
    environment:
      IMMUDB_HOST: db-ledger
    depends_on:
      - db-ledger
```

## 4. Initialization Scripts (package.json)

Instead of `.sh` scripts (which fail on Windows CMD), we use a **Root package.json** to manage scripts cross-platform.

### root/package.json

```json
{
  "name": "shield-project-root",
  "private": true,
  "scripts": {
    "setup": "npm install && npm run install:all",
    "install:all": "concurrently \"npm install --prefix shield-frontend\" \"npm install --prefix shield-gateway\" \"npm install --prefix shield-auth\" \"npm install --prefix shield-evidence\" \"npm install --prefix shield-ledger\"",
    "dev:infra": "docker-compose up -d db-users db-ledger minio-store",
    "dev:full": "docker-compose up --build",
    "stop": "docker-compose down"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

## 5. VS Code Configuration

### .vscode/launch.json
Updated to ensure path consistency.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "pwa-node",
      "request": "launch",
      "name": "Debug Auth Service",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/shield-auth/src/index.js",
      "cwd": "${workspaceFolder}/shield-auth",
      "env": {
        "DB_HOST": "localhost",
        "JWT_SECRET": "dev_secret"
      }
    },
    {
      "name": "Next.js: Frontend",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev",
      "cwd": "${workspaceFolder}/shield-frontend"
    }
  ]
}
```

### .vscode/tasks.json

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Infrastructure (DBs)",
      "type": "npm",
      "script": "dev:infra",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "Start All (Docker)",
      "type": "npm",
      "script": "dev:full",
      "group": "build",
      "problemMatcher": []
    }
  ]
}
```
