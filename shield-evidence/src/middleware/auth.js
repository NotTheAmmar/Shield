const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Internal Service Account Bypass
    const internalKey = req.headers['x-internal-service-key'];
    if (internalKey && internalKey === process.env.INTERNAL_SERVICE_KEY) {
        req.user = { id: 'INTERNAL-WORKER-000', role: 'Super Admin' };
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // MOCK_AUTH mode: decode JWT payload without signature verification
    // Used in development where the gateway generates unsigned mock JWTs
    if (process.env.MOCK_AUTH === 'true') {
        try {
            const parts = token.split('.');
            if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                req.user = payload;
                return next();
            }
        } catch (err) {
            return res.status(403).json({ error: 'Forbidden: Invalid mock token' });
        }
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Payload should contain { id: "uuid", role: "Police Officer", ... }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};

