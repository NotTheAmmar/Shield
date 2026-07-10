const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Internal Service Account Bypass
    const internalKey = req.headers['x-internal-service-key'];
    if (internalKey && process.env.MASTER_KEY && internalKey === process.env.MASTER_KEY) {
        req.user = { id: '00000000-0000-0000-0000-000000000000', role: 'Admin' };
        return next();
    }

    let authHeader = req.headers.authorization;

    // Fallback: Check cookies for token if proxy bypassed gateway
    if (!authHeader && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').map(c => c.trim());
        const accessCookie = cookies.find(c => c.startsWith('shield_access_token='));
        if (accessCookie) {
            authHeader = 'Bearer ' + accessCookie.substring('shield_access_token='.length);
        }
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};

