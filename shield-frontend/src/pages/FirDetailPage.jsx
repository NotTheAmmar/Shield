import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Download, Lock, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';
import DataTable from '../components/DataTable';
import { firAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

const EV_COLUMNS = [
  { key: 'fileName', label: 'File Name', sortable: true,
    render: (v, row) => <Link to={`/vault/${row.id}`} className="cell-link">{v}</Link> },
  { key: 'category', label: 'Category',
    render: (v) => <span style={{ textTransform: 'capitalize' }}>{v || '—'}</span> },
  { key: 'uploadDate', label: 'Upload Date',
    render: (v) => fmtDate(v) },
  { key: 'hash', label: 'SHA-256',
    render: (v) => <HashDisplay hash={v} truncate /> },
  { key: 'status', label: 'Status',
    render: (v) => <StatusBadge status={v} /> },
];

export default function FirDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [fir, setFir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeSuccess, setCloseSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    firAPI.get(id)
      .then((d) => setFir(d))
      .catch(() => setError('FIR not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCloseFir = async () => {
    if (!window.confirm('Are you sure you want to close this FIR? This requires all evidence to be verified.')) return;
    setClosing(true);
    setCloseError('');
    try {
      const res = await firAPI.close(id);
      setFir((f) => f ? { ...f, status: res.status || 'CLOSED' } : f);
      setCloseSuccess(true);
      setTimeout(() => setCloseSuccess(false), 5000);
    } catch (err) {
      const errData = err?.response?.data || err;
      let msg = errData?.error || err.message || 'Failed to close FIR.';
      if (errData?.unverifiedFiles?.length) msg += ' Unverified: ' + errData.unverifiedFiles.join(', ');
      if (errData?.tamperedFiles?.length) msg += ' Tampered: ' + errData.tamperedFiles.join(', ');
      setCloseError(msg);
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="loading-state"><span className="spinner" /><span>Loading FIR…</span></div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!fir) return null;

  const isClosed = (fir.status || '').toUpperCase() === 'CLOSED';

  return (
    <>
      <PageHeader
        title={fir.firNumber}
        subtitle={`Registered ${fmtDate(fir.uploadDate)}`}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* FIR Metadata */}
        <div className="card">
          <div className="card-header">
            <h2>FIR Details</h2>
            <span className={`badge badge-${isClosed ? 'success' : 'info'}`} style={{ textTransform: 'capitalize' }}>
              {fir.status || 'Open'}
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="detail-row">
                <span className="detail-row-label">FIR Number</span>
                <span className="detail-row-value">{fir.firNumber}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Incident Type</span>
                <span className="detail-row-value">{fir.incidentType || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Registered Date</span>
                <span className="detail-row-value">{fmtDate(fir.uploadDate)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Location</span>
                <span className="detail-row-value">{fir.location || '—'}</span>
              </div>
              {fir.description && (
                <div className="detail-row" style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-row-label">Description</span>
                  <span className="detail-row-value">{fir.description}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <a
                className="btn btn-secondary btn-sm"
                href={firAPI.downloadUrl(fir.id)}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Download size={13} /> View / Download FIR
              </a>
              {role === 'police_officer' && !isClosed && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleCloseFir}
                  disabled={closing}
                >
                  {closing
                    ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Closing…</>
                    : <><Lock size={13} /> Close FIR</>
                  }
                </button>
              )}
            </div>

            {closeError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <AlertTriangle size={14} /> {closeError}
              </div>
            )}
            {closeSuccess && (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                FIR has been closed successfully.
              </div>
            )}
          </div>
        </div>

        {/* Linked Evidence */}
        <div className="card">
          <div className="card-header">
            <h2>Linked Evidence ({fir.linkedEvidence?.length || 0} files)</h2>
            {role === 'police_officer' && !isClosed && (
              <Link to={`/upload?tab=evidence&firId=${fir.id}`} className="btn btn-primary btn-sm">
                <Plus size={13} /> Attach Evidence
              </Link>
            )}
          </div>
          <DataTable
            columns={EV_COLUMNS}
            data={fir.linkedEvidence || []}
            emptyMessage="No evidence files linked to this FIR yet."
          />
        </div>
      </div>
    </>
  );
}
