const jwt = require('jsonwebtoken');
const http = require('http');

const token = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000000', role: 'Police Officer', email: 'admin@police.gov', name: 'Admin' },
    'replace_this_with_a_secure_random_string',
    { expiresIn: '1h' }
);

const { Pool } = require('pg');
const pool = new Pool({
    host: '127.0.0.1',
    port: 5432,
    user: 'your_postgres_user',
    password: 'your_secure_postgres_password',
    database: 'shield_db_name'
});

async function run() {
    try {
        const { rows } = await pool.query('SELECT id FROM evidence_source LIMIT 1');
        if (!rows.length) return console.log('No sources');
        const sourceId = rows[0].id;
        
        console.log('Fetching source:', sourceId);
        
        const req = http.request(`http://localhost:3000/api/evidence-source/${sourceId}/certificate`, {
            headers: {
                'Cookie': `shield_access_token=${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('Status:', res.statusCode);
                console.log('Headers:', res.headers);
                console.log('Data:', data.toString().substring(0, 1000));
            });
        });
        req.end();
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
run();
