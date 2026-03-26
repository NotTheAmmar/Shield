module.exports = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Access denied: Authentication required.' });
        }

        if (allowedRoles.includes(req.user.role)) {
            return next();
        }

        return res.status(403).json({ 
            error: 'Access denied: Insufficient privileges.',
            requiredRoles: allowedRoles,
            yourRole: req.user.role
        });
    };
};
