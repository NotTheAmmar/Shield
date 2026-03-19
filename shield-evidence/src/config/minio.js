const Minio = require('minio');

// Internal client — routes through Docker network (minio-store:9000)
// Use for: putObject, getObject, removeObject
const minioInternal = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

// Public client — uses browser-accessible hostname (localhost in dev)
// Use ONLY for: presignedGetObject (Flaw #11)
const minioPublic = new Minio.Client({
    endPoint: process.env.MINIO_PUBLIC_HOST,
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.BUCKET_NAME || 'evidence';

module.exports = { minioInternal, minioPublic, BUCKET };
