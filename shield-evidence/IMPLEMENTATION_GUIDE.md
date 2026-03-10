# shield-evidence — Implementation Guide (v7)

> **26 architectural flaws addressed. Follow phases in order.**

---

## Phase Overview

| Phase | What you build | Flaws fixed |
|---|---|---|
| **1** | Folder structure + dependencies | #3, #15 |
| **2** | `docker-compose.yml` env vars | #8, #11 |
| **3** | `migrations/init.sql` — DB schema | #6, #7, #12 |
| **4** | `src/db.js` — Postgres pool | #20 |
| **5** | `src/config/minio.js` — dual clients | #11, #14 |
| **6** | `src/services/ledger.js` — mock adapter | #8 |
| **7** | `POST /upload` route | #1,#3,#4,#6,#9,#12,#13,#16–#26 |
| **8** | `GET /verify/:id` route | #2, #6, #9 |
| **9** | `GET /download/:id` route | #5, #11, #14 |
| **10** | Wire `src/index.js` + test | all |

---

## Phase 1 — Folder Structure & Dependencies

### 1.1 Create the folder structure

Inside `shield-evidence/`, create these files and folders (they don't exist yet):

```
shield-evidence/
├── migrations/
│   └── init.sql          ← Phase 3
├── src/
│   ├── config/
│   │   └── minio.js      ← Phase 5
│   ├── services/
│   │   └── ledger.js     ← Phase 6
│   ├── routes/
│   │   └── evidence.js   ← Phases 7, 8, 9
│   ├── db.js             ← Phase 4
│   └── index.js          ← Phase 10 (already exists, will modify)
```

**Commands to run from your terminal:**
```bash
cd /home/vishvambar/Shield/shield-evidence
mkdir -p migrations src/config src/services src/routes
touch migrations/init.sql
touch src/config/minio.js
touch src/services/ledger.js
touch src/routes/evidence.js
touch src/db.js
```

### 1.2 Update `package.json`

Open `shield-evidence/package.json`. Change the `dependencies` section to:

```json
{
  "name": "shield-evidence",
  "version": "1.0.0",
  "description": "Evidence Management Service for Shield",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "minio": "^7.1.1",
    "busboy": "^1.6.0",
    "pg": "^8.11.0",
    "dotenv": "^16.0.3"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
```

> **Why:** Removed `multer` (memory bomb — Flaw #3). Added `busboy` (streaming) and `pg` (Postgres client).

Then install:
```bash
npm install
```

---

## Phase 2 — Environment Variables in `docker-compose.yml`

Open `/home/vishvambar/Shield/docker-compose.yml`.

Find the `shield-evidence:` service block (around line 92). Replace its `environment:` section with:

```yaml
  shield-evidence:
    build: ./shield-evidence
    container_name: shield-evidence
    command: npm run dev
    volumes:
      - ./shield-evidence:/usr/src/app
      - /usr/src/app/node_modules
    networks:
      - shield-network
    ports:
      - "4001:4001"
    environment:
      MINIO_ENDPOINT: minio-store        # Docker-internal hostname
      MINIO_PUBLIC_HOST: localhost        # Browser-accessible (Flaw #11)
      MINIO_PORT: "9000"
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      MOCK_LEDGER: "true"                # Dev unblock (Flaw #8)
      LEDGER_URL: http://shield-ledger:4002
      DB_HOST: db-users
      DB_PORT: "5432"
      DB_USER: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: ${POSTGRES_DB}
      MASTER_KEY: ${MASTER_KEY}
      BUCKET_NAME: evidence
    depends_on:
      - minio-store
      - shield-ledger
```

Also add these to your `.env` file (copy from `.env.example` if not already done):
```
POSTGRES_USER=shield
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=shield
MINIO_ROOT_USER=shield
MINIO_ROOT_PASSWORD=secure_minio_password
JWT_SECRET=secure_jwt_secret
MASTER_KEY=32_byte_base64_key
```

---

## Phase 3 — Database Schema (`migrations/init.sql`)

Open `shield-evidence/migrations/init.sql` and write:

```sql
-- No pgcrypto needed (UUID generated in Node.js — Flaw #15)
-- UUID primary key has no DEFAULT because Node generates it (Flaw #12)

CREATE TABLE IF NOT EXISTS evidence (
  id           UUID         PRIMARY KEY,
  fir_id       VARCHAR(100) NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  bucket_name  VARCHAR(100) NOT NULL,
  object_key   VARCHAR(500) NOT NULL,
  sha256_hash  VARCHAR(64)  NOT NULL,
  uploaded_by  UUID,                        -- X-User-Id from gateway (Flaw #6)
  uploaded_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL       PRIMARY KEY,
  evidence_id  UUID         REFERENCES evidence(id),
  action       VARCHAR(50),                 -- 'UPLOAD' | 'VERIFY'
  result       VARCHAR(20),                 -- 'OK' | 'TAMPERED'
  actor_id     UUID,                        -- X-User-Id (Flaw #6)
  checked_at   TIMESTAMPTZ  DEFAULT NOW()
);
```

> **Key decisions:**
> - No `minio_url` — use `bucket_name` + `object_key` instead (Flaw #7)
> - `id UUID PRIMARY KEY` with no `DEFAULT` — Node generates this before touching the DB (Flaw #12)
> - No `CREATE EXTENSION pgcrypto` — would fail without superuser, and we don't need it (Flaw #15)

---

## Phase 4 — Postgres Pool (`src/db.js`)

Open `src/db.js` and write the entire file:

```js
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,                  // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err);
});

module.exports = pool;
```

> **Why a pool?** A pool reuses connections instead of opening a new TCP connection per request. The `max: 10` cap means you'll never exhaust Postgres's connection limit. `client.release()` in Phase 7 returns connections to this pool (Flaw #20).

---

## Phase 5 — MinIO Dual Clients (`src/config/minio.js`)

Open `src/config/minio.js` and write:

```js
const Minio = require('minio');

// Internal client — uses Docker service name (minio-store)
// Use this for: putObject, getObject, removeObject
const minioInternal = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT,   // 'minio-store' inside Docker
  port:      parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:    false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

// Public client — uses localhost (or real domain in prod)
// Use this ONLY for: presignedGetObject
// Generates URLs the browser can actually resolve (Flaw #11)
const minioPublic = new Minio.Client({
  endPoint:  process.env.MINIO_PUBLIC_HOST, // 'localhost' in dev
  port:      parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:    false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.BUCKET_NAME || 'evidence';

module.exports = { minioInternal, minioPublic, BUCKET };
```

> **Why two clients?** `minioInternal.putObject()` routes through Docker's internal network (`minio-store:9000`). But `presignedGetObject()` generates a URL that Ziyad's browser will open — if it says `http://minio-store:9000/...`, the browser can't resolve `minio-store`. The public client generates `http://localhost:9000/...` instead (Flaw #11).

---

## Phase 6 — Ledger Service (`src/services/ledger.js`)

Open `src/services/ledger.js` and write:

```js
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// storeHash: lock the evidence hash into ImmuDB via shield-ledger
async function storeHash(evidenceId, hash) {
  if (process.env.MOCK_LEDGER === 'true') {
    // Dev mode: simulate network delay, return success (Flaw #8)
    await sleep(50);
    console.log(`[MOCK LEDGER] storeHash: ${evidenceId} → ${hash}`);
    return { ok: true, mock: true };
  }

  const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidenceId, hash }),
  });

  if (!res.ok) throw new Error(`Ledger store failed: ${res.status}`);
  return res.json();
}

// getHash: retrieve the immutable hash from ImmuDB (Flaw #2)
async function getHash(evidenceId) {
  if (process.env.MOCK_LEDGER === 'true') {
    // In mock mode, fall back to Postgres hash for local testing only
    // (In production this MUST come from ImmuDB)
    console.log(`[MOCK LEDGER] getHash: ${evidenceId}`);
    return null; // caller handles null by checking Postgres
  }

  const res = await fetch(`${process.env.LEDGER_URL}/api/ledger/${evidenceId}`);
  if (!res.ok) throw new Error(`Ledger get failed: ${res.status}`);
  const data = await res.json();
  return data.hash;
}

module.exports = { storeHash, getHash };
```

> **Why MOCK_LEDGER?** You cannot wait for the ledger owner to finish their service before testing yours. With `MOCK_LEDGER=true` in your `.env`, every ledger call succeeds instantly. When the real shield-ledger is ready, set `MOCK_LEDGER=false` (Flaw #8).

---

## Phase 7 — Upload Route (`POST /api/evidence/upload`)

Open `src/routes/evidence.js`. This is the most complex file — write each section carefully.

```js
const express    = require('express');
const busboy     = require('busboy');
const crypto     = require('crypto');
const path       = require('path');
const { PassThrough } = require('stream');

const pool                          = require('../db');
const { minioInternal, BUCKET }     = require('../config/minio');
const { minioPublic }               = require('../config/minio');
const ledger                        = require('../services/ledger');

const router = express.Router();

// ─────────────────────────────────────────────
// POST /api/evidence/upload
// ─────────────────────────────────────────────
router.post('/upload', (req, res) => {

  // ── State flags (all responses go through send()) ──────────────────
  let responseSent = false;                                        // Flaw #25
  const send = (status, body) => {
    if (!responseSent) { responseSent = true; res.status(status).json(body); }
  };

  // ── Validate headers ────────────────────────────────────────────────
  const userId = req.headers['x-user-id'];                        // Flaw #6
  if (!userId) return res.status(400).json({ error: 'Missing X-User-Id header' });

  // ── Pre-generate UUID (before MinIO upload) ─────────────────────────
  const evidenceId = crypto.randomUUID();                          // Flaw #12

  // ── Mutable metadata captured from busboy events ───────────────────
  let fir_id, capturedFilename, capturedMime;
  let fileProcessed = false;                                       // Flaw #22

  // ── Busboy init with file size limit ────────────────────────────────
  const bb = busboy({                                              // Flaw #18
    headers: req.headers,
    limits: { fileSize: 500 * 1024 * 1024 },   // 500 MB hard cap
  });

  // ── Capture text fields ─────────────────────────────────────────────
  bb.on('field', (name, val) => {                                 // Flaw #16
    if (name === 'fir_id') fir_id = val;
  });

  // ── Handle file stream ──────────────────────────────────────────────
  bb.on('file', (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    capturedFilename = filename;
    capturedMime     = mimeType;

    // Guard: only the first file is processed                     // Flaw #22
    if (fileProcessed) {
      fileStream.resume();    // drain silently
      return;
    }
    fileProcessed = true;

    // Guard: fir_id must arrive before the file arrives           // Flaw #16, #21
    if (!fir_id) {
      fileStream.resume();    // drain to avoid socket hang        // Flaw #21
      return send(400, { error: 'fir_id field must come before the file in FormData' });
    }

    // Build object key: UUID + original extension                 // Flaw #19
    const ext       = path.extname(filename) || '';
    const objectKey = `${evidenceId}${ext}`;

    // Build streaming pipeline
    const hashStream  = crypto.createHash('sha256');
    const passThrough = new PassThrough();

    // MinIO upload promise                                         // Flaw #17
    let rejectPut;
    const putPromise = new Promise((resolve, reject) => {
      rejectPut = reject;                                          // Flaw #23
      minioInternal
        .putObject(BUCKET, objectKey, passThrough, null, { 'Content-Type': mimeType })
        .then(resolve)
        .catch(reject);
    });

    // Hash finalization promise (manual wrap — streams aren't Promises)  // Flaw #17
    const hashPromise = new Promise((resolve, reject) => {
      hashStream.on('finish', () => resolve(hashStream.digest('hex')));
      hashStream.on('error', reject);                              // Flaw #23
    });

    // Wire error handlers → they MUST reject() not just log       // Flaw #23
    passThrough.on('error', rejectPut);
    fileStream.on('error',  rejectPut);

    // Disk bomb: hit size limit → abort, clean up, 413            // Flaw #18
    fileStream.on('limit', async () => {
      fileStream.destroy();   // triggers 'error' → rejectPut fires
      try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) {}
      send(413, { error: 'File too large. Maximum allowed size is 500MB.' });
    });

    // Pipe data through both hash and MinIO
    fileStream.pipe(hashStream);
    fileStream.pipe(passThrough);

    // Await BOTH MinIO confirmation AND hash digest              // Flaw #13
    Promise.all([putPromise, hashPromise])
      .then(async ([, hash]) => {
        const client = await pool.connect();                      // Flaw #20
        try {
          await client.query('BEGIN');                            // Flaw #4, #10

          await client.query(
            `INSERT INTO evidence
               (id, fir_id, filename, bucket_name, object_key, sha256_hash, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [evidenceId, fir_id, capturedFilename, BUCKET, objectKey, hash, userId]
          );

          await ledger.storeHash(evidenceId, hash);              // Flaw #1

          await client.query('COMMIT');
          send(201, { id: evidenceId, sha256_hash: hash });
        } catch (err) {
          await client.query('ROLLBACK');
          try { await minioInternal.removeObject(BUCKET, objectKey); } catch (_) {}
          console.error('Upload transaction failed:', err.message);
          send(500, { error: 'Upload failed. Transaction rolled back.' });
        } finally {
          client.release();                                       // Flaw #20
        }
      })
      .catch((err) => {
        console.error('Stream pipeline failed:', err.message);
        send(500, { error: 'File stream failed.' });             // Flaw #25
      });
  });

  // Guard: request ends with no file at all                      // Flaw #26
  bb.on('close', () => {
    if (!fileProcessed && !responseSent) {
      send(400, { error: 'No file found in the request.' });
    }
  });

  req.pipe(bb);   // IGNITION — must be last line                // Flaw #24
});
```

---

## Phase 8 — Verify Route (`GET /api/evidence/verify/:id`)

In the **same** `src/routes/evidence.js` file, add below the upload route:

```js
// ─────────────────────────────────────────────
// GET /api/evidence/verify/:id
// ─────────────────────────────────────────────
router.get('/verify/:id', async (req, res) => {
  const { id } = req.params;
  const actorId = req.headers['x-user-id'];

  try {
    // 1. Fetch record
    const { rows } = await pool.query(
      'SELECT * FROM evidence WHERE id = $1', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });
    const record = rows[0];

    // 2. Stream file from MinIO and compute live hash (Flaw #2)
    const liveHash = await new Promise((resolve, reject) => {
      minioInternal.getObject(record.bucket_name, record.object_key, (err, stream) => {
        if (err) return reject(err);
        const hash = crypto.createHash('sha256');
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end',  ()    => resolve(hash.digest('hex')));
        stream.on('error', reject);                               // Flaw #9
      });
    });

    // 3. Get immutable hash from ledger (NOT from Postgres)      // Flaw #2
    const ledgerHash = await ledger.getHash(id);

    // 4. In MOCK mode, compare against Postgres hash
    const truthHash = ledgerHash || record.sha256_hash;
    const result    = (liveHash === truthHash) ? 'OK' : 'TAMPERED';

    // 5. Write to audit log                                       // Flaw #6
    await pool.query(
      `INSERT INTO audit_log (evidence_id, action, result, actor_id)
       VALUES ($1, 'VERIFY', $2, $3)`,
      [id, result, actorId]
    );

    // 6. Return result
    res.json({ status: result });

  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});
```

---

## Phase 9 — Download Route (`GET /api/evidence/download/:id`)

In the same file, add below the verify route:

```js
// ─────────────────────────────────────────────
// GET /api/evidence/download/:id
// ─────────────────────────────────────────────
router.get('/download/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      'SELECT bucket_name, object_key FROM evidence WHERE id = $1', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Evidence not found' });

    const { bucket_name, object_key } = rows[0];

    // Use PUBLIC client so the URL is browser-resolvable   // Flaw #11
    // 30 seconds — enough to start a download, too short to leak  // Flaw #14
    const url = await minioPublic.presignedGetObject(bucket_name, object_key, 30);

    res.json({ url });
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: 'Could not generate download URL' });
  }
});

module.exports = router;
```

---

## Phase 10 — Wire `src/index.js` + First Run

Open `src/index.js` and replace its entire content:

```js
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const evidenceRoutes = require('./routes/evidence');
const pool           = require('./db');

const app  = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// Evidence routes
app.use('/api/evidence', evidenceRoutes);

// Start server
app.listen(PORT, () => console.log(`Evidence Service running on port ${PORT}`));

// Graceful shutdown — release Postgres pool
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — closing pg pool');
  await pool.end();
  process.exit(0);
});
```

### First run

**Step 1: Start infrastructure**
```bash
cd /home/vishvambar/Shield
npm run dev:infra
```

Wait ~15 seconds for containers to be healthy.

**Step 2: Create MinIO bucket**

Open http://localhost:9001 in your browser.
- Login: user = `shield`, password = `secure_minio_password`
- Click **Create Bucket** → name it `evidence` → Create

**Step 3: Run SQL migration**
```bash
docker exec -i db-users psql -U shield -d shield \
  < shield-evidence/migrations/init.sql
```

Expected output:
```
CREATE TABLE
CREATE TABLE
```

**Step 4: Start evidence service**
```bash
cd shield-evidence
npm run dev
```

Expected output:
```
Evidence Service running on port 4001
```

---

## Postman Test Suite (Run in Order)

### Setup
- Base URL: `http://localhost:4001`
- Add header to every request: `X-User-Id: 00000000-0000-0000-0000-000000000001`

### Test 1 — Valid upload
- Method: `POST /api/evidence/upload`
- Body: `form-data`
  - Key: `fir_id` (Text) → Value: `FIR-2024-001`
  - Key: `file` (File) → attach any PDF or image
- ✅ Expect: `201` response with `id` and `sha256_hash` (64 hex chars)

### Test 2 — Verify (OK)
- Method: `GET /api/evidence/verify/{id}` (use id from Test 1)
- ✅ Expect: `{ "status": "OK" }`

### Test 3 — Download
- Method: `GET /api/evidence/download/{id}`
- ✅ Expect: `{ "url": "http://localhost:9000/evidence/..." }` — paste URL in browser, file opens with correct extension

### Test 4 — Tamper detection
- Open http://localhost:9001, navigate to `evidence` bucket
- Delete the file, upload a completely different file with the **same object_key**
- `GET /api/evidence/verify/{id}` again
- ✅ Expect: `{ "status": "TAMPERED" }`

### Test 5 — File too large
- Upload a file > 500MB
- ✅ Expect: `413 Payload Too Large`

### Test 6 — Missing header
- Remove `X-User-Id` header, upload
- ✅ Expect: `400`

### Test 7 — Wrong field order
- Put `file` field before `fir_id` in form-data
- ✅ Expect: `400 fir_id must precede file`

### Test 8 — No file
- POST with only `fir_id` in body, no file
- ✅ Expect: `400 No file found in the request`

### Test 9 — Two files
- Add two file fields in form-data
- ✅ Expect: `201` (first file accepted; second silently ignored)

### Test 10 — Pool stability
- Temporarily set `MOCK_LEDGER=false` (ledger is down) and upload 10 times
- All 10 return `500`
- Set `MOCK_LEDGER=true` and upload again
- ✅ Expect: `201` (proves pool connections were properly released each time)

---

## GitHub Workflow

```bash
# Create your feature branch
git checkout -b feature/evidence-service

# After each phase, commit with a meaningful message
git add shield-evidence/
git commit -m "feat(evidence): Phase 1 — setup structure and dependencies"
git commit -m "feat(evidence): Phase 3 — add SQL migration schema"
# ... etc

# When ready for PR
git push origin feature/evidence-service
# Open PR on GitHub → Closes #<issue-number>
```

**Suggested GitHub Issues to create:**
1. `Setup shield-evidence folder structure and dependencies`
2. `Design and write SQL migration for evidence + audit_log tables`
3. `Implement POST /api/evidence/upload with streaming + ledger integration`
4. `Implement GET /verify and GET /download endpoints`
5. `Write Postman collection and share with Ziyad`
