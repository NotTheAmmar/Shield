const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4002;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Shield Ledger Service Running' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Immudb connection placeholder
// const immudb = require('immudb-node');
// ...

app.listen(PORT, () => {
    console.log(`Ledger Service running on port ${PORT}`);
});
