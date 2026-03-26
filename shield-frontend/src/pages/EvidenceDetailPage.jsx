import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, BookOpen } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';
import FilePreview from '../components/FilePreview';
import { evidenceAPI } from '../services/api';
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

export default function EvidenceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifyState, setVerifyState] = useState('IDLE'); // IDLE, LOADING, VERIFIED, TAMPERED, ERROR
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    setLoading(true);
    evidenceAPI.get(id)
      .then((d) => setEv(d))
      .catch(() => setError('Evidence record not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleVerify = async () => {
    setVerifyState('LOADING');
    try {
      const res = await evidenceAPI.verify(id);
      if (res.status === 'OK') {
        setVerifyState('VERIFIED');
        setEv((e) => e ? { ...e, status: 'verified' } : e);
      } else {
        setVerifyState('TAMPERED');
        setEv((e) => e ? { ...e, status: 'tampered' } : e);
      }
    } catch (err) {
      setVerifyError(err?.response?.data?.error || err.message || 'Database unreachable.');
      setVerifyState('ERROR');
    }
  };

  if (loading) return <div className="loading-state"><span className="spinner" /><span>Loading evidence…</span></div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!ev) return null;

  return (
    <>
      <PageHeader
        title={ev.fileName}
        subtitle={`${ev.category?.charAt(0).toUpperCase() + ev.category?.slice(1)} evidence · ${ev.firNumber}`}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
        }
      />

      <div className="detail-grid">
        {/* Left Column — Metadata + Integrity */}
        <div className="detail-section">
          <div className="card">
            <div className="card-header"><h2>File Metadata</h2></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="detail-row">
                  <span className="detail-row-label">File Name</span>
                  <span className="detail-row-value">{ev.fileName}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Status</span>
                  <div><StatusBadge status={ev.status} /></div>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Linked FIR</span>
                  <Link to={`/fir/${ev.firId}`} className="cell-link" style={{ fontSize: 14 }}>{ev.firNumber}</Link>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Category</span>
                  <span className="detail-row-value" style={{ textTransform: 'capitalize' }}>{ev.category}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Uploaded By</span>
                  <span className="detail-row-value">{ev.uploadedBy?.name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Employee ID</span>
                  <span className="detail-row-value">{ev.uploadedBy?.employeeId}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Upload Date</span>
                  <span className="detail-row-value">{fmtDate(ev.uploadDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">File Size</span>
                  <span className="detail-row-value">{fmtBytes(ev.fileSize)}</span>
                </div>
                {ev.description && (
                  <div className="detail-row" style={{ gridColumn: '1 / -1' }}>
                    <span className="detail-row-label">Description</span>
                    <span className="detail-row-value">{ev.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Integrity Record */}
          <div className="card">
            <div className="card-header"><h2>Integrity Record</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <HashDisplay hash={ev.hash} label="SHA-256 Hash" />
              <div className="detail-row">
                <span className="detail-row-label">ImmuDB Transaction ID</span>
                <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ev.ledgerTxId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Ledger Timestamp</span>
                <span className="detail-row-value">{fmtDate(ev.ledgerTimestamp)}</span>
              </div>

              {verifyState === 'LOADING' && (
                <div className="alert alert-info">
                  <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
                  Verifying cryptographic footprint with ImmuDB ledger...
                </div>
              )}
              {verifyState === 'VERIFIED' && (
                <div className="alert alert-success">
                  ✓ INTEGRITY VERIFIED: SHA-256 match confirmed.
                </div>
              )}
              {verifyState === 'TAMPERED' && (
                <div className="alert alert-error">
                  🚨 TAMPER DETECTED: File hash dramatically differs from ledger.
                </div>
              )}
              {verifyState === 'ERROR' && (
                <div className="alert" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                  ⚠ NETWORK ERROR: Could not reach verification database ({verifyError}). This is a connectivity failure, not a cryptographic tamper.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleVerify} disabled={verifyState === 'LOADING'}>
                  {verifyState === 'LOADING' ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Verifying…</> : <><RefreshCw size={13} /> Re-Verify Now</>}
                </button>
                <a
                  href={evidenceAPI.downloadUrl(ev.id)}
                  download={ev.fileName}
                  className="btn btn-secondary btn-sm"
                >
                  <Download size={13} /> Download Original
                </a>
                {role === 'judicial_authority' && (
                  <Link to={`/audit?targetId=${ev.id}`} className="btn btn-ghost btn-sm">
                    <BookOpen size={13} /> View Audit Trail
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — File Preview */}
        <div>
          <div className="card">
            <div className="card-header"><h2>File Preview</h2></div>
            <div className="card-body">
              <FilePreview fileUrl={ev.fileUrl} mimeType={ev.mimeType} fileName={ev.fileName} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
