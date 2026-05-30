# SHIELD — Metadata Extractor Service (`shield-metadata-extractor`)

The **Metadata Extractor** is an asynchronous queue worker service built with Node.js and **BullMQ**. It is designed to consume jobs from a processing queue, pull newly-uploaded media evidence files from MinIO, extract file metadata (such as EXIF data for photos, length/resolution for videos, page count/structure for documents), and record these details in the central database case logs.

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Queue System**: BullMQ + Redis (asynchronous task broker)
- **Object Storage Client**: MinIO SDK (pulls raw objects)
- **Database Client**: PostgreSQL `pg` pool (writes extracted metadata)

## 📁 Key Files & Operations

- `worker.js`: Self-contained queue consumer that connects to Redis, listens for new file upload events, downloads the targeted file stream, processes file headers, extracts Exif/media metadata, updates the evidence records database, and handles errors or retries.

## ⚙️ Configuration (Environment Variables)

The queue worker depends heavily on relational, cache, and object storage connectivity:

| Variable | Description | Default |
|---|---|---|
| `DB_HOST` | Hostname of the PostgreSQL database | `db-users` |
| `DB_PORT` | PostgreSQL listening port | `5432` |
| `REDIS_HOST` | Hostname of the Redis queue broker | `shield-redis` |
| `REDIS_PORT` | Port of the Redis broker | `6379` |
| `MINIO_ENDPOINT` | Hostname of the MinIO object store | `minio-store` |
| `MINIO_PORT` | HTTP port for MinIO | `9000` |
| `BUCKET_NAME` | S3 bucket where raw files live | `evidence` |
