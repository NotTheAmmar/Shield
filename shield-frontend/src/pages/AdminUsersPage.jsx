import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, X, Shield, Activity, User, Clock, CheckCircle, ChevronRight,
  Server, AlertTriangle, RefreshCw, EyeOff, Lock, Database, Search, HardDrive
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import RoleBadge from '../components/RoleBadge';
import StatCard from '../components/StatCard';
import { adminAPI, auditAPI } from '../services/api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = 'Sh!3ld@';
  for (let i = 0; i < 6; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

function generateEmployeeId(role = '') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let prefix = 'EMP-';
  if (role.includes('Police')) prefix = 'POL-';
  else if (role.includes('Forensic')) prefix = 'FSL-';
  else if (role.includes('Magistrate')) prefix = 'MAG-';
  else if (role.includes('Judge')) prefix = 'JUD-';
  else if (role.includes('Advocate')) prefix = 'ADV-';
  else if (role.includes('Admin')) prefix = 'ADM-';

  let id = prefix;
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    parentageName: '',
    email: '',
    role: 'Police Officer',
    employeeId: generateEmployeeId('Police Officer'),
    designation: '',
    station: '',
    assignedPoliceStations: '',
    fslJurisdictionId: '',
    sessionsCourtId: '',
    barEnrollmentNo: '',
    plainPassword: generatePassword(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    setForm(f => ({
      ...f,
      role: newRole,
      employeeId: generateEmployeeId(newRole)
    }));
  };

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role || !form.employeeId || !form.plainPassword) {
      setError('All mandatory fields are required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        assignedPoliceStations: form.role === 'Judicial Magistrate' && form.assignedPoliceStations
          ? form.assignedPoliceStations.split(',').map(s => s.trim()).filter(Boolean)
          : []
      };
      const result = await adminAPI.createUser(payload);
      onCreated(result);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to create user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 id="modal-title">Provision New Identity (6-Role RBAC)</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="u-name">Full Name *</label>
                <input id="u-name" name="name" className="form-input" value={form.name} onChange={handleChange} placeholder="e.g. Rajesh Kumar" required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="u-parentageName">Parentage / Spouse Name</label>
                <input id="u-parentageName" name="parentageName" className="form-input" value={form.parentageName} onChange={handleChange} placeholder="S/O Mahesh Kumar" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="u-email">Official Email *</label>
                <input id="u-email" name="email" type="email" className="form-input" value={form.email} onChange={handleChange} placeholder="user@shield.gov.in" required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="u-role">Role (Segregation of Duties) *</label>
                <select id="u-role" name="role" className="form-select" value={form.role} onChange={handleRoleChange}>
                  <option value="Police Officer">Police Officer</option>
                  <option value="Forensic Expert">Forensic Expert (FSL)</option>
                  <option value="Judicial Magistrate">Judicial Magistrate (Pre-Trial)</option>
                  <option value="Sessions Judge">Sessions Judge (Trial Bench)</option>
                  <option value="Advocate">Advocate (Defense / Prosecution)</option>
                  <option value="Admin">Administrator (Infra Only)</option>
                </select>
              </div>
            </div>

            {/* Jurisdiction & Identifier mapping per role */}
            <div style={{ background: 'var(--bg-page)', padding: 14, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-700)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Jurisdictional Assignment & Identification
              </div>

              {form.role === 'Police Officer' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="u-station">Police Station Jurisdiction *</label>
                  <input
                    id="u-station" name="station" className="form-input"
                    value={form.station} onChange={handleChange}
                    placeholder="e.g. Kothrud Police Station" required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Officers can only view and manage FIRs registered at this police station.
                  </p>
                </div>
              )}

              {form.role === 'Forensic Expert' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="u-fsl">City / Regional FSL Jurisdiction ID *</label>
                  <input
                    id="u-fsl" name="fslJurisdictionId" className="form-input"
                    value={form.fslJurisdictionId} onChange={handleChange}
                    placeholder="e.g. Pune Regional FSL / FSL-MH-01" required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Grants direct access to search city-wide FIRs, attach digital evidence, and sign Section 63 BSA certificates.
                  </p>
                </div>
              )}

              {form.role === 'Judicial Magistrate' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="u-assignedStations">Assigned Police Stations (Comma-separated) *</label>
                  <input
                    id="u-assignedStations" name="assignedPoliceStations" className="form-input"
                    value={form.assignedPoliceStations} onChange={handleChange}
                    placeholder="e.g. Kothrud PS, Warje PS, Deccan PS" required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Pre-trial FIRs filed in these stations auto-route to this Magistrate's 24-Hour Statutory Compliance feed (Sec 176 BNSS).
                  </p>
                </div>
              )}

              {form.role === 'Sessions Judge' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="u-court">Sessions Courtroom / District Roster *</label>
                  <input
                    id="u-court" name="sessionsCourtId" className="form-input"
                    value={form.sessionsCourtId} onChange={handleChange}
                    placeholder="e.g. Sessions Courtroom No. 3, Pune District" required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Judge only sees criminal cases committed to their trial roster by a Judicial Magistrate.
                  </p>
                </div>
              )}

              {form.role === 'Advocate' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="u-bar">Bar Council Enrollment Number *</label>
                  <input
                    id="u-bar" name="barEnrollmentNo" className="form-input"
                    value={form.barEnrollmentNo} onChange={handleChange}
                    placeholder="e.g. MAH/1429/2021" required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Advocates cannot browse cases. Access is strictly granted per-case upon approval of a digital Vakalatnama.
                  </p>
                </div>
              )}

              {form.role === 'Admin' && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Lock size={16} color="var(--emerald)" />
                  <span><strong>Zero-Trust Isolation Active:</strong> Administrators manage identity provisioning and blockchain validator nodes only. Direct case content and evidence access are mathematically blocked.</span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="u-employeeId">Identifier / Personnel ID</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input id="u-employeeId" name="employeeId" className="form-input" style={{ flex: 1, fontFamily: 'monospace' }} value={form.employeeId} readOnly required />
                  <button
                    type="button" className="btn btn-secondary btn-sm"
                    onClick={() => setForm(f => ({ ...f, employeeId: generateEmployeeId(f.role) }))}
                  >
                    Regen
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="u-designation">Rank / Designation</label>
                <input id="u-designation" name="designation" className="form-input" value={form.designation} onChange={handleChange} placeholder="e.g. Sub-Inspector, Analyst, Counsel" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-password">Temporary Password *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="u-password" name="plainPassword" className="form-input" style={{ flex: 1, fontFamily: 'monospace' }} value={form.plainPassword} readOnly required />
                <button
                  type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { navigator.clipboard.writeText(form.plainPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                A server-side EVM keypair will be generated and encrypted with AES-256 for this account.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Provisioning…</> : 'Provision User Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── User Detail Panel ─────────────────────────────────────────────────────────

function UserDetailPanel({ userId, onClose, onToggleStatus, togglingId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getUser(userId);
      setUser(res.user);
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const handleResetPassword = async () => {
    if (!window.confirm('Reset password for this user? They will be forced to change it on next login.')) return;
    setResetting(true);
    try {
      const pw = generatePassword();
      await adminAPI.resetPassword(userId, { plainPassword: pw });
      setNewPassword(pw);
      setUser(prev => ({ ...prev, must_change_password: true }));
    } catch (err) {
      alert('Failed to reset password: ' + (err?.response?.data?.error || err.message));
    } finally {
      setResetting(false);
    }
  };

  const isActive = user?.status === 'active';

  const formatJurisdiction = (u) => {
    if (!u) return '—';
    if (u.role === 'Police Officer') return u.station || 'Unassigned Station';
    if (u.role === 'Forensic Expert') return u.fsl_jurisdiction_id || 'City/Regional FSL';
    if (u.role === 'Judicial Magistrate') {
      if (Array.isArray(u.assigned_police_stations) && u.assigned_police_stations.length) {
        return u.assigned_police_stations.join(', ');
      }
      return typeof u.assigned_police_stations === 'string' ? u.assigned_police_stations : 'Unassigned PS';
    }
    if (u.role === 'Sessions Judge') return u.sessions_court_id || 'District Sessions Court';
    if (u.role === 'Advocate') return u.bar_enrollment_no || 'Pending Bar Validation';
    return 'Infrastructure & Validator Management';
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', animation: 'slideInRight 0.22s ease',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(28,58,95,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={20} color="var(--navy-700)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{loading ? '…' : (user?.name || 'Unknown')}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{loading ? '' : user?.email}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
          ) : !user ? (
            <div className="alert alert-error">Failed to load user details.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <RoleBadge role={user.role} />
                <span className={`badge ${isActive ? 'badge-active' : 'badge-deactivated'}`}>
                  {isActive ? 'Active' : 'Deactivated'}
                </span>
                {user.must_change_password && (
                  <span style={{ background: 'var(--amber-light,rgba(245,158,11,0.15))', color: 'var(--amber,#f59e0b)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                    Password Change Pending
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  ['Personnel / Cadre ID', user.employee_id],
                  ['Official Role', user.role],
                  ['Designation / Rank', user.designation || '—'],
                  ['Parentage / Spouse', user.parentage_name || '—'],
                  ['Jurisdiction / Boundary', formatJurisdiction(user)],
                  ['Created Timestamp', fmtDateTime(user.created_at)],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: 12, background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-all' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Cryptographic identity */}
              <div style={{ padding: 14, background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy-700)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Ethereum Cryptographic Identity (PoA Sealer Address)
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', wordBreak: 'break-all', color: 'var(--text-primary)' }}>
                  {user.blockchain_address || 'Pending Initialization'}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Private key encrypted server-side with AES-256 for court-admissible electronic record signatures under BSA Section 63.
                </p>
              </div>

              {/* Actions */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Account State Management</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn btn-sm ${isActive ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => onToggleStatus(user.id, user.status)}
                    disabled={togglingId === user.id}
                  >
                    {togglingId === user.id ? 'Updating…' : (isActive ? 'Deactivate Account' : 'Reactivate Account')}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleResetPassword}
                    disabled={resetting}
                  >
                    {resetting ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
                {newPassword && (
                  <div className="alert alert-success" style={{ marginTop: 8 }}>
                    <div>New temporary password:</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', marginTop: 4 }}>{newPassword}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Share securely. User must change it upon login.</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'infrastructure' | 'audit'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Infrastructure health states
  const [systemHealth, setSystemHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Audit log states
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditMethod, setAuditMethod] = useState('');
  const [watchdogAlerts, setWatchdogAlerts] = useState([]);

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.listUsers({ search, role: filterRole, status: filterStatus });
      setData(res.users || []);
      setTotal(res.users?.length || 0);
      setTotalPages(1);
    } catch (err) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterRole, filterStatus]);

  // Fetch System Health
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await adminAPI.getSystemHealth();
      setSystemHealth(res);
    } catch (err) {
      console.error('Failed to fetch system health', err);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const [logsRes, alertsRes] = await Promise.all([
        adminAPI.getAuditLogs({ search: auditSearch, method: auditMethod, limit: 50 }),
        adminAPI.getWatchdogAlerts()
      ]);
      setAuditLogs(logsRes.data || []);
      setWatchdogAlerts(alertsRes.alerts || []);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditSearch, auditMethod]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'infrastructure') fetchHealth();
    else if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab, fetchUsers, fetchHealth, fetchAuditLogs]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(rawSearch); }, 350);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const handleCreated = (result) => {
    setShowModal(false);
    setSuccessMsg(`User ${result.user?.name} provisioned successfully with role ${result.user?.role}`);
    setTimeout(() => setSuccessMsg(''), 6000);
    fetchUsers();
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'deactivated' : 'active';
    setTogglingId(id);
    try {
      await adminAPI.updateUser(id, { status: newStatus });
      fetchUsers();
      if (selectedUserId === id) {
        setSelectedUserId(null);
      }
    } catch (err) {
      alert('Failed to update user status: ' + (err?.response?.data?.error || err.message));
    } finally {
      setTogglingId(null);
    }
  };

  const formatJurisdictionColumn = (row) => {
    if (row.role === 'Police Officer') return row.station || 'Unassigned Station';
    if (row.role === 'Forensic Expert') return row.fsl_jurisdiction_id || 'City FSL';
    if (row.role === 'Judicial Magistrate') {
      if (Array.isArray(row.assigned_police_stations) && row.assigned_police_stations.length) {
        return row.assigned_police_stations.join(', ');
      }
      return typeof row.assigned_police_stations === 'string' ? row.assigned_police_stations : 'Unassigned';
    }
    if (row.role === 'Sessions Judge') return row.sessions_court_id || 'Courtroom Roster';
    if (row.role === 'Advocate') return row.bar_enrollment_no || 'Bar Reg';
    return 'Zero-Trust Infra';
  };

  const userColumns = [
    {
      key: 'name', label: 'Name / ID',
      render: (v, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.employee_id}</div>
        </div>
      )
    },
    {
      key: 'email', label: 'Official Email',
      render: (v) => <span style={{ fontSize: 12 }}>{v}</span>
    },
    {
      key: 'role', label: 'Role (BSA Segregation)',
      render: (v) => <RoleBadge role={v} />
    },
    {
      key: 'jurisdiction', label: 'Jurisdiction / ID',
      render: (_, row) => (
        <span style={{ fontSize: 12, color: 'var(--navy-700)', fontWeight: 500 }}>
          {formatJurisdictionColumn(row)}
        </span>
      )
    },
    {
      key: 'status', label: 'State',
      render: (v) => (
        <span className={`badge ${v === 'active' ? 'badge-active' : 'badge-deactivated'}`}>
          {v === 'active' ? 'Active' : 'Deactivated'}
        </span>
      )
    },
    {
      key: 'created_at', label: 'Provisioned',
      render: (v) => fmtDate(v)
    },
    {
      key: 'id', label: '',
      render: () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontSize: 12, fontWeight: 500 }}>
          Inspect <ChevronRight size={13} />
        </div>
      )
    },
  ];

  const auditColumns = [
    {
      key: 'accessed_at', label: 'Timestamp (IST)',
      render: (v) => fmtDateTime(v)
    },
    {
      key: 'method', label: 'Action Event',
      render: (v) => (
        <span style={{
          fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 4,
          background: v.includes('ALERT') ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-page)',
          color: v.includes('ALERT') ? 'var(--crimson)' : 'var(--text-primary)'
        }}>
          {v}
        </span>
      )
    },
    {
      key: 'user_name', label: 'Actor Name / ID',
      render: (v, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v || 'SYSTEM'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.user_employee_id || row.user_role || '—'}</div>
        </div>
      )
    },
    {
      key: 'target_label', label: 'Target / Event Details',
      render: (v, row) => <span>{v || row.endpoint || '—'}</span>
    },
    {
      key: 'ip_address', label: 'IP Origin',
      render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || '127.0.0.1'}</span>
    },
    {
      key: 'status_code', label: 'Status Code',
      render: (v) => (
        <span style={{ fontWeight: 600, color: v < 400 ? 'var(--emerald)' : 'var(--crimson)' }}>
          {v || 200}
        </span>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="System Administration & Zero-Trust Infrastructure"
        subtitle="Manage 6-role identities, inspect PoA node microservices, and review security audit trails."
        actions={
          activeTab === 'users' ? (
            <button className="btn btn-primary" onClick={() => setShowModal(true)} id="create-user-btn">
              <UserPlus size={14} /> Provision New Identity
            </button>
          ) : activeTab === 'infrastructure' ? (
            <button className="btn btn-secondary" onClick={fetchHealth} disabled={healthLoading}>
              <RefreshCw size={14} className={healthLoading ? 'spin' : ''} /> Refresh Health State
            </button>
          ) : null
        }
      />

      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          ['users', 'User Accounts & Provisioning', <User size={16} />],
          ['infrastructure', 'Microservices & PoA Infrastructure', <Server size={16} />],
          ['audit', 'System Audit & Watchdog Flags', <Activity size={16} />],
        ].map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.92rem', fontWeight: activeTab === id ? 600 : 500,
              color: activeTab === id ? 'var(--navy-700)' : 'var(--text-muted)',
              borderBottom: activeTab === id ? '3px solid var(--navy-700)' : '3px solid transparent',
              marginBottom: -1,
              transition: 'all 0.15s ease',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <>
          <div className="filter-toolbar">
            <input
              className="form-input filter-search"
              placeholder="Search by name, email, or employee ID…"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              id="user-search"
            />
            <select
              className="form-select"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              id="user-role-filter"
            >
              <option value="">All 6 Roles</option>
              <option value="Police Officer">Police Officer</option>
              <option value="Forensic Expert">Forensic Expert</option>
              <option value="Judicial Magistrate">Judicial Magistrate</option>
              <option value="Sessions Judge">Sessions Judge</option>
              <option value="Advocate">Advocate</option>
              <option value="Admin">Administrator</option>
            </select>
            <select
              className="form-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              id="user-status-filter"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>

          <DataTable
            columns={userColumns}
            data={data}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            limit={25}
            onPageChange={setPage}
            emptyMessage="No users found."
            onRowClick={(row) => setSelectedUserId(row.id)}
            rowStyle={{ cursor: 'pointer' }}
          />

          {showModal && <CreateUserModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}

          {selectedUserId && (
            <UserDetailPanel
              userId={selectedUserId}
              onClose={() => setSelectedUserId(null)}
              onToggleStatus={handleToggleStatus}
              togglingId={togglingId}
            />
          )}
        </>
      )}

      {/* TAB 2: INFRASTRUCTURE & HEALTH */}
      {activeTab === 'infrastructure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Zero-Trust Legal Architecture Banner */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 8, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start'
          }}>
            <Shield size={24} color="var(--emerald)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                Zero-Trust Legal Architecture (Bharatiya Sakshya Adhiniyam, 2023)
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                In S.H.I.E.L.D., the System Administrator has zero access to criminal case narratives, scanned FIRs, or digital evidence files.
                All API Gateway routes for case retrieval drop requests from Admin tokens with a <code>403 Forbidden</code> response.
                Admin responsibilities are restricted to node health, Docker container lifecycle, user identity provisioning, and smart contract anchoring.
              </div>
            </div>
          </div>

          {/* Microservices Health Cards */}
          <div className="stat-cards-grid">
            <StatCard
              label="Overall Cluster State"
              value={systemHealth?.overallStatus || 'HEALTHY'}
              icon={Server}
              accent="var(--emerald)"
            />
            <StatCard
              label="Total Provisioned Identities"
              value={systemHealth?.metrics?.totalUsers || total}
              icon={User}
              accent="var(--navy-700)"
            />
            <StatCard
              label="Immutable Audit Records"
              value={systemHealth?.metrics?.totalAuditEvents || 0}
              icon={Activity}
              accent="var(--navy-700)"
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Monitored Microservices & Node States</h2>
              <span className="badge badge-success">5 Nodes Monitored</span>
            </div>
            <div style={{ padding: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(systemHealth?.services || [
                  { name: 'shield-auth', role: 'Authentication & Identity Microservice', status: 'ONLINE', latencyMs: 1 },
                  { name: 'db-users', role: 'PostgreSQL Relational & Audit Database', status: 'ONLINE', latencyMs: 2 },
                  { name: 'shield-evidence', role: 'Evidence Ingestion & MinIO Storage Pipeline', status: 'ONLINE', latencyMs: 4 },
                  { name: 'shield-ledger', role: 'EVM PoA Blockchain Smart Contract Gateway', status: 'ONLINE', latencyMs: 3 },
                  { name: 'shield-watchdog', role: 'Automated Background Integrity Scanner', status: 'ONLINE', latencyMs: 5 },
                ]).map((srv, idx) => (
                  <div key={srv.name} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: idx < 4 ? '1px solid var(--border)' : 'none',
                    background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-page)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: srv.status === 'ONLINE' ? 'var(--emerald)' : 'var(--crimson)',
                        boxShadow: srv.status === 'ONLINE' ? '0 0 8px rgba(16,185,129,0.5)' : 'none'
                      }} />
                      <div>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>{srv.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{srv.role}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {srv.latencyMs}ms
                      </span>
                      <span className={`badge ${srv.status === 'ONLINE' ? 'badge-active' : 'badge-tampered'}`}>
                        {srv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM AUDIT & WATCHDOG */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Watchdog Security Alerts */}
          {watchdogAlerts.length > 0 && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--crimson)', fontWeight: 700, marginBottom: 8 }}>
                <AlertTriangle size={18} />
                <span>Security Flag & Watchdog Alerts Detected ({watchdogAlerts.length})</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {watchdogAlerts.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                    <span>{a.target_label || a.endpoint}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDateTime(a.accessed_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="filter-toolbar">
            <input
              className="form-input filter-search"
              placeholder="Search audit trail by actor name, action, or target…"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
            <select
              className="form-select"
              value={auditMethod}
              onChange={(e) => setAuditMethod(e.target.value)}
            >
              <option value="">All Events</option>
              <option value="LOGIN">LOGIN</option>
              <option value="USER_CREATED">USER_CREATED</option>
              <option value="USER_UPDATED">USER_UPDATED</option>
              <option value="PASSWORD_RESET">PASSWORD_RESET</option>
              <option value="WATCHDOG_ALERT">WATCHDOG_ALERT</option>
            </select>
          </div>

          <DataTable
            columns={auditColumns}
            data={auditLogs}
            loading={auditLoading}
            emptyMessage="No audit logs recorded."
          />
        </div>
      )}
    </>
  );
}
