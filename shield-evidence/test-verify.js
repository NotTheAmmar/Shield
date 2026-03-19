require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: 5432, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME
});
const crypto = require('crypto');
const { minioInternal } = require('./src/config/minio');

async function test(id) {
  try {
    const { rows } = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]);
    console.log("DB record found:", rows.length);
    const record = rows[0];
    const liveHash = await new Promise((resolve, reject) => {
      minioInternal.getObject(record.bucket_name, record.object_key, (err, stream) => {
        if (err) return reject(err);
        const hash = crypto.createHash('sha256');
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
      });
    });
    console.log("Live hash computed:", liveHash);
    
    await pool.query(
      `INSERT INTO audit_log (evidence_id, action, result, actor_id) VALUES ($1, 'VERIFY', $2, $3)`,
      [id, 'OK', '00000000-0000-0000-0000-000000000001']
    );
    console.log("Audit log inserted");
  } catch(e) { console.error("ERROR:", e); }
  finally { pool.end(); }
}
test("3bfa020e-17f9-45dc-8719-9495f5891b32");
