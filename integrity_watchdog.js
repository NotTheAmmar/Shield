require('dotenv').config();
const { Client } = require('pg');
const Minio = require('minio');
const crypto = require('crypto');

// Configuration from environment variables
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'password';
const POSTGRES_DB = process.env.POSTGRES_DB || 'shield';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : 9000;
const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'evidence';

async function main() {
    console.log("🛡️  Starting SHIELD Integrity Watchdog...");

    // Initialize PostgreSQL Client
    const pgClient = new Client({
        user: POSTGRES_USER,
        host: DB_HOST,
        database: POSTGRES_DB,
        password: POSTGRES_PASSWORD,
        port: DB_PORT,
    });

    // Initialize MinIO Client
    const minioClient = new Minio.Client({
        endPoint: MINIO_ENDPOINT,
        port: MINIO_PORT,
        useSSL: false,
        accessKey: MINIO_ACCESS_KEY,
        secretKey: MINIO_SECRET_KEY
    });

    let hasErrors = false;

    try {
        await pgClient.connect();
        console.log("✅ Connected to PostgreSQL database.");

        // We assume an 'evidence' table exists with columns 'object_name' and 'file_hash' (SHA-256)
        // If the table doesn't exist, we'll gracefully handle the error.
        const res = await pgClient.query(`
            SELECT object_name, file_hash 
            FROM evidence
        `);

        if (res.rows.length === 0) {
            console.log("ℹ️  No evidence records found in the database. Exiting.");
            process.exit(0);
        }

        console.log(`🔍 Found ${res.rows.length} evidence records. Starting hash verification...`);
        console.log("--------------------------------------------------");

        for (const row of res.rows) {
            const { object_name, file_hash: dbHash } = row;

            if (!object_name || !dbHash) {
                console.warn(`⚠️  Skipping record due to missing object_name or file_hash.`);
                continue;
            }

            try {
                // Check if the file exists in MinIO
                const stat = await minioClient.statObject(MINIO_BUCKET, object_name).catch(err => null);
                
                if (!stat) {
                    console.error(`🚨 TAMPER ALERT [MISSING]: File '${object_name}' not found in MinIO!`);
                    hasErrors = true;
                    continue;
                }

                // Stream the file and compute SHA-256
                const dataStream = await minioClient.getObject(MINIO_BUCKET, object_name);
                const hash = crypto.createHash('sha256');

                dataStream.on('data', function(chunk) {
                    hash.update(chunk);
                });

                await new Promise((resolve, reject) => {
                    dataStream.on('end', () => {
                        const computedHash = hash.digest('hex');
                        
                        if (computedHash === dbHash) {
                            console.log(`✅ INTEGRITY VERIFIED: '${object_name}'`);
                        } else {
                            console.error(`🚨 TAMPER ALERT [MISMATCH]: '${object_name}'`);
                            console.error(`   Expected: ${dbHash}`);
                            console.error(`   Computed: ${computedHash}`);
                            hasErrors = true;
                        }
                        resolve();
                    });
                    
                    dataStream.on('error', (err) => {
                        console.error(`Error reading stream for '${object_name}':`, err);
                        hasErrors = true;
                        reject(err);
                    });
                });

            } catch (err) {
                console.error(`❌ Error verifying '${object_name}':`, err.message);
                hasErrors = true;
            }
        }

        console.log("--------------------------------------------------");
        if (hasErrors) {
            console.error("❌ Integrity verification completed with ERRORS or TAMPERING detected.");
            process.exitCode = 1;
        } else {
            console.log("✅ All evidence files successfully verified.");
        }

    } catch (err) {
        if (err.code === '42P01') {
            console.error("❌ Error: The 'evidence' table does not exist in the database.");
            console.log("   Since the schema is not defined in the source code yet, please create the table first:");
            console.log("   CREATE TABLE evidence (id SERIAL PRIMARY KEY, object_name VARCHAR(255), file_hash VARCHAR(64));");
        } else if (err.code === 'ECONNREFUSED') {
            console.error("❌ Error: Connection Refused. It looks like the PostgreSQL database is not running!");
            console.log(`   Attempted to connect to: ${DB_HOST}:${DB_PORT}`);
            console.log("   Please start your database using 'npm run dev:infra' or Docker Desktop.");
        } else {
            console.error("❌ Fatal Error:", err);
        }
        process.exitCode = 1;

    } finally {
        await pgClient.end();
    }
}

main();
