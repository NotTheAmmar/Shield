require('dotenv').config();
const { Client } = require('pg');
const Minio = require('minio');
const crypto = require('crypto');

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
        await pgClient.connect();
        console.log("Connected to PostgreSQL");

        // 1. Create table
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS evidence (
                id SERIAL PRIMARY KEY,
                object_name VARCHAR(255),
                file_hash VARCHAR(64)
            )
        `);

        // 2. Clear old data
        await pgClient.query('TRUNCATE TABLE evidence');

        // 3. Insert mock data
        const testContent = "This is a strictly confidential First Information Report (FIR) evidence document.";
        const hash = crypto.createHash('sha256').update(testContent).digest('hex');
        const objectName = 'case_101/fir_document.txt';

        await pgClient.query(`
            INSERT INTO evidence (object_name, file_hash) 
            VALUES ($1, $2)
        `, [objectName, hash]);

        console.log(`Inserted mock record into DB with hash: ${hash}`);

        // 4. Setup MinIO Bucket
        const exists = await minioClient.bucketExists(MINIO_BUCKET);
        if (!exists) {
            await minioClient.makeBucket(MINIO_BUCKET, 'us-east-1');
            console.log(`Created MinIO bucket: ${MINIO_BUCKET}`);
        }

        // 5. Upload mock file to MinIO
        const buffer = Buffer.from(testContent, 'utf-8');
        await minioClient.putObject(MINIO_BUCKET, objectName, buffer);

        console.log(`Uploaded mock file '${objectName}' to MinIO`);
        console.log("✅ Seed complete.");

    } catch (err) {
        console.error("Seed failed:", err);
    } finally {
        await pgClient.end();
    }
}

seed();
