const express = require('express');
const { USERS, AUDIT_ENTRIES, makeMockToken } = require('../mockData');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required.' });
  }

  // Simulate brute-force delay — always takes the same time to prevent timing attacks
  // TODO: replace with call to shield-auth service
  const user = USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.role === role
  );

  // Deliberately vague error — do not reveal whether email or password was wrong
  if (!user || user.passwordHash !== password) {
    return res.status(401).json({ error: 'Invalid credentials or incorrect role selected.' });
  }

  if (user.status === 'deactivated') {
    return res.status(403).json({ error: 'Your account has been deactivated. Contact the administrator.' });
  }

  // Record login in mock audit (in-memory, not persisted)
  AUDIT_ENTRIES.unshift({
    id: `aud_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: { id: user.id, name: user.name, employeeId: user.employeeId },
    role: user.role,
    action: 'LOGIN',
    targetId: null,
    targetLabel: null,
    targetType: null,
    result: 'success',
    ipAddress: req.ip || '0.0.0.0',
  });

  const { passwordHash, ...safeUser } = user;
  return res.json({
    token: makeMockToken(user),
    user: safeUser,
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // TODO: token invalidation in shield-auth
  // For now, just acknowledge — client already clears localStorage
  res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
