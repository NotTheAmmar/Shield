/**
 * SHIELD Gateway — Mock Data
 *
 * Centralised, removable mock dataset.
 * When real modules (shield-auth, shield-evidence, shield-ledger) are online,
 * replace these exports with proxy calls in the relevant route files.
 */

// ── Users ─────────────────────────────────────────────────────────────────

const USERS = [
  {
    id: 'usr_001',
    name: 'Rajesh Kumar',
    email: 'rajesh.kumar@police.gov.in',
    passwordHash: 'Shield@2025',
    role: 'police_officer',
    employeeId: 'MH/INS/2041',
    designation: 'Inspector',
    station: 'Andheri PS',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2025-01-10T08:00:00Z',
    lastLoginAt: '2025-03-18T09:15:00Z',
  },
  {
    id: 'usr_002',
    name: 'Priya Nair',
    email: 'priya.nair@court.gov.in',
    passwordHash: 'Shield@2025',
    role: 'judicial_authority',
    employeeId: 'MH/JUD/0033',
    designation: 'Additional Sessions Judge',
    station: 'Mumbai Sessions Court',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2025-01-15T10:00:00Z',
    lastLoginAt: '2025-03-17T14:30:00Z',
  },
  {
    id: 'usr_003',
    name: 'Admin Singh',
    email: 'admin@shield.gov.in',
    passwordHash: 'Admin@2025',
    role: 'admin',
    employeeId: 'SHIELD/ADM/001',
    designation: 'System Administrator',
    station: 'HQ',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00Z',
    lastLoginAt: '2025-03-18T08:00:00Z',
  },
  {
    id: 'usr_004',
    name: 'Vikram Patil',
    email: 'vikram.patil@police.gov.in',
    passwordHash: 'Shield@2025',
    role: 'police_officer',
    employeeId: 'MH/SHO/0099',
    designation: 'SHO',
    station: 'Bandra PS',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2025-02-01T09:00:00Z',
    lastLoginAt: '2025-03-16T11:45:00Z',
  },
  {
    id: 'usr_005',
    name: 'Suresh Mehta',
    email: 'suresh.mehta@court.gov.in',
    passwordHash: 'Shield@2025',
    role: 'judicial_authority',
    employeeId: 'MH/JUD/0040',
    designation: 'District Judge',
    station: 'Pune District Court',
    status: 'deactivated',
    mustChangePassword: false,
    createdAt: '2025-02-10T10:00:00Z',
    lastLoginAt: '2025-03-01T09:00:00Z',
  },
];

// ── FIRs ──────────────────────────────────────────────────────────────────

const FIRS = [
  {
    id: 'fir_001',
    firNumber: 'FIR/2025/MH/0042',
    fileName: 'FIR_MH0042_scan.pdf',
    mimeType: 'application/pdf',
    fileSize: 1245184,
    hash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
    ledgerTxId: 'immu_tx_0xFA3C29',
    ledgerTimestamp: '2025-03-10T08:32:00Z',
    uploadDate: '2025-03-10T08:31:55Z',
    uploadedBy: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
    status: 'verified',
    evidenceCount: 3,
    fileUrl: null, // not wired yet — MinIO
  },
  {
    id: 'fir_002',
    firNumber: 'FIR/2025/MH/0051',
    fileName: 'FIR_MH0051_scan.jpg',
    mimeType: 'image/jpeg',
    fileSize: 892416,
    hash: 'b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890ab',
    ledgerTxId: 'immu_tx_0xFB4D30',
    ledgerTimestamp: '2025-03-12T11:05:00Z',
    uploadDate: '2025-03-12T11:04:48Z',
    uploadedBy: { id: 'usr_004', name: 'Vikram Patil', employeeId: 'MH/SHO/0099' },
    status: 'pending',
    evidenceCount: 1,
    fileUrl: null,
  },
  {
    id: 'fir_003',
    firNumber: 'FIR/2025/MH/0063',
    fileName: 'FIR_MH0063_scan.pdf',
    mimeType: 'application/pdf',
    fileSize: 2097152,
    hash: 'c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
    ledgerTxId: 'immu_tx_0xFC5E41',
    ledgerTimestamp: '2025-03-15T14:22:00Z',
    uploadDate: '2025-03-15T14:22:11Z',
    uploadedBy: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
    status: 'tampered',
    evidenceCount: 5,
    fileUrl: null,
  },
  {
    id: 'fir_004',
    firNumber: 'FIR/2025/MH/0077',
    fileName: 'FIR_MH0077_scan.pdf',
    mimeType: 'application/pdf',
    fileSize: 1572864,
    hash: 'd4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    ledgerTxId: 'immu_tx_0xFD6F52',
    ledgerTimestamp: '2025-03-17T09:00:00Z',
    uploadDate: '2025-03-17T09:00:00Z',
    uploadedBy: { id: 'usr_004', name: 'Vikram Patil', employeeId: 'MH/SHO/0099' },
    status: 'verified',
    evidenceCount: 2,
    fileUrl: null,
  },
];

// ── Evidence ──────────────────────────────────────────────────────────────

const EVIDENCE = [
  {
    id: 'ev_101',
    firId: 'fir_001',
    firNumber: 'FIR/2025/MH/0042',
    fileName: 'crime_scene_photo_01.jpg',
    mimeType: 'image/jpeg',
    fileSize: 3145728,
    category: 'photo',
    description: 'Primary crime scene, south-east corner',
    hash: 'e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    ledgerTxId: 'immu_ev_0x001A',
    ledgerTimestamp: '2025-03-10T09:00:00Z',
    uploadDate: '2025-03-10T08:58:00Z',
    uploadedBy: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
    status: 'verified',
    fileUrl: null,
  },
  {
    id: 'ev_102',
    firId: 'fir_001',
    firNumber: 'FIR/2025/MH/0042',
    fileName: 'suspect_cctv_clip.mp4',
    mimeType: 'video/mp4',
    fileSize: 52428800,
    category: 'video',
    description: 'CCTV footage from nearby ATM — 21:30 to 21:45',
    hash: 'f67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
    ledgerTxId: 'immu_ev_0x001B',
    ledgerTimestamp: '2025-03-10T10:30:00Z',
    uploadDate: '2025-03-10T10:28:00Z',
    uploadedBy: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
    status: 'verified',
    fileUrl: null,
  },
  {
    id: 'ev_103',
    firId: 'fir_001',
    firNumber: 'FIR/2025/MH/0042',
    fileName: 'forensic_report.pdf',
    mimeType: 'application/pdf',
    fileSize: 524288,
    category: 'document',
    description: 'Forensic laboratory report',
    hash: '7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    ledgerTxId: 'immu_ev_0x001C',
    ledgerTimestamp: '2025-03-11T14:00:00Z',
    uploadDate: '2025-03-11T13:58:00Z',
    uploadedBy: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
    status: 'pending',
    fileUrl: null,
  },
  {
    id: 'ev_104',
    firId: 'fir_002',
    firNumber: 'FIR/2025/MH/0051',
    fileName: 'witness_audio.mp3',
    mimeType: 'audio/mpeg',
    fileSize: 8388608,
    category: 'audio',
    description: 'Witness statement recording',
    hash: '90abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    ledgerTxId: 'immu_ev_0x002A',
    ledgerTimestamp: '2025-03-12T12:00:00Z',
    uploadDate: '2025-03-12T11:58:00Z',
    uploadedBy: { id: 'usr_004', name: 'Vikram Patil', employeeId: 'MH/SHO/0099' },
    status: 'pending',
    fileUrl: null,
  },
  {
    id: 'ev_105',
    firId: 'fir_003',
    firNumber: 'FIR/2025/MH/0063',
    fileName: 'evidence_bag_photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2097152,
    category: 'photo',
    description: 'Tagged evidence bag with seal',
    hash: 'bcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890a',
    ledgerTxId: 'immu_ev_0x003A',
    ledgerTimestamp: '2025-03-15T15:00:00Z',
    uploadDate: '2025-03-15T14:58:00Z',
    uploadedBy: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
    status: 'tampered',
    fileUrl: null,
  },
];

// ── Audit Log ──────────────────────────────────────────────────────────────

const AUDIT_ENTRIES = [
  { id: 'aud_001', timestamp: '2025-03-18T09:15:00Z', user: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' }, role: 'police_officer', action: 'LOGIN', targetId: null, targetLabel: null, targetType: null, result: 'success', ipAddress: '10.0.1.5' },
  { id: 'aud_002', timestamp: '2025-03-18T09:18:00Z', user: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' }, role: 'police_officer', action: 'UPLOADED_FIR', targetId: 'fir_001', targetLabel: 'FIR/2025/MH/0042', targetType: 'fir', result: 'success', ipAddress: '10.0.1.5' },
  { id: 'aud_003', timestamp: '2025-03-18T09:25:00Z', user: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' }, role: 'police_officer', action: 'UPLOADED_EVIDENCE', targetId: 'ev_101', targetLabel: 'crime_scene_photo_01.jpg', targetType: 'evidence', result: 'success', ipAddress: '10.0.1.5' },
  { id: 'aud_004', timestamp: '2025-03-18T10:00:00Z', user: { id: 'usr_002', name: 'Priya Nair', employeeId: 'MH/JUD/0033' }, role: 'judicial_authority', action: 'LOGIN', targetId: null, targetLabel: null, targetType: null, result: 'success', ipAddress: '10.0.1.9' },
  { id: 'aud_005', timestamp: '2025-03-18T10:05:00Z', user: { id: 'usr_002', name: 'Priya Nair', employeeId: 'MH/JUD/0033' }, role: 'judicial_authority', action: 'VERIFIED_FIR', targetId: 'fir_001', targetLabel: 'FIR/2025/MH/0042', targetType: 'fir', result: 'success', ipAddress: '10.0.1.9' },
  { id: 'aud_006', timestamp: '2025-03-18T10:10:00Z', user: { id: 'usr_002', name: 'Priya Nair', employeeId: 'MH/JUD/0033' }, role: 'judicial_authority', action: 'VERIFIED_EVIDENCE', targetId: 'ev_101', targetLabel: 'crime_scene_photo_01.jpg', targetType: 'evidence', result: 'success', ipAddress: '10.0.1.9' },
  { id: 'aud_007', timestamp: '2025-03-17T14:30:00Z', user: { id: 'usr_002', name: 'Priya Nair', employeeId: 'MH/JUD/0033' }, role: 'judicial_authority', action: 'LOGIN', targetId: null, targetLabel: null, targetType: null, result: 'success', ipAddress: '10.0.1.9' },
  { id: 'aud_008', timestamp: '2025-03-16T11:45:00Z', user: { id: 'usr_004', name: 'Vikram Patil', employeeId: 'MH/SHO/0099' }, role: 'police_officer', action: 'UPLOADED_FIR', targetId: 'fir_002', targetLabel: 'FIR/2025/MH/0051', targetType: 'fir', result: 'success', ipAddress: '10.0.2.3' },
  { id: 'aud_009', timestamp: '2025-03-15T14:22:00Z', user: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' }, role: 'police_officer', action: 'UPLOADED_FIR', targetId: 'fir_003', targetLabel: 'FIR/2025/MH/0063', targetType: 'fir', result: 'success', ipAddress: '10.0.1.5' },
  { id: 'aud_010', timestamp: '2025-03-15T15:00:00Z', user: { id: 'usr_001', name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' }, role: 'police_officer', action: 'UPLOADED_EVIDENCE', targetId: 'ev_105', targetLabel: 'evidence_bag_photo.jpg', targetType: 'evidence', result: 'success', ipAddress: '10.0.1.5' },
  { id: 'aud_011', timestamp: '2025-03-18T08:00:00Z', user: { id: 'usr_003', name: 'Admin Singh', employeeId: 'SHIELD/ADM/001' }, role: 'admin', action: 'LOGIN', targetId: null, targetLabel: null, targetType: null, result: 'success', ipAddress: '10.0.0.1' },
  { id: 'aud_012', timestamp: '2025-03-17T09:00:00Z', user: { id: 'usr_004', name: 'Vikram Patil', employeeId: 'MH/SHO/0099' }, role: 'police_officer', action: 'UPLOADED_FIR', targetId: 'fir_004', targetLabel: 'FIR/2025/MH/0077', targetType: 'fir', result: 'success', ipAddress: '10.0.2.3' },
];

// ── Pagination helper ──────────────────────────────────────────────────────

/**
 * Paginate an array and return { data, pagination }.
 */
function paginate(array, page = 1, limit = 25) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const total = array.length;
  const totalPages = Math.max(1, Math.ceil(total / l));
  const start = (p - 1) * l;
  const data = array.slice(start, start + l);
  return { data, pagination: { page: p, limit: l, total, totalPages } };
}

/**
 * Make a simple mock JWT (not cryptographically secure — dev only).
 */
function makeMockToken(user) {
  // Use standard base64 (not base64url) so the browser's atob() can decode it directly
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    userId: user.id,
    role: user.role,
    employeeId: user.employeeId,
    exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes — government/banking standard
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64');
  return `${header}.${payload}.mock_sig`;
}

module.exports = { USERS, FIRS, EVIDENCE, AUDIT_ENTRIES, paginate, makeMockToken };
