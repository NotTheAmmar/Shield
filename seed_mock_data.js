require('./shield-evidence/node_modules/dotenv').config({ path: './shield-evidence/.env' });
const { Client } = require('./shield-evidence/node_modules/pg');
const Minio = require('./shield-evidence/node_modules/minio');
const crypto = require('crypto');
// Safety guard for destruction testing script
if (process.env.NODE_ENV === 'production') {
    console.error("🚨 FATAL SECURITY ERROR: Cannot run mock data truncation in production environment.");
    process.exit(1);
}

// Re-using config from integrity_watchdog.js
const POSTGRES_USER = process.env.POSTGRES_USER || 'shield';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'secure_password';
const POSTGRES_DB = process.env.POSTGRES_DB || 'shield';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : 9000;
const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || 'shield';
const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || 'secure_minio_password';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'evidence';

async function seed() {
    console.log("Seeding mock data for watchdog testing...");

    const minioClient = new Minio.Client({
        endPoint: MINIO_ENDPOINT,
        port: MINIO_PORT,
        useSSL: false,
        accessKey: MINIO_ACCESS_KEY,
        secretKey: MINIO_SECRET_KEY
    });

    const pgClient = new Client({
        user: POSTGRES_USER,
        host: DB_HOST,
        database: POSTGRES_DB,
        password: POSTGRES_PASSWORD,
        port: DB_PORT,
    });

    try {
        console.log("Connecting to PostgreSQL at " + DB_HOST + ":" + DB_PORT + "...");
        await pgClient.connect();
        console.log("Connected to PostgreSQL");

        // 1. Clear old data from both tables (CASCADE propagates)
        await pgClient.query('TRUNCATE TABLE fir CASCADE');

        // 2. Insert mock FIR
        const firId = crypto.randomUUID();
        await pgClient.query(`
            INSERT INTO fir (id, case_category, description, location, reporting_officer) 
            VALUES ($1, $2, $3, $4, $5)
        `, [
            firId, 
            'Cyber Crime', 
            'Mock FIR generated for testing.', 
            'Digital Space', 
            crypto.randomUUID()
        ]);

        // 3. Insert mock Evidence
        const evidenceId = crypto.randomUUID();
        const testContent = "This is a strictly confidential First Information Report (FIR) evidence document.";
        const hash = crypto.createHash('sha256').update(testContent).digest('hex');
        const objectKey = `${evidenceId}.txt`;
        const filename = 'fir_document.txt';

        await pgClient.query(`
            INSERT INTO evidence (id, fir_id, filename, bucket_name, object_key, sha256_hash) 
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [evidenceId, firId, filename, MINIO_BUCKET, objectKey, hash]);

        console.log(`Inserted mock FIR and Evidence into DB with hash: ${hash}`);

        // 4. Setup MinIO Bucket
        console.log("Checking MinIO at " + MINIO_ENDPOINT + ":" + MINIO_PORT + "...");
        const exists = await minioClient.bucketExists(MINIO_BUCKET);
        if (!exists) {
            await minioClient.makeBucket(MINIO_BUCKET, 'us-east-1');
            console.log(`Created MinIO bucket: ${MINIO_BUCKET}`);
        }

        // 5. Upload mock file to MinIO
        const buffer = Buffer.from(testContent, 'utf-8');
        await minioClient.putObject(MINIO_BUCKET, objectKey, buffer);

        console.log(`Uploaded mock file '${objectKey}' to MinIO`);
        console.log("✅ Seed complete.");
        process.exit(0);

    } catch (err) {
        console.error("Seed failed:", err.message);
        process.exit(1);
    } finally {
        await pgClient.end();
    }
}

seed();
