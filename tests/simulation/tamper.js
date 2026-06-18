const { minioInternal, BUCKET } = require('./src/config/minio');
const pool = require('./src/db');

async function tamper() {
    // get latest evidence
    const { rows } = await pool.query('SELECT * FROM evidence ORDER BY uploaded_at DESC LIMIT 1');
    if (!rows.length) {
        console.log('No evidence found to tamper');
        process.exit(1);
    }
    const record = rows[0];
    console.log(`Tampering evidence ID: ${record.id}, ObjectKey: ${record.object_key}`);

    // overwrite object with garbage
    const garbage = Buffer.from('this is corrupted data, the hash will not match the blockchain');
    await new Promise((resolve, reject) => {
        minioInternal.putObject(BUCKET, record.object_key, garbage, null, { 'Content-Type': 'text/plain' }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    console.log('Tampered successfully in MinIO.');
    process.exit(0);
}
tamper().catch(err => {
    console.error(err);
    process.exit(1);
});
