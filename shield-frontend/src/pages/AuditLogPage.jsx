import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import RoleBadge from '../components/RoleBadge';
import { auditAPI } from '../services/api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Canonical action labels — matches both audit and auth sides
const ACTION_LABELS = {
  UPLOADED_FIR:        'Registered FIR',
  UPLOADED_EVIDENCE:   'Uploaded Evidence',
  DOWNLOADED_EVIDENCE: 'Downloaded Evidence',
  VERIFY:              'Verified Evidence',
  CLOSED_FIR:          'Closed FIR',
  LOGIN:               'Logged In',
  LOGOUT:              'Logged Out',
  USER_CREATED:        'Created User Account',
  USER_UPDATED:        'Updated User Account',
  PASSWORD_RESET:      'Reset Password',
};

// All possible filter options — combined from both sources
const ACTION_OPTIONS = [
  { value: '',                    label: 'All Actions' },
  { value: 'UPLOADED_FIR',        label: 'Registered FIR' },
  { value: 'UPLOADED_EVIDENCE',   label: 'Uploaded Evidence' },
  { value: 'DOWNLOADED_EVIDENCE', label: 'Downloaded Evidence' },
  { value: 'VERIFY',              label: 'Verified Evidence' },
  { value: 'CLOSED_FIR',          label: 'Closed FIR' },
  { value: 'LOGIN',               label: 'Login' },
  { value: 'LOGOUT',              label: 'Logout' },
  { value: 'USER_CREATED',        label: 'User Created' },
  { value: 'USER_UPDATED',        label: 'User Updated' },
  { value: 'PASSWORD_RESET',      label: 'Password Reset' },
];

const RESULT_BADGE = {
  success: { bg: 'var(--emerald-light)', color: 'var(--emerald)', label: 'Success' },
  failed:  { bg: 'var(--crimson-light)', color: 'var(--crimson)', label: 'Failed' },
};

function ResultBadge({ value }) {
  const cfg = RESULT_BADGE[value] || RESULT_BADGE.success;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
    }}>
      {cfg.label}
    </span>
  );
}

const COLUMNS = [
  { key: 'timestamp', label: 'Timestamp', sortable: true,
    render: (v) => fmtDate(v) },
  { key: 'user_name', label: 'User',
    render: (v, row) => (
      <div>
        <div style={{ fontWeight: 500 }}>{v || '—'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.user_employee_id || ''}</div>
      </div>
    )},
  { key: 'user_role', label: 'Role',
    render: (v) => v ? <RoleBadge role={v} /> : <span style={{ color: 'var(--text-muted)' }}>—</span> },
  { key: 'action', label: 'Action',
    render: (v) => (
      <span style={{ fontWeight: 500 }}>{ACTION_LABELS[v] || v}</span>
    )},
  { key: 'targetLabel', label: 'Detail',
    render: (v) => v
      ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v}</span>
      : <span style={{ color: 'var(--text-muted)' }}>—</span> },
  { key: 'result', label: 'Result',
    render: (v) => <ResultBadge value={v} /> },
];

export default function AuditLogPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [targetId] = useState(searchParams.get('targetId') || '');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const actionParam = filterAction || undefined;
      const limitParam = 150;

      // Auth-side events: login, logout, user management
      const AUTH_ACTIONS = ['LOGIN', 'LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'PASSWORD_RESET'];
      // Evidence-side events: FIR/evidence operations
      const EVIDENCE_ACTIONS = ['UPLOADED_FIR', 'UPLOADED_EVIDENCE', 'DOWNLOADED_EVIDENCE', 'VERIFY', 'CLOSED_FIR'];

      // Decide which sources to query based on filter
      const shouldFetchAuth = !actionParam || AUTH_ACTIONS.includes(actionParam);
      const shouldFetchEvidence = !actionParam || EVIDENCE_ACTIONS.includes(actionParam);

      const [authRes, evidenceRes] = await Promise.allSettled([
        shouldFetchAuth
          ? auditAPI.listAuth({ action: actionParam, limit: limitParam })
          : Promise.resolve({ auditLog: [] }),
        shouldFetchEvidence
          ? auditAPI.list({ action: actionParam, targetId: targetId || undefined, limit: limitParam })
          : Promise.resolve({ auditLog: [] }),
      ]);

      const authLogs = authRes.status === 'fulfilled' ? (authRes.value?.auditLog || []) : [];
      const evidenceLogs = evidenceRes.status === 'fulfilled' ? (evidenceRes.value?.auditLog || []) : [];

      // Merge and sort chronologically
      const merged = [...authLogs, ...evidenceLogs]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 200);

      setData(merged);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filterAction, targetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Chain of custody — chronological record of all system actions."
      />

      <div className="filter-toolbar">
        <select
          className="form-select"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          id="audit-action-filter"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {targetId && (
          <div className="alert alert-info" style={{ margin: 0, padding: '6px 12px', fontSize: 12 }}>
            Filtered to target: <code>{targetId}</code>
          </div>
        )}
      </div>

      <DataTable
        columns={COLUMNS}
        data={data}
        loading={loading}
        total={data.length}
        emptyMessage="No audit log records found."
      />
    </>
  );
}
