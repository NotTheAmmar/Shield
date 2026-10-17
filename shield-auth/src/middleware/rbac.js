const ROLE_MAP = {
  'admin': 'admin',
  'Admin': 'admin',
  'police_officer': 'police_officer',
  'Police Officer': 'police_officer',
  'forensic_expert': 'forensic_expert',
  'Forensic Expert': 'forensic_expert',
  'judicial_magistrate': 'judicial_magistrate',
  'Judicial Magistrate': 'judicial_magistrate',
  'sessions_judge': 'sessions_judge',
  'Sessions Judge': 'sessions_judge',
  'advocate': 'advocate',
  'Advocate': 'advocate',
  'judicial_authority': 'judicial_authority',
  'Judicial Authority': 'judicial_authority'
};

const normalizeRole = (role) => ROLE_MAP[role] || (role ? role.toLowerCase().replace(/[\s_]/g, '') : null);

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
