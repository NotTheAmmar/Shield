import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import RoleBadge from '../components/RoleBadge';
import { auditAPI } from '../services/api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ACTION_OPTIONS = [
  { value: '',                   label: 'All Actions' },
  { value: 'UPLOADED_FIR',       label: 'Uploaded FIR' },
  { value: 'UPLOADED_EVIDENCE',  label: 'Uploaded Evidence' },
  { value: 'VERIFIED_FIR',       label: 'Verified FIR' },
  { value: 'VERIFIED_EVIDENCE',  label: 'Verified Evidence' },
  { value: 'DOWNLOADED_FIR',     label: 'Downloaded FIR' },
  { value: 'DOWNLOADED_EVIDENCE',label: 'Downloaded Evidence' },
  { value: 'LOGIN',              label: 'Login' },
  { value: 'LOGOUT',             label: 'Logout' },
  { value: 'USER_CREATED',       label: 'User Created' },
  { value: 'USER_DEACTIVATED',   label: 'User Deactivated' },
  { value: 'USER_REACTIVATED',   label: 'User Reactivated' },
];

const ACTION_LABELS = Object.fromEntries(ACTION_OPTIONS.slice(1).map((o) => [o.value, o.label]));

const RESULT_BADGE = {
  success: { style: { background: 'var(--emerald-light)', color: 'var(--emerald)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }, label: 'Success' },
  failed:  { style: { background: 'var(--crimson-light)', color: 'var(--crimson)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }, label: 'Failed' },
};

const COLUMNS = [
  { key: 'timestamp', label: 'Timestamp', sortable: true,
    render: (v) => fmtDate(v) },
  { key: 'user', label: 'User',
    render: (v) => (
      <div>
        <div style={{ fontWeight: 500 }}>{v?.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v?.employeeId}</div>
      </div>
    )},
  { key: 'role', label: 'Role',
    render: (v) => <RoleBadge role={v} /> },
  { key: 'action', label: 'Action',
    render: (v) => ACTION_LABELS[v] || v },
  { key: 'targetLabel', label: 'Target',
    render: (v, row) => {
      if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
      if (row.targetType === 'fir') return <Link to={`/fir/${row.targetId}`} className="cell-link">{v}</Link>;
      if (row.targetType === 'evidence') return <Link to={`/vault/${row.targetId}`} className="cell-link">{v}</Link>;
      return <span>{v}</span>;
    }},
  { key: 'result', label: 'Result',
    render: (v) => {
      const cfg = RESULT_BADGE[v] || RESULT_BADGE.success;
      return <span style={cfg.style}>{cfg.label}</span>;
    }},
];

export default function AuditLogPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAction, setFilterAction] = useState('');
  const [targetId] = useState(searchParams.get('targetId') || '');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditAPI.list({
        page, limit: 50,
        action: filterAction || undefined,
        targetId: targetId || undefined,
      });
      setData(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, targetId]);

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
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
          id="audit-action-filter"
        >
          {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        page={page}
        totalPages={totalPages}
        total={total}
        limit={50}
        onPageChange={setPage}
        emptyMessage="No audit log records found."
      />
    </>
  );
}
