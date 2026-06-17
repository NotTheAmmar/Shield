import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, X, Shield, Activity, User, Clock, CheckCircle, ChevronRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import RoleBadge from '../components/RoleBadge';
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

function generateEmployeeId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let id = 'EMP-';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', parentageName: '', email: '', role: 'police_officer',
    employeeId: generateEmployeeId(), designation: '', station: '',
    plainPassword: generatePassword(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role || !form.employeeId || !form.plainPassword) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await adminAPI.createUser(form);
      onCreated(result);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to create user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal">
        <div className="modal-header">
          <h2 id="modal-title">Create New User</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="u-name">Full Name *</label>
                <input id="u-name" name="name" className="form-input" value={form.name} onChange={handleChange} placeholder="Rajesh Kumar" required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="u-parentageName">Parentage/Spouse Name</label>
                <input id="u-parentageName" name="parentageName" className="form-input" value={form.parentageName} onChange={handleChange} placeholder="S/O Mahesh Kumar" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-email">Official Email *</label>
              <input id="u-email" name="email" type="email" className="form-input" value={form.email} onChange={handleChange} placeholder="officer@police.gov.in" required />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-role">Role *</label>
              <select id="u-role" name="role" className="form-select" value={form.role} onChange={handleChange}>
                <option value="Police Officer">Police Officer</option>
                <option value="Judicial Authority">Judicial Authority</option>
                <option value="Forensic Expert">Forensic Expert</option>
                <option value="Admin">Administrator</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-employeeId">Employee ID (Auto-Generated)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="u-employeeId" name="employeeId" className="form-input" style={{ flex: 1, fontFamily: 'monospace' }} value={form.employeeId} readOnly required />
                <button
                  type="button" className="btn btn-secondary"
                  onClick={() => setForm(f => ({ ...f, employeeId: generateEmployeeId() }))}
                >
                  Regenerate
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="u-designation">Designation</label>
                <input id="u-designation" name="designation" className="form-input" value={form.designation} onChange={handleChange} placeholder="Inspector, Judge…" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="u-station">Station / Court</label>
                <input id="u-station" name="station" className="form-input" value={form.station} onChange={handleChange} placeholder="Andheri PS" />
              </div>
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label" htmlFor="u-password">Temporary Password *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="u-password" name="plainPassword" className="form-input" style={{ flex: 1, fontFamily: 'monospace' }} value={form.plainPassword} readOnly required />
                <button
                  type="button" className="btn btn-secondary"
                  onClick={() => { navigator.clipboard.writeText(form.plainPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                Copy this password and share it securely. The user must change it on first login.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── User Detail Slide-in Panel ────────────────────────────────────────────────

const ACTION_LABELS = {
  LOGIN: 'Logged In',
  LOGOUT: 'Logged Out',
  USER_CREATED: 'Created User Account',
  USER_UPDATED: 'Updated User Account',
  USER_DEACTIVATED: 'Account Deactivated',
  USER_REACTIVATED: 'Account Reactivated',
  PASSWORD_RESET: 'Password Reset by Admin',
  UPLOADED_FIR: 'Registered FIR',
  UPLOADED_EVIDENCE: 'Uploaded Evidence',
  VERIFY: 'Verified Evidence',
};

function UserDetailPanel({ userId, onClose, onToggleStatus, togglingId }) {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('profile'); // 'profile' | 'activity'
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Password Reset State
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminAPI.getUser(userId)
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (tab !== 'activity') return;
    setLogsLoading(true);
    auditAPI.listAuth({ userId, limit: 50 })
      .then((res) => setLogs(res.auditLog || []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [tab, userId]);

  const handleResetPassword = async () => {
    if (!window.confirm(`Are you sure you want to reset the password for ${user.name}?`)) return;
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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 500,
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
        animation: 'slideInRight 0.22s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(28,58,95,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <User size={20} color="var(--navy-700)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {loading ? '…' : (user?.name || 'Unknown')}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {loading ? '' : user?.email}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--bg-page)' }}>
          {[['profile', 'Profile', <User size={16} />], ['activity', 'Activity Log', <Activity size={16} />]].map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.95rem', fontWeight: tab === id ? 600 : 500,
                color: tab === id ? 'var(--navy-700)' : 'var(--text-muted)',
                borderBottom: tab === id ? '3px solid var(--navy-700)' : '3px solid transparent',
                marginBottom: -1,
                transition: 'all 0.2s',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <span className="spinner" />
            </div>
          ) : !user ? (
            <div className="alert alert-error">Failed to load user details.</div>
          ) : tab === 'profile' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Status Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <RoleBadge role={user.role} />
                <span className={`badge ${isActive ? 'badge-active' : 'badge-deactivated'}`}>
                  {isActive ? 'Active' : 'Deactivated'}
                </span>
                {user.must_change_password && (
                  <span style={{ background: 'var(--amber-light,rgba(245,158,11,0.15))', color: 'var(--amber,#f59e0b)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                    Pwd Change Required
                  </span>
                )}
              </div>

              {/* Detail fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  ['Employee ID', user.employee_id],
                  ['Email Address', user.email],
                  ['Parentage/Spouse Name', user.parentage_name || '—'],
                  ['Designation', user.designation || '—'],
                  ['Station / Court', user.station || '—'],
                  ['Account Created', fmtDateTime(user.created_at)],
                  ['Blockchain Address', user.blockchain_address || '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: 12, background: 'var(--bg-page)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-all' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Password Management */}
              <div style={{ marginTop: 8, padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-page)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Password Management</div>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={handleResetPassword}
                    disabled={resetting}
                  >
                    {resetting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : user.must_change_password ? 'Reset & Generate New Password' : 'Reset Password'}
                  </button>
                </div>
                {newPassword ? (
                  <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 6, border: '1px dashed var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--navy-700)', fontWeight: 600, marginBottom: 2 }}>NEW TEMPORARY PASSWORD</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '1px' }}>{newPassword}</div>
                    </div>
                    <button 
                      className="btn btn-ghost" 
                      onClick={() => { navigator.clipboard.writeText(newPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ) : user.must_change_password ? (
                  <div style={{ background: 'var(--amber-light)', padding: 12, borderRadius: 6, border: '1px solid var(--amber)', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Clock size={15} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
                    <span>Temporary password has <strong>not been changed yet</strong>. If the user has lost it, use the button above to reset and generate a new one.</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    User has set their own password. Click reset to generate a new temporary password — the user will be required to change it on next login.
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Activity tab
            logsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <span className="spinner" />
              </div>
            ) : logs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.88rem' }}>
                No activity recorded for this user.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {logs.map((log, i) => (
                  <div key={log.id || i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6,
                      background: log.result === 'failed' ? 'var(--crimson)' : 'var(--emerald)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {ACTION_LABELS[log.action] || log.action}
                      </div>
                      {log.targetLabel && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {log.targetLabel}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                      {fmtDateTime(log.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        {!loading && user && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              className={`btn ${isActive ? 'btn-danger' : 'btn-secondary'}`}
              disabled={togglingId === user.id}
              onClick={() => onToggleStatus(user)}
            >
              {togglingId === user.id
                ? <span className="spinner" style={{ width: 13, height: 13 }} />
                : isActive ? 'Deactivate Account' : 'Reactivate Account'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.listUsers({ page, limit: 25, search, role: filterRole, status: filterStatus });
      setData(res.users || []);
      setTotalPages(1);
      setTotal((res.users || []).length);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterRole, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(rawSearch); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'deactivated' : 'active';
    setTogglingId(user.id);
    try {
      await adminAPI.updateUser(user.id, { status: newStatus });
      setData((prev) => prev.map((u) => u.id === user.id ? { ...u, status: newStatus } : u));
      // If panel is open for this user, refresh their data
      if (selectedUserId === user.id) setSelectedUserId(null); // close & let re-open refresh
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreated = (newUser) => {
    setShowModal(false);
    setSuccessMsg(`User "${newUser.name}" created successfully.`);
    fetchData();
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const columns = [
    {
      key: 'name', label: 'Name', sortable: true,
      render: (v, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.employee_id}</div>
        </div>
      )
    },
    {
      key: 'email', label: 'Email',
      render: (v) => <span style={{ fontSize: 12 }}>{v}</span>
    },
    {
      key: 'role', label: 'Role',
      render: (v) => <RoleBadge role={v} />
    },
    {
      key: 'designation', label: 'Designation',
      render: (v) => v || '—'
    },
    {
      key: 'status', label: 'Status',
      render: (v) => (
        <span className={`badge ${v === 'active' ? 'badge-active' : 'badge-deactivated'}`}>
          {v === 'active' ? 'Active' : 'Deactivated'}
        </span>
      )
    },
    {
      key: 'created_at', label: 'Created',
      render: (v) => fmtDate(v)
    },
    {
      key: 'id', label: '',
      render: (v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontSize: 12, fontWeight: 500 }}>
          View <ChevronRight size={13} />
        </div>
      )
    },
  ];

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Manage system accounts. No self-registration — admin-provisioned only."
        actions={
          <button className="btn btn-primary" onClick={() => setShowModal(true)} id="create-user-btn">
            <UserPlus size={14} /> Create New User
          </button>
        }
      />

      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      <div className="filter-toolbar">
        <input
          className="form-input filter-search"
          placeholder="Search by name or email…"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          id="user-search"
        />
        <select
          className="form-select"
          value={filterRole}
          onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
          id="user-role-filter"
        >
          <option value="">All Roles</option>
          <option value="Police Officer">Police Officer</option>
          <option value="Judicial Authority">Judicial Authority</option>
          <option value="Forensic Expert">Forensic Expert</option>
          <option value="Admin">Admin</option>
        </select>
        <select
          className="form-select"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          id="user-status-filter"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      <DataTable
        columns={columns}
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
  );
}
