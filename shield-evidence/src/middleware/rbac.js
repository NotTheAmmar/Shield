const requireRoles = (allowedRoles) => {
    return (req, res, next) => {
        // req.user is populated by the auth.js middleware
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Unauthorized: User role not found in token' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Forbidden: Requires one of the following roles: [${allowedRoles.join(', ')}]`,
                currentRole: req.user.role
            });
        }

        next();
    };
};

module.exports = requireRoles;
