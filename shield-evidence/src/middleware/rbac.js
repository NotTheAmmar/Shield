/**
 * Role name normalizer — maps various role formats to a canonical form.
 * Gateway mock tokens use: police_officer, judicial_authority, admin
 * Evidence service originally used: Police Officer, Super Admin
 */
const ROLE_MAP = {
  'police_officer': 'police_officer',
  'Police Officer': 'police_officer',
  'judicial_authority': 'judicial_authority',
  'Judicial Authority': 'judicial_authority',
  'admin': 'admin',
  'Admin': 'admin',
  'super_admin': 'admin',
  'Super Admin': 'admin',
};

const normalizeRole = (role) => ROLE_MAP[role] || role?.toLowerCase();

const requireRoles = (allowedRoles) => {
    // Normalize the allowed roles list
    const normalizedAllowed = allowedRoles.map(r => normalizeRole(r));

    return (req, res, next) => {
        // req.user is populated by the auth.js middleware
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Unauthorized: User role not found in token' });
        }

        const userRole = normalizeRole(req.user.role);

        if (!normalizedAllowed.includes(userRole)) {
            return res.status(403).json({
                error: `Forbidden: Requires one of the following roles: [${allowedRoles.join(', ')}]`,
                currentRole: req.user.role
            });
        }

        next();
    };
};

module.exports = requireRoles;

