const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Internal services bypass
    if (process.env.MASTER_KEY && req.headers['x-internal-service-key'] === process.env.MASTER_KEY) {
        req.user = { id: 'INTERNAL_SERVICE', role: 'Super Admin' };
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role, ... }
        next();
    } catch (err) {
        console.error('[AUTH ERROR]', err.message);
        return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
    }
};
