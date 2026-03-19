import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';
import { evidenceAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function VaultPage() {
  const { role } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [rawSearch, setRawSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('uploadDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [verifyingId, setVerifyingId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await evidenceAPI.list({ page, limit: 25, search, status: filterStatus, category: filterCategory, sortBy, sortOrder });
      setData(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus, filterCategory, sortBy, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(rawSearch); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const handleVerify = async (ev) => {
    setVerifyingId(ev.id);
    try {
      const res = await evidenceAPI.verify(ev.id);
      setData((prev) => prev.map((e) => e.id === ev.id ? { ...e, status: res.status } : e));
    } finally {
      setVerifyingId(null);
    }
  };

  const columns = [
    { key: 'fileName', label: 'File Name', sortable: true,
      render: (v, row) => <Link to={`/vault/${row.id}`} className="cell-link">{v}</Link> },
    { key: 'firNumber', label: 'FIR Number',
      render: (v, row) => <Link to={`/fir/${row.firId}`} className="cell-link">{v}</Link> },
    { key: 'category', label: 'Category',
      render: (v) => <span style={{ textTransform: 'capitalize' }}>{v}</span> },
    { key: 'uploadDate', label: 'Upload Date', sortable: true,
      render: (v) => fmtDate(v) },
    { key: 'hash', label: 'SHA-256',
      render: (v) => <HashDisplay hash={v} truncate /> },
    { key: 'status', label: 'Status', sortable: true,
      render: (v) => <StatusBadge status={v} /> },
    {
      key: 'id', label: 'Actions',
      render: (v, row) => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => handleVerify(row)}
          disabled={verifyingId === row.id}
        >
          {verifyingId === row.id
            ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Verifying…</>
            : <><RefreshCw size={12} /> Verify</>}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Evidence Vault"
        subtitle={role === 'judicial_authority' ? 'Read-only access — browse and verify evidence integrity.' : 'All uploaded evidence files.'}
      />

      <div className="filter-toolbar">
        <input
          className="form-input filter-search"
          placeholder="Search by file name or FIR number…"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          id="vault-search"
        />
        <select
          className="form-select"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          id="vault-status-filter"
        >
          <option value="">All Statuses</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="tampered">Tampered</option>
        </select>
        <select
          className="form-select"
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          id="vault-category-filter"
        >
          <option value="">All Categories</option>
          {['photo', 'video', 'audio', 'document', 'other'].map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
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
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(col, ord) => { setSortBy(col); setSortOrder(ord); setPage(1); }}
        onPageChange={setPage}
        emptyMessage="No evidence files found."
        rowClassName={(row) => row.status === 'tampered' ? 'tampered-row' : ''}
      />
    </>
  );
}
