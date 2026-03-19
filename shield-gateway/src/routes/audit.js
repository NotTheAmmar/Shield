const express = require('express');
const { AUDIT_ENTRIES, paginate } = require('../mockData');

const router = express.Router();

// GET /api/audit — paginated audit log with optional filters
router.get('/', (req, res) => {
  const { page = 1, limit = 50, action = '', targetId = '', userId = '' } = req.query;

  // TODO: replace with call to dedicated audit/ledger service
  let results = [...AUDIT_ENTRIES].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  if (action) results = results.filter((e) => e.action === action);
  if (targetId) results = results.filter((e) => e.targetId === targetId);
  if (userId) results = results.filter((e) => e.user?.id === userId);

  res.json(paginate(results, page, limit));
});

module.exports = router;
