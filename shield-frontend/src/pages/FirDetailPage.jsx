import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Plus } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';
import FilePreview from '../components/FilePreview';
import DataTable from '../components/DataTable';
import { firAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' });
}

function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EV_COLUMNS = [
  { key: 'fileName', label: 'File Name', sortable: true,
    render: (v, row) => <Link to={`/vault/${row.id}`} className="cell-link">{v}</Link> },
  { key: 'category', label: 'Category',
    render: (v) => <span style={{ textTransform: 'capitalize' }}>{v}</span> },
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
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    firAPI.get(id)
      .then((d) => setFir(d))
      .catch(() => setError('FIR not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await firAPI.verify(id);
      setVerifyResult(res);
      setFir((f) => f ? { ...f, status: res.status } : f);
    } catch {
      setVerifyResult({ error: 'Verification failed.' });
    } finally {
      setVerifying(false);
    }
  };

  if (loading) return <div className="loading-state"><span className="spinner" /><span>Loading FIR…</span></div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!fir) return null;

  return (
    <>
      <PageHeader
        title={fir.firNumber}
        subtitle={`Uploaded ${fmtDate(fir.uploadDate)} by ${fir.uploadedBy?.name}`}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Section 1: FIR Document */}
        <div className="card">
          <div className="card-header">
            <h2>FIR Document</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={firAPI.downloadUrl(fir.id)}
                download={fir.fileName}
                className="btn btn-secondary btn-sm"
              >
                <Download size={13} /> Download Original
              </a>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* Left metadata */}
            <div className="card-body" style={{ borderRight: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="detail-row">
                  <span className="detail-row-label">FIR Number</span>
                  <span className="detail-row-value">{fir.firNumber}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Status</span>
                  <div><StatusBadge status={fir.status} /></div>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Uploaded By</span>
                  <span className="detail-row-value">{fir.uploadedBy?.name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Employee ID</span>
                  <span className="detail-row-value">{fir.uploadedBy?.employeeId}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Upload Date</span>
                  <span className="detail-row-value">{fmtDate(fir.uploadDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">File Size</span>
                  <span className="detail-row-value">{fmtBytes(fir.fileSize)}</span>
                </div>
              </div>

              {/* Integrity Record */}
              <div style={{ marginTop: 20 }}>
                <div className="integrity-card">
                  <div className="integrity-card-header">Integrity Record</div>
                  <div className="integrity-card-rows">
                    <HashDisplay hash={fir.hash} label="SHA-256 Hash" />
                    <div className="detail-row">
                      <span className="detail-row-label">ImmuDB Transaction ID</span>
                      <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fir.ledgerTxId}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-row-label">Ledger Timestamp</span>
                      <span className="detail-row-value">{fmtDate(fir.ledgerTimestamp)}</span>
                    </div>
                  </div>
                </div>

                {verifyResult && (
                  <div className={`alert ${verifyResult.error ? 'alert-error' : verifyResult.match ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 12 }}>
                    {verifyResult.error
                      ? verifyResult.error
                      : verifyResult.match
                      ? `✓ Integrity verified at ${fmtDate(verifyResult.verifiedAt)}`
                      : `⚠ TAMPER DETECTED — Hash mismatch found.`}
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleVerify} disabled={verifying}>
                    {verifying ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Verifying…</> : <><RefreshCw size={13} /> Re-Verify Integrity</>}
                  </button>
                </div>
              </div>
            </div>

            {/* Right preview */}
            <div className="card-body">
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>{fir.fileName}</div>
              <FilePreview fileUrl={fir.fileUrl} mimeType={fir.mimeType} fileName={fir.fileName} />
            </div>
          </div>
        </div>

        {/* Section 2: Linked Evidence */}
        <div className="card">
          <div className="card-header">
            <h2>Linked Evidence ({fir.linkedEvidence?.length || 0} files)</h2>
            {role === 'police_officer' && (
              <Link to={`/upload?tab=evidence&firId=${fir.id}`} className="btn btn-primary btn-sm">
                <Plus size={13} /> Attach More Evidence
              </Link>
            )}
          </div>
          <DataTable
            columns={EV_COLUMNS}
            data={fir.linkedEvidence || []}
            emptyMessage="No evidence files linked to this FIR yet."
            rowClassName={(row) => row.status === 'tampered' ? 'tampered-row' : ''}
          />
        </div>
      </div>
    </>
  );
}
