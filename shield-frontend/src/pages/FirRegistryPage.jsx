import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';
import { firAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const COLUMNS = [
  { key: 'firNumber', label: 'FIR Number', sortable: true,
    render: (v, row) => <Link to={`/fir/${row.id}`} className="cell-link">{v}</Link> },
  { key: 'fileName', label: 'Uploaded File', sortable: true },
  { key: 'uploadDate', label: 'Upload Date (IST)', sortable: true,
    render: (v) => fmtDate(v) },
  { key: 'uploadedBy', label: 'Uploaded By',
    render: (v) => v?.name || '—' },
  { key: 'hash', label: 'SHA-256 Hash',
    render: (v) => <HashDisplay hash={v} truncate /> },
  { key: 'evidenceCount', label: 'Evidence', sortable: true,
    render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
  { key: 'status', label: 'Status',
    render: (v) => <StatusBadge status={v} /> },
];

export default function FirRegistryPage() {
  const { role } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('uploadDate');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await firAPI.list({ page, limit: 25, search, sortBy, sortOrder });
      setData(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounce search
  const [rawSearch, setRawSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(rawSearch); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const handleSort = (col, order) => { setSortBy(col); setSortOrder(order); setPage(1); };

  return (
    <>
      <PageHeader
        title="FIR Registry"
        subtitle={role === 'judicial_authority' ? 'Read-only access — FIR browsing and verification.' : 'All uploaded FIR documents.'}
      />

      <div className="filter-toolbar">
        <input
          className="form-input filter-search"
          placeholder="Search by FIR number…"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          id="fir-search"
        />
      </div>

      <DataTable
        columns={COLUMNS}
        data={data}
        loading={loading}
        page={page}
        totalPages={totalPages}
        total={total}
        limit={25}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onPageChange={setPage}
        emptyMessage="No FIRs found."
        rowClassName={(row) => row.status === 'tampered' ? 'tampered-row' : ''}
      />
    </>
  );
}
