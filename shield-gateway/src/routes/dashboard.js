const express = require('express');
const { USERS, FIRS, EVIDENCE, AUDIT_ENTRIES } = require('../mockData');

const router = express.Router();

// GET /api/dashboard/stats
// Returns role-specific stats and recent activity for the authenticated user.
router.get('/stats', (req, res) => {
  // TODO: replace with calls to shield-auth, shield-evidence, shield-ledger
  const role = req.user?.role;
  const userId = req.user?.userId;

  const recentActivity = AUDIT_ENTRIES
    .filter((e) => !userId || e.user.id === userId)
    .slice(0, 6)
    .map((e) => ({ id: e.id, timestamp: e.timestamp, action: e.action, targetLabel: e.targetLabel }));

  let stats = {};

  if (role === 'police_officer') {
    const myFirs = FIRS.filter((f) => f.uploadedBy?.id === userId);
    const myEvidence = EVIDENCE.filter((e) => e.uploadedBy?.id === userId);
    stats = {
      firsUploaded: myFirs.length,
      evidenceFiles: myEvidence.length,
      verified: myEvidence.filter((e) => e.status === 'verified').length,
      pendingVerification: myEvidence.filter((e) => e.status === 'pending').length,
    };
  } else if (role === 'judicial_authority') {
    stats = {
      totalFirs: FIRS.length,
      totalEvidence: EVIDENCE.length,
      verifiedIntegrity: EVIDENCE.filter((e) => e.status === 'verified').length,
      tamperAlerts: FIRS.filter((f) => f.status === 'tampered').length + EVIDENCE.filter((e) => e.status === 'tampered').length,
    };
  } else if (role === 'admin') {
    const recentLogins = AUDIT_ENTRIES.filter(
      (e) => e.action === 'LOGIN' && new Date(e.timestamp) > new Date(Date.now() - 86400000)
    ).length;
    stats = {
      totalUsers: USERS.length,
      activeUsers: USERS.filter((u) => u.status === 'active').length,
      deactivatedUsers: USERS.filter((u) => u.status === 'deactivated').length,
      recentLogins,
    };
  } else {
    // Fallback: police_officer defaults with global counts
    stats = {
      firsUploaded: FIRS.length,
      evidenceFiles: EVIDENCE.length,
      verified: EVIDENCE.filter((e) => e.status === 'verified').length,
      pendingVerification: EVIDENCE.filter((e) => e.status === 'pending').length,
    };
  }

  res.json({ stats, recentActivity });
});

module.exports = router;
