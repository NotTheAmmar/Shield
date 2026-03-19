const express = require('express');
const { USERS, AUDIT_ENTRIES, paginate, makeMockToken } = require('../mockData');

const router = express.Router();

// GET /api/admin/users — list users with filters
router.get('/users', (req, res) => {
  const { page = 1, limit = 25, search = '', role = '', status = '' } = req.query;

  // TODO: replace with shield-auth service call
  let results = USERS.map(({ passwordHash, ...u }) => u); // strip passwords

  if (search) {
    const q = search.toLowerCase();
    results = results.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.employeeId.toLowerCase().includes(q)
    );
  }

  if (role) results = results.filter((u) => u.role === role);
  if (status) results = results.filter((u) => u.status === status);

  res.json(paginate(results, page, limit));
});

// POST /api/admin/users — create a new user
router.post('/users', (req, res) => {
  const { name, email, role, designation = '', station = '', temporaryPassword } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ error: 'name, email, and role are required.' });
  }

  const VALID_ROLES = ['police_officer', 'judicial_authority', 'admin'];
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const existing = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  // Auto-generate employee ID
  const prefix = role === 'police_officer' ? 'MH/OFF' : role === 'judicial_authority' ? 'MH/JUD' : 'SHIELD/ADM';
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);

  const newUser = {
    id: `usr_${Date.now()}`,
    name,
    email,
    passwordHash: temporaryPassword || 'TempPass!23',
    role,
    employeeId: `${prefix}/${suffix}`,
    designation,
    station,
    status: 'active',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  USERS.push(newUser);

  // Audit
  AUDIT_ENTRIES.unshift({
    id: `aud_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: req.user ? { id: req.user.userId, name: req.user.name || 'Admin', employeeId: req.user.employeeId } : null,
    role: req.user?.role,
    action: 'USER_CREATED',
    targetId: newUser.id,
    targetLabel: newUser.name,
    targetType: 'user',
    result: 'success',
    ipAddress: req.ip || '0.0.0.0',
  });

  const { passwordHash, ...safeUser } = newUser;
  return res.status(201).json(safeUser);
});

// PATCH /api/admin/users/:id — update user (status, designation, etc.)
router.patch('/users/:id', (req, res) => {
  const idx = USERS.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const allowed = ['status', 'designation', 'station', 'role'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  Object.assign(USERS[idx], updates);

  const auditAction = updates.status === 'deactivated'
    ? 'USER_DEACTIVATED'
    : updates.status === 'active'
    ? 'USER_REACTIVATED'
    : 'USER_UPDATED';

  AUDIT_ENTRIES.unshift({
    id: `aud_${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: req.user ? { id: req.user.userId, name: req.user.name || 'Admin', employeeId: req.user.employeeId } : null,
    role: req.user?.role,
    action: auditAction,
    targetId: USERS[idx].id,
    targetLabel: USERS[idx].name,
    targetType: 'user',
    result: 'success',
    ipAddress: req.ip || '0.0.0.0',
  });

  const { passwordHash, ...safeUser } = USERS[idx];
  res.json(safeUser);
});

module.exports = router;
