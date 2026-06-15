# SHIELD — Evidence Service (`shield-evidence`)

The **Evidence Service** is a Node.js microservice handling the core business logic of hashing digital evidence upon upload and storing files securely in MinIO object storage. It coordinates metadata extraction queues and interacts with the ledger service to establish cryptographic tamper-evidence guarantees.

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Framework**: Express.js
- **Object Storage**: MinIO (S3-compatible bucket)
- **Database**: PostgreSQL (stores evidence descriptors and case linkages)
- **Event Bus**: BullMQ + Redis (mediates background metadata extraction tasks)
- **Parser**: `busboy` (efficient file streaming parser)

## 📁 Key Files & Structure

- `src/index.js`: Express application entry point.
- `src/config/`: Configuration files for PostgreSQL, MinIO, Redis, and queues.
- `src/routes/`: Route bindings for uploading, downloading, listing, and verifying files.
- `src/middleware/`: Security boundary checking and internal microservice keys.

## ⚙️ Configuration (Environment Variables)

This service requires critical secrets configured in its environment:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Local service port | `4001` |
| `DB_HOST` | Hostname of the relational database | `db-users` |
| `DB_PORT` | Port of the relational database | `5432` |
| `DB_USER` | Relational database username | `shield` |
| `DB_PASSWORD` | Relational database password | `key_pass` |
| `DB_NAME` | Relational database name | `shield_db` |
| `MINIO_ENDPOINT` | Hostname of the MinIO object store | `minio-store` |
| `MINIO_PORT` | Port of the MinIO object store | `9000` |
| `MINIO_PUBLIC_HOST`| Browser-resolvable MinIO hostname | `localhost` |
| `MINIO_ACCESS_KEY`| MinIO root username | `shield` |
| `MINIO_SECRET_KEY`| MinIO root password | `key_pass` |
| `BUCKET_NAME` | Main S3 evidence storage bucket | `evidence` |
| `REDIS_HOST` | Redis cache and queue broker hostname | `shield-redis` |
| `REDIS_PORT` | Redis cache and queue broker port | `6379` |
| `LEDGER_URL` | Microservice URL for shield-ledger | `http://shield-ledger:4002` |
| `MOCK_LEDGER` | Fallback to in-memory ledger if true | `false` |
| `MASTER_KEY` | Symmetric key verifying internal communications | |
| `JWT_SECRET` | Secret key used to verify JWT user headers | |


## 📦 API Gateway Endpoints (`/api/evidence`)

- **`POST /upload`**: Streams multipart file data, computes SHA-256 hash on-the-fly, saves payload to MinIO under an anonymous UUID, writes case records to PostgreSQL, and calls Ledger Service to seal the evidence hash.
- **`GET /verify/:id`**: Recomputes the SHA-256 hash of the target MinIO file and compares it against the immutable record in the blockchain to evaluate system integrity.
- **`GET /download/:id`**: Issues a temporary, presigned HTTP download URL directly to the client's browser (zero-trust, Admin-blocked).
- **`GET /`**: List all tracked evidence records.
- **`GET /:id`**: Fetch a single evidence descriptor.

### Internal Microservice Routes (Admin/Watchdog Key Protected)
- **`GET /internal/list`**: keystone-paginated endpoint for background watchdogs to list existing evidence IDs.
- **`POST /internal/verify-batch`**: Batch verifier endpoint for rapid integrity validation.
