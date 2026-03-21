const express = require('express');
const cors = require('cors');
require('dotenv').config();

const runMigrations = require('./migrate');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;

// Trust the gateway proxy so req.ip resolves accurately (IP Masking Fix)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Native routing
const auth = require('./middleware/auth');
app.use('/api/auth', authRouter);
app.use('/api/admin', auth, adminRouter);

// Start the server and ensure DB is ready natively
app.listen(PORT, async () => {
    console.log(`Auth Service running on port ${PORT}`);
    await runMigrations();
});
