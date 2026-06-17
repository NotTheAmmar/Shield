const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
});

async function run() {
    try {
        const { rows } = await pool.query('SELECT id, email, name, employee_id, role, status FROM users');
        console.log('Users in DB:');
        console.table(rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
