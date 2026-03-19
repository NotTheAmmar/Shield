const express = require('express');
const { FIRS, EVIDENCE, AUDIT_ENTRIES, paginate } = require('../mockData');

const router = express.Router();

// GET /api/firs — list with pagination, search, sort
router.get('/', (req, res) => {
  const { page = 1, limit = 25, search = '', sortBy = 'uploadDate', sortOrder = 'desc' } = req.query;

  // TODO: replace with shield-evidence service call
  let results = [...FIRS];

  if (search) {
    const q = search.toLowerCase();
    results = results.filter((f) =>
      f.firNumber.toLowerCase().includes(q) ||
      f.fileName.toLowerCase().includes(q)
    );
  }

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

// POST /api/firs — upload a new FIR
router.post('/', (req, res) => {
  // TODO: handle multipart/form-data, store in MinIO, record in shield-evidence + shield-ledger
  const { firNumber } = req.body;

  if (!firNumber) {
    return res.status(400).json({ error: 'firNumber is required.' });
  }

  const existing = FIRS.find((f) => f.firNumber === firNumber);
  if (existing) {
    return res.status(409).json({ error: `FIR number ${firNumber} already exists.` });
  }

  const user = req.user;
  const newFir = {
    id: `fir_${Date.now()}`,
    firNumber,
    fileName: req.file?.originalname || 'uploaded_fir.pdf',
    mimeType: req.file?.mimetype || 'application/pdf',
    fileSize: req.file?.size || 0,
    hash: `mock_hash_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ledgerTxId: `immu_tx_mock_${Date.now()}`,
    ledgerTimestamp: new Date().toISOString(),
    uploadDate: new Date().toISOString(),
    uploadedBy: user ? { id: user.userId, name: user.name || 'Unknown', employeeId: user.employeeId } : null,
    status: 'pending',
    evidenceCount: 0,
    fileUrl: null,
  };

  FIRS.unshift(newFir);
  res.status(201).json(newFir);
});

// GET /api/firs/:id — detail with linked evidence
router.get('/:id', (req, res) => {
  // TODO: replace with shield-evidence service call
  const fir = FIRS.find((f) => f.id === req.params.id);
  if (!fir) return res.status(404).json({ error: 'FIR not found.' });

  const linkedEvidence = EVIDENCE.filter((e) => e.firId === fir.id);
  res.json({ ...fir, linkedEvidence });
});

// POST /api/firs/:id/verify — trigger integrity check against ledger
router.post('/:id/verify', (req, res) => {
  // TODO: compare current hash vs ledger record in shield-ledger
  const fir = FIRS.find((f) => f.id === req.params.id);
  if (!fir) return res.status(404).json({ error: 'FIR not found.' });

  const match = fir.status !== 'tampered'; // Mock: tampered stays tampered
  const verifiedAt = new Date().toISOString();

  // Update status in mock store
  fir.status = match ? 'verified' : 'tampered';

  // Audit entry
  AUDIT_ENTRIES.unshift({
    id: `aud_${Date.now()}`,
    timestamp: verifiedAt,
    user: req.user ? { id: req.user.userId, name: req.user.name || 'Unknown', employeeId: req.user.employeeId } : null,
    role: req.user?.role,
    action: 'VERIFIED_FIR',
    targetId: fir.id,
    targetLabel: fir.firNumber,
    targetType: 'fir',
    result: 'success',
    ipAddress: req.ip || '0.0.0.0',
  });

  res.json({ firId: fir.id, match, status: fir.status, verifiedAt });
});

// GET /api/firs/:id/download — file download (stub — no MinIO yet)
router.get('/:id/download', (req, res) => {
  // TODO: stream from MinIO via shield-evidence
  const fir = FIRS.find((f) => f.id === req.params.id);
  if (!fir) return res.status(404).json({ error: 'FIR not found.' });
  if (!fir.fileUrl) return res.status(503).json({ error: 'File storage not yet connected.' });
  res.redirect(fir.fileUrl);
});

module.exports = router;
