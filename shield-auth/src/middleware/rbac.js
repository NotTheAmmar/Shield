const ROLE_MAP = {
  'police_officer': 'police_officer',
  'Police Officer': 'police_officer',
  'judicial_authority': 'judicial_authority',
  'Judicial Authority': 'judicial_authority',
  'admin': 'admin',
  'Admin': 'admin'
};

const normalizeRole = (role) => ROLE_MAP[role] || role?.toLowerCase();

module.exports = (allowedRoles) => {
    const normalizedAllowed = allowedRoles.map(r => normalizeRole(r));
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Access denied: Authentication required.' });
        }

        const userRole = normalizeRole(req.user.role);

        if (normalizedAllowed.includes(userRole)) {
            return next();
        }

        return res.status(403).json({ 
            error: 'Access denied: Insufficient privileges.',
            requiredRoles: allowedRoles,
            yourRole: req.user.role
        });
    };
};
