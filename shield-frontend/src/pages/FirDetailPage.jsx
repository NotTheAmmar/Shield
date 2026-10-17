import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Download, Lock, AlertTriangle, Shield, CheckCircle,
  Clock, FileText, Package, Check, X, ShieldCheck
} from 'lucide-react';
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
  const { role, user } = useAuth();

  const [fir, setFir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeSuccess, setCloseSuccess] = useState(false);

  // Supplementary Reports state (Sec 193(9) BNSS)
  const [supplementaryReports, setSupplementaryReports] = useState([]);
  const [loadingSupp, setLoadingSupp] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submittingSupp, setSubmittingSupp] = useState(false);
  const [suppError, setSuppError] = useState('');
  const [suppSuccess, setSuppSuccess] = useState(false);

  // Modal form fields
  const [narrative, setNarrative] = useState('');
  const [discoveredItems, setDiscoveredItems] = useState('');
  const [fslNotified, setFslNotified] = useState(false);

  const loadFir = useCallback(() => {
    setLoading(true);
    firAPI.get(id)
      .then((d) => setFir(d))
      .catch((err) => {
        const msg = err?.response?.data?.error || 'FIR not found or access denied.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const loadSupplementary = useCallback(() => {
    setLoadingSupp(true);
    firAPI.getSupplementary(id)
      .then((res) => {
        const list = res.data || res || [];
        setSupplementaryReports(Array.isArray(list) ? list : []);
      })
      .catch((err) => console.warn('Could not load supplementary reports:', err.message))
      .finally(() => setLoadingSupp(false));
  }, [id]);

  useEffect(() => {
    loadFir();
    loadSupplementary();
  }, [loadFir, loadSupplementary]);

  const handleCloseFir = async () => {
    if (!window.confirm('Are you sure you want to close this FIR? This requires all linked evidence to be verified.')) return;
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

  const handleAddSupplementary = async (e) => {
    e.preventDefault();
    if (!narrative.trim()) {
      setSuppError('Investigative narrative is mandatory.');
      return;
    }

    setSubmittingSupp(true);
    setSuppError('');
    try {
      await firAPI.addSupplementary(id, {
        narrative: narrative.trim(),
        discovered_items: discoveredItems.trim(),
        fsl_notified: fslNotified
      });
      setSuppSuccess(true);
      setTimeout(() => setSuppSuccess(false), 4000);
      setNarrative('');
      setDiscoveredItems('');
      setFslNotified(false);
      setModalOpen(false);
      loadSupplementary();
    } catch (err) {
      setSuppError(err?.response?.data?.error || err.message || 'Failed to append supplementary report.');
    } finally {
      setSubmittingSupp(false);
    }
  };

  if (loading) return <div className="loading-state"><span className="spinner" /><span>Loading FIR &amp; Case Diary…</span></div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!fir) return null;

  const isClosed = (fir.status || '').toUpperCase() === 'CLOSED';
  const isPolice = role === 'police_officer';
  const isForensic = role === 'forensic_expert';

  return (
    <>
      <PageHeader
        title={fir.firNumber}
        subtitle={`Registered ${fmtDate(fir.uploadDate)}${fir.station ? ` · ${fir.station}` : ''}`}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* FIR Details Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2>First Information Report (FIR)</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Physical Scanned Document Record &amp; Legal Metadata
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`badge badge-${isClosed ? 'success' : 'info'}`} style={{ textTransform: 'capitalize' }}>
                {fir.status || 'Open'}
              </span>
              <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Lock size={11} /> Immutably Frozen
              </span>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div className="detail-row">
                <span className="detail-row-label">FIR Number</span>
                <span className="detail-row-value font-mono" style={{ fontWeight: 600 }}>{fir.firNumber}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Police Station</span>
                <span className="detail-row-value">{fir.station || fir.jurisdictionName || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Offence / Incident Category</span>
                <span className="detail-row-value">{fir.incidentType || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Applicable Statutory Sections</span>
                <span className="detail-row-value" style={{ color: 'var(--navy-700)', fontWeight: 500 }}>
                  {fir.applicableSections || '—'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Date/Time of Incident</span>
                <span className="detail-row-value">{fmtDate(fir.incidentDateTime) || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Registration Timestamp</span>
                <span className="detail-row-value">{fmtDate(fir.uploadDate)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Incident Scene Location</span>
                <span className="detail-row-value">{fir.location || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row-label">Scanned Document Hash</span>
                <span className="detail-row-value">
                  {fir.sha256Hash ? <HashDisplay hash={fir.sha256Hash} truncate /> : '—'}
                </span>
              </div>
              {fir.description && (
                <div className="detail-row" style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-row-label">Initial Report Narrative Summary</span>
                  <span className="detail-row-value" style={{ lineHeight: 1.6 }}>{fir.description}</span>
                </div>
              )}
            </div>

            {/* Immutability Callout */}
            <div style={{
              marginTop: 18,
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(28, 58, 95, 0.05)',
              border: '1px solid rgba(28, 58, 95, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12
            }}>
              <Lock size={15} style={{ color: 'var(--navy-700)', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong>Statutory Freeze Active (Section 173 CrPC &amp; Section 193 BNSS):</strong> The initial scanned FIR and core narrative are permanently immutable and cannot be edited. All progressive findings, recoveries, or forensic requests must be added below via Section 193(9) BNSS supplementary entries.
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <a
                className="btn btn-secondary btn-sm"
                href={firAPI.downloadUrl(fir.id)}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={13} /> View / Download Scanned FIR PDF
              </a>
              {isPolice && !isClosed && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleCloseFir}
                  disabled={closing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {closing
                    ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Verifying &amp; Closing…</>
                    : <><Lock size={13} /> Close Case File</>
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
                FIR case file has been closed successfully.
              </div>
            )}
          </div>
        </div>

        {/* ── Prominent Investigation Case Diary (Section 193(9) BNSS) Panel ── */}
        <div className="card" style={{ borderLeft: '4px solid var(--navy-700)' }}>
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} style={{ color: 'var(--navy-700)' }} />
                <h2 style={{ margin: 0 }}>Investigation Case Diary (Section 193(9) BNSS)</h2>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Append-only chronological case diary chaining progressive investigative discoveries, seizure memos, and FSL notifications.
              </p>
            </div>
            {isPolice && !isClosed && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} /> Add Supplementary Report
              </button>
            )}
          </div>

          <div className="card-body">
            {suppSuccess && (
              <div className="alert alert-success" style={{ marginBottom: 16 }}>
                <CheckCircle size={15} /> Supplementary Report recorded successfully under Section 193(9) BNSS.
              </div>
            )}

            {loadingSupp ? (
              <div className="loading-state" style={{ padding: 20 }}>
                <span className="spinner" /> Loading Supplementary Reports…
              </div>
            ) : supplementaryReports.length === 0 ? (
              <div style={{
                padding: '32px 24px',
                textAlign: 'center',
                background: 'var(--bg-table-alt)',
                borderRadius: 8,
                border: '1px dashed var(--border)'
              }}>
                <FileText size={32} style={{ color: 'var(--slate-400)', marginBottom: 8 }} />
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>
                  No Supplementary Reports Recorded Yet
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 520, marginInline: 'auto' }}>
                  Under Section 193(9) of the Bharatiya Nagarik Suraksha Sanhita (BNSS), investigating officers append subsequent findings, physical recovery notes, and forensic submissions without modifying the initial registered FIR.
                </p>
                {isPolice && !isClosed && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setModalOpen(true)}
                    style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={13} /> Add First Supplementary Report
                  </button>
                )}
              </div>
            ) : (
              <div className="supplementary-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {supplementaryReports.map((report) => (
                  <div
                    key={report.id || report.reportNumber}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 16,
                      boxShadow: 'var(--shadow-sm)',
                      position: 'relative'
                    }}
                  >
                    {/* Header */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 8,
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: 10,
                      marginBottom: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-info" style={{ fontWeight: 600, fontSize: 12 }}>
                          Supplementary Report #{report.reportNumber}
                        </span>
                        <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                          Sec 193(9) BNSS
                        </span>
                        {report.fslNotified && (
                          <span className="badge badge-warning" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            🔬 FSL Notified
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={13} /> {fmtDate(report.createdAt)}
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          Investigating Officer: {report.officerName || 'Police Officer'}
                        </span>
                      </div>
                    </div>

                    {/* Narrative */}
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {report.narrative}
                    </div>

                    {/* Discovered Items */}
                    {report.discoveredItems && (
                      <div style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        background: 'var(--bg-table-alt)',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13
                      }}>
                        <Package size={15} style={{ color: 'var(--navy-700)', flexShrink: 0 }} />
                        <div>
                          <strong>Recovered / Seized Items:</strong> {report.discoveredItems}
                        </div>
                      </div>
                    )}

                    {/* Cryptographic Seal */}
                    <div style={{
                      marginTop: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      borderTop: '1px dashed var(--border)',
                      paddingTop: 8
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={13} style={{ color: 'var(--emerald)' }} />
                        <span>Cryptographic Digest:</span>
                        <HashDisplay hash={report.sha256Hash} truncate />
                      </div>
                      {report.ledgerTxId ? (
                        <span className="badge badge-success" style={{ fontSize: 10 }}>
                          Anchored on Blockchain
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Timestamped &amp; Sealed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Linked Evidence Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Linked Evidence ({fir.linkedEvidence?.length || 0} files)</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Digital evidence items &amp; Section 63 BSA forensic certificates
              </span>
            </div>
            {/* Raw evidence upload transferred to Forensic Expert */}
            {isForensic && !isClosed && (
              <Link to={`/upload?tab=evidence&firId=${fir.id}`} className="btn btn-primary btn-sm">
                <Plus size={13} /> Attach Forensic Evidence Batch
              </Link>
            )}
          </div>
          <DataTable
            columns={EV_COLUMNS}
            data={fir.linkedEvidence || []}
            emptyMessage="No evidence files linked to this FIR yet. Forensic Experts may upload examination batches."
          />
        </div>
      </div>

      {/* ── Add Supplementary Report Modal ── */}
      {modalOpen && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 22, 40, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div className="modal-card" style={{
            background: 'var(--bg-card)',
            borderRadius: 10,
            width: '100%',
            maxWidth: 600,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Add Supplementary Case Diary Report
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Section 193(9) Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setModalOpen(false)}
                style={{ padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSupplementary} style={{ padding: 20 }}>
              {suppError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  {suppError}
                </div>
              )}

              <div style={{
                background: 'rgba(28, 58, 95, 0.05)',
                border: '1px solid rgba(28, 58, 95, 0.15)',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 12,
                color: 'var(--text-secondary)'
              }}>
                <strong>Report Number: #{supplementaryReports.length + 1} (Sequential Append-Only Entry)</strong>
                <div style={{ marginTop: 2 }}>
                  Investigating Officer: <strong>{user?.name}</strong> · Station: <strong>{fir.station || user?.station}</strong>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" htmlFor="supp-narrative">
                  Case Diary Investigative Findings &amp; Narrative <span style={{ color: 'var(--crimson)' }}>*</span>
                </label>
                <textarea
                  id="supp-narrative"
                  className="form-input"
                  rows={5}
                  placeholder="Record step-by-step investigation discoveries, witness interrogations, search memo outcomes, or newly identified suspects..."
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  required
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" htmlFor="supp-items">
                  Discovered / Seized Evidence Items (Seizure Memo)
                </label>
                <input
                  id="supp-items"
                  className="form-input"
                  placeholder="e.g. 1x Samsung S21 (IMEI 354...), 1x 2TB WD External HDD, SIM card"
                  value={discoveredItems}
                  onChange={(e) => setDiscoveredItems(e.target.value)}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  List any physical articles or digital storage media seized during this stage of the investigation.
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={fslNotified}
                    onChange={(e) => setFslNotified(e.target.checked)}
                  />
                  <span>
                    <strong>Notify Forensic Science Laboratory (FSL):</strong> Requisition formal forensic analysis for the seized electronic items.
                  </span>
                </label>
              </div>

              <div style={{
                background: 'rgba(212, 160, 23, 0.1)',
                border: '1px solid rgba(212, 160, 23, 0.3)',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 20,
                fontSize: 11,
                color: 'var(--text-primary)'
              }}>
                🔒 <strong>Append-Only Assurance:</strong> Under Section 193(9) BNSS, this entry cannot be modified or deleted after submission. A SHA-256 cryptographic seal will be computed and anchored.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModalOpen(false)}
                  disabled={submittingSupp}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submittingSupp}
                >
                  {submittingSupp ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                      Hashing &amp; Appending…
                    </>
                  ) : (
                    'Append to Investigation Diary'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
