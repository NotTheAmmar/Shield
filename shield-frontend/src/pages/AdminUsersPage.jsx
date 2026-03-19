import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, X, Copy, CheckCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';

import RoleBadge from '../components/RoleBadge';
import { adminAPI } from '../services/api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = 'Sh!3ld@';
  for (let i = 0; i < 6; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// ── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', email: '', role: 'police_officer',
    designation: '', station: '',
    temporaryPassword: generatePassword(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role) { setError('Name, email, and role are required.'); return; }
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

  const copyPassword = () => {
    navigator.clipboard.writeText(form.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

            <div className="form-group">
              <label className="form-label" htmlFor="u-name">Full Name *</label>
              <input id="u-name" name="name" className="form-input" value={form.name} onChange={handleChange} placeholder="Rajesh Kumar" required />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-email">Official Email *</label>
              <input id="u-email" name="email" type="email" className="form-input" value={form.email} onChange={handleChange} placeholder="officer@police.gov.in" required />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-role">Role *</label>
              <select id="u-role" name="role" className="form-select" value={form.role} onChange={handleChange}>
                <option value="police_officer">Police Officer</option>
                <option value="judicial_authority">Judicial Authority</option>
                <option value="admin">Administrator</option>
              </select>
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

            <div className="form-group">
              <label className="form-label">Temporary Password</label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Auto-generated. Share securely. User must change on first login.
              </p>
              <div className="temp-password-box" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{form.temporaryPassword}</span>
                <button type="button" onClick={copyPassword} className="btn btn-ghost btn-icon" title="Copy password">
                  {copied ? <CheckCircle size={14} color="var(--emerald)" /> : <Copy size={14} />}
                </button>
              </div>
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

// ── Main Page ────────────────────────────────────────────────────────────────

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.listUsers({ page, limit: 25, search, role: filterRole, status: filterStatus });
      setData(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.employeeId}</div>
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
      key: 'createdAt', label: 'Created',
      render: (v) => fmtDate(v)
    },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn btn-sm ${row.status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
            style={{ opacity: togglingId === row.id ? 0.6 : 1 }}
            disabled={togglingId === row.id}
            onClick={() => handleToggleStatus(row)}
          >
            {togglingId === row.id
              ? <span className="spinner" style={{ width: 12, height: 12 }} />
              : row.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </button>
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
          <option value="police_officer">Police Officer</option>
          <option value="judicial_authority">Judicial Authority</option>
          <option value="admin">Admin</option>
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
      />

      {showModal && <CreateUserModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </>
  );
}
