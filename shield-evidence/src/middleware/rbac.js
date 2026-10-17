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
  'judicial_magistrate': 'judicial_magistrate',
  'Judicial Magistrate': 'judicial_magistrate',
  'sessions_judge': 'sessions_judge',
  'Sessions Judge': 'sessions_judge',
  'advocate': 'advocate',
  'Advocate': 'advocate',
  'admin': 'admin',
  'Admin': 'admin',
  'forensic_expert': 'forensic_expert',
  'Forensic Expert': 'forensic_expert'
};

const normalizeRole = (role) => ROLE_MAP[role] || (role ? role.toLowerCase().replace(/[\s_]/g, '') : null);

const requireRoles = (allowedRoles) => {
    // Normalize the allowed roles list
    const normalizedAllowed = allowedRoles.map(r => normalizeRole(r));

    return (req, res, next) => {
        // req.user is populated by the auth.js middleware
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Unauthorized: User role not found in token' });
        }

        const userRole = normalizeRole(req.user.role);

        const isAllowed = normalizedAllowed.includes(userRole) ||
            (normalizedAllowed.includes('judicial_authority') && ['judicial_magistrate', 'sessions_judge'].includes(userRole));

        if (!isAllowed) {
            return res.status(403).json({
                error: `Forbidden: Requires one of the following roles: [${allowedRoles.join(', ')}]`,
                currentRole: req.user.role
            });
        }

        next();
    };
};

requireRoles.normalizeRole = normalizeRole;
module.exports = requireRoles;

