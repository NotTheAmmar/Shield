const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Shield Auth Service Running' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Placeholder database connection needed here
// const { Pool } = require('pg');
// const pool = new Pool({
//   host: process.env.DB_HOST,
//   user: process.env.POSTGRES_USER,
//   ...
// });

app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
});
