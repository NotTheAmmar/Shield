const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Payload should contain { id: "uuid", role: "Police Officer", ... }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};
