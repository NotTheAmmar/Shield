const pool = require('../db');

module.exports = (req, res, next) => {
    // Listen for the request to completely finish so we don't block the API response
    res.on('finish', () => {
        // If auth.js rejected them (401/403), req.user won't exist, but we MUST still log the attempt.
        const userId = (req.user && req.user.id) ? req.user.id : null;

        // req.ip works behind proxies if app.set('trust proxy', true) is used in index.js
        pool.query(
            `INSERT INTO api_audit_log (user_id, method, endpoint, ip_address, status_code) 
       VALUES ($1, $2, $3, $4, $5)`,
            [userId, req.method, req.originalUrl, req.ip, res.statusCode]
        ).catch(err => {
            console.error('CRITICAL: API Audit Log failed to write:', err.message);
        });
    });

    next();
};
