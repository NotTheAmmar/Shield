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

| Variable | Description |
|---|---|
| `PORT` | Local service port (defaults to `4001`) |
| `DB_HOST` | Hostname of the relational database (`db-users`) |
| `MINIO_ENDPOINT` | Hostname of the MinIO object store (`minio-store`) |
| `MINIO_ACCESS_KEY`| MinIO root username |
| `MINIO_SECRET_KEY`| MinIO root password |
| `REDIS_HOST` | Redis cache and queue broker hostname (`redis`) |
| `MASTER_KEY` | Symmetric key verifying internal service-to-service communications |
| `JWT_SECRET` | Secret key used to verify JWT headers passed by Gateway |

## 📦 API Gateway Endpoints (`/api/evidence`)

- **`POST /upload`**: Streams multipart file data, computes SHA-256 hash on-the-fly, saves payload to MinIO under an anonymous UUID, writes case records to PostgreSQL, and calls Ledger Service to seal the evidence hash.
- **`GET /verify/:id`**: Recomputes the SHA-256 hash of the target MinIO file and compares it against the immutable record in Immudb to evaluate system integrity.
- **`GET /download/:id`**: Issues a temporary, presigned HTTP download URL directly to the client's browser (zero-trust, Admin-blocked).
- **`GET /`**: List all tracked evidence records.
- **`GET /:id`**: Fetch a single evidence descriptor.

### Internal Microservice Routes (Admin/Watchdog Key Protected)
- **`GET /internal/list`**: keystone-paginated endpoint for background watchdogs to list existing evidence IDs.
- **`POST /internal/verify-batch`**: Batch verifier endpoint for rapid integrity validation.
