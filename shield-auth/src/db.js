const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'db-users',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle pg client', err);
    process.exit(-1);
});

module.exports = pool;
