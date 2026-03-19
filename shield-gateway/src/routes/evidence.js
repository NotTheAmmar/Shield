const express = require('express');
const { FIRS, EVIDENCE, AUDIT_ENTRIES, paginate } = require('../mockData');

const router = express.Router();

// GET /api/evidence — list with pagination, search, filters
router.get('/', (req, res) => {
  const { page = 1, limit = 25, search = '', status = '', category = '', sortBy = 'uploadDate', sortOrder = 'desc' } = req.query;

  // TODO: replace with shield-evidence service call
  let results = [...EVIDENCE];

  if (search) {
    const q = search.toLowerCase();
    results = results.filter((e) =>
      e.fileName.toLowerCase().includes(q) ||
      e.firNumber.toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q)
    );
  }

  if (status) results = results.filter((e) => e.status === status);
  if (category) results = results.filter((e) => e.category === category);

  results.sort((a, b) => {
    let va = a[sortBy] ?? '';
    let vb = b[sortBy] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortOrder === 'asc' ? -1 : 1;
    if (va > vb) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  res.json(paginate(results, page, limit));
});

// POST /api/evidence — upload evidence file(s)
router.post('/', (req, res) => {
  // TODO: handle multipart/form-data, store in MinIO, ledger entry
  const { firId, category = 'other', description = '' } = req.body;

  if (!firId) {
    return res.status(400).json({ error: 'firId is required.' });
  }

  const fir = FIRS.find((f) => f.id === firId);
  if (!fir) {
    return res.status(404).json({ error: 'Linked FIR not found.' });
  }

  const user = req.user;
  const files = req.files || (req.file ? [req.file] : []);
  const uploaded = files.length
    ? files.map((file) => {
        const ev = {
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          firId,
          firNumber: fir.firNumber,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          category,
          description,
          hash: `mock_hash_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          ledgerTxId: `immu_ev_mock_${Date.now()}`,
          ledgerTimestamp: new Date().toISOString(),
          uploadDate: new Date().toISOString(),
          uploadedBy: user ? { id: user.userId, name: user.name || 'Unknown', employeeId: user.employeeId } : null,
          status: 'pending',
          fileUrl: null,
        };
        EVIDENCE.unshift(ev);
        fir.evidenceCount = (fir.evidenceCount || 0) + 1;
        return ev;
      })
    : [];

  res.status(201).json({ uploaded });
});

// GET /api/evidence/:id — single evidence detail
router.get('/:id', (req, res) => {
  // TODO: replace with shield-evidence call
  const ev = EVIDENCE.find((e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence record not found.' });
  res.json(ev);
});

// POST /api/evidence/:id/verify — integrity check against ledger
router.post('/:id/verify', (req, res) => {
  // TODO: compare against shield-ledger
  const ev = EVIDENCE.find((e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence record not found.' });

  const match = ev.status !== 'tampered';
  const verifiedAt = new Date().toISOString();
  ev.status = match ? 'verified' : 'tampered';

  AUDIT_ENTRIES.unshift({
    id: `aud_${Date.now()}`,
    timestamp: verifiedAt,
    user: req.user ? { id: req.user.userId, name: req.user.name || 'Unknown', employeeId: req.user.employeeId } : null,
    role: req.user?.role,
    action: 'VERIFIED_EVIDENCE',
    targetId: ev.id,
    targetLabel: ev.fileName,
    targetType: 'evidence',
    result: 'success',
    ipAddress: req.ip || '0.0.0.0',
  });

  res.json({ evidenceId: ev.id, match, status: ev.status, verifiedAt });
});

// GET /api/evidence/:id/download — stream file (stub)
router.get('/:id/download', (req, res) => {
  // TODO: stream from MinIO
  const ev = EVIDENCE.find((e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence record not found.' });
  if (!ev.fileUrl) return res.status(503).json({ error: 'File storage not yet connected.' });
  res.redirect(ev.fileUrl);
});

module.exports = router;
