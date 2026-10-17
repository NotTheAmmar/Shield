import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  RefreshCw, 
  Download, 
  BookOpen, 
  MapPin, 
  Camera, 
  Clock, 
  AlertTriangle, 
  FileText, 
  Loader, 
  Shield, 
  CheckCircle, 
  Cpu, 
  FileCheck 
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import HashDisplay from '../components/HashDisplay';
import FilePreview from '../components/FilePreview';
import Section63Modal from '../components/Section63Modal';
import { evidenceAPI, reportsAPI } from '../services/api';
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
  const [verifyState, setVerifyState] = useState('IDLE');
  const [verifyError, setVerifyError] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [forensicFlags, setForensicFlags] = useState([]);
  const [pdfState, setPdfState] = useState('IDLE');
  const [showSec63Modal, setShowSec63Modal] = useState(false);

  // Quick report upload state for forensic experts if none attached yet
  const [showAttachReport, setShowAttachReport] = useState(false);
  const [toolsInput, setToolsInput] = useState('');
  const [methodInput, setMethodInput] = useState('');
  const [resultsInput, setResultsInput] = useState('');
  const [attachingReport, setAttachingReport] = useState(false);

  useEffect(() => {
    fetchEvidenceDetails();
  }, [id]);

  const fetchEvidenceDetails = () => {
    setLoading(true);
    evidenceAPI.get(id)
      .then((d) => setEv(d))
      .catch(() => setError('Evidence record not found.'))
      .finally(() => setLoading(false));

    reportsAPI.getMetadata(id)
      .then((d) => {
        setMetadata(d.metadata);
        setForensicFlags(d.forensicFlags || []);
      })
      .catch(() => {});
  };

  const handleVerify = async () => {
    setVerifyState('LOADING');
    setVerifyError('');
    try {
      const res = await evidenceAPI.verify(id);
      if (res.status === 'VERIFIED' || res.status === 'OK' || res.match === true) {
        setVerifyState('VERIFIED');
        setEv((e) => e ? { ...e, status: 'verified' } : e);
      } else {
        setVerifyState('TAMPERED');
        setEv((e) => e ? { ...e, status: 'tampered' } : e);
      }
    } catch (err) {
      setVerifyError(err?.response?.data?.error || err.message || 'Verification database unreachable.');
      setVerifyState('ERROR');
    }
  };

  const handleAttachReportSubmit = async (e) => {
    e.preventDefault();
    setAttachingReport(true);
    try {
      const fd = new FormData();
      fd.append('toolsUsed', toolsInput);
      fd.append('extractionMethodology', methodInput);
      fd.append('hashVerificationResults', resultsInput);
      await evidenceAPI.uploadReport(id, fd);
      setShowAttachReport(false);
      fetchEvidenceDetails();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to attach report');
    } finally {
      setAttachingReport(false);
    }
  };

  if (loading) return <div className="loading-state"><span className="spinner" /><span>Loading evidence…</span></div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!ev) return null;

  const isCertified = ev.sec63Status === 'CERTIFIED' || ev.certificateStatus === 'COMPLETED';
  const isForensicExpert = role === 'forensic_expert' || role === 'admin';

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
        {/* Left Column — Metadata + Blockchain Proof + Section 63 */}
        <div className="detail-section">

          {/* Forensic Flags Banner */}
          {forensicFlags.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--crimson)' }}>
              <div className="card-header"><h2 style={{ color: 'var(--crimson)' }}><AlertTriangle size={16} style={{ marginRight: 6 }} />Forensic Alerts</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {forensicFlags.map((f, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: f.flags.includes('SOCIAL_MEDIA_WIPE') ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)', fontSize: 13 }}>
                    <strong>{f.flags.join(', ')}</strong>
                    <span style={{ opacity: 0.7, marginLeft: 8 }}>{new Date(f.loggedAt).toLocaleString()}</span>
                    {f.details && Object.keys(f.details).length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8, fontFamily: 'var(--font-mono)' }}>
                        {JSON.stringify(f.details, null, 0).substring(0, 200)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Metadata Card */}
          <div className="card">
            <div className="card-header"><h2>File Metadata &amp; Case Linkage</h2></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="detail-row">
                  <span className="detail-row-label">File Name</span>
                  <span className="detail-row-value">{ev.fileName}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Integrity Status</span>
                  <div><StatusBadge status={ev.status} /></div>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Linked Case FIR</span>
                  <Link to={`/fir/${ev.firId}`} className="cell-link" style={{ fontSize: 14 }}>{ev.firNumber}</Link>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Evidence Category</span>
                  <span className="detail-row-value" style={{ textTransform: 'capitalize' }}>{ev.category}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Jurisdictional Police Station</span>
                  <span className="detail-row-value">{ev.station || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Ingested By</span>
                  <span className="detail-row-value">{ev.uploadedBy?.name || ev.uploaderName || 'Forensic Expert'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">FSL Analyst ID / Emp ID</span>
                  <span className="detail-row-value">{ev.uploadedBy?.employeeId || ev.uploaderEmployeeId || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Ingestion Date</span>
                  <span className="detail-row-value">{fmtDate(ev.uploadDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">File Size</span>
                  <span className="detail-row-value">{fmtBytes(ev.fileSize)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">MIME Type</span>
                  <span className="detail-row-value">{ev.mimeType || 'application/octet-stream'}</span>
                </div>
                {ev.description && (
                  <div className="detail-row" style={{ gridColumn: '1 / -1' }}>
                    <span className="detail-row-label">Forensic Notes</span>
                    <span className="detail-row-value">{ev.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prominent Cryptographic Proof Card (Person 3) */}
          <div className="card" style={{ borderLeft: '4px solid var(--navy-600)' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} style={{ color: 'var(--navy-600)' }} />
                <h2 style={{ margin: 0 }}>On-Chain Cryptographic Integrity Record</h2>
              </div>
              <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--navy-600)', border: '1px solid var(--navy-600)' }}>
                EvidenceLedger.sol (EVM PoA)
              </span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <HashDisplay hash={ev.hash} label="SHA-256 Bitstream Hash (FIPS 180-4)" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-table-alt)', padding: 12, borderRadius: 6 }}>
                <div>
                  <span className="detail-row-label">Ethereum Transaction Hash (TxID)</span>
                  <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {ev.ledgerTxId || '0xpending_or_anchored_on_poa'}
                  </span>
                </div>
                <div>
                  <span className="detail-row-label">EVM Block Height</span>
                  <span className="detail-row-value" style={{ fontWeight: 600 }}>
                    {ev.ledgerBlockNumber ? `Block #${ev.ledgerBlockNumber}` : 'Anchored'}
                  </span>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-row-label">Blockchain Consensus Timestamp</span>
                  <span className="detail-row-value">{fmtDate(ev.ledgerTimestamp)}</span>
                </div>
              </div>

              {/* 1-Click Verification Instant Feedback */}
              {verifyState === 'LOADING' && (
                <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Streaming live file from MinIO storage &amp; validating against smart contract state…
                </div>
              )}
              {verifyState === 'VERIFIED' && (
                <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={16} />
                  <strong>✓ INTEGRITY VERIFIED:</strong> Live MinIO bitstream matches immutable Ethereum EVM state 100%. No tampering detected.
                </div>
              )}
              {verifyState === 'TAMPERED' && (
                <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} />
                  <strong>🚨 CRITICAL TAMPER DETECTED:</strong> Live file hash in MinIO storage differs from on-chain smart contract record! Evidence chain-of-custody compromised.
                </div>
              )}
              {verifyState === 'ERROR' && (
                <div className="alert" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                  ⚠ Verification lookup failed ({verifyError}).
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={handleVerify} disabled={verifyState === 'LOADING'}>
                  {verifyState === 'LOADING' ? (
                    <><span className="spinner" style={{ width: 14, height: 14 }} /> Verifying On-Chain…</>
                  ) : (
                    <><RefreshCw size={14} style={{ marginRight: 6 }} /> Verify On-Chain Integrity</>
                  )}
                </button>
                <a href={evidenceAPI.downloadUrl(ev.id)} download={ev.fileName} className="btn btn-secondary">
                  <Download size={14} style={{ marginRight: 6 }} /> Download Raw Media
                </a>
              </div>
            </div>
          </div>

          {/* Section 63 BSA Certificate Card (Person 3) */}
          <div className="card" style={{ borderLeft: isCertified ? '4px solid var(--emerald)' : '4px solid var(--amber)' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCheck size={18} style={{ color: isCertified ? 'var(--emerald)' : 'var(--amber)' }} />
                <h2 style={{ margin: 0 }}>Section 63(4) BSA Electronic Evidence Certificate</h2>
              </div>
              <span className="badge" style={{ backgroundColor: isCertified ? 'var(--emerald)' : 'var(--amber)', color: '#fff' }}>
                {isCertified ? 'CERTIFIED & SEALED' : 'PENDING CERTIFICATION'}
              </span>
            </div>
            <div className="card-body">
              {isCertified ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    Official statutory certificate generated under Section 63(4) of Bharatiya Sakshya Adhiniyam, 2023. Certifies bitstream provenance, device integrity, and Ethereum ledger anchoring for court admissibility.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--bg-table-alt)', padding: 12, borderRadius: 6, fontSize: 12 }}>
                    <div><strong>Certifying Examiner:</strong> {ev.sec63SignatoryName || 'Examiner of Electronic Evidence'}</div>
                    <div><strong>Analyst ID:</strong> {ev.sec63AnalystId || 'FSL-EXP-2026'}</div>
                    <div><strong>Certified Date:</strong> {fmtDate(ev.sec63SignedAt)}</div>
                    <div><strong>Laboratory:</strong> {ev.sec63FslLab || 'Regional Forensic Science Laboratory'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button className="btn btn-primary" onClick={() => window.open(evidenceAPI.certificateUrl(id), '_blank')}>
                      <Download size={14} style={{ marginRight: 6 }} /> Download Section 63 BSA Certificate (PDF)
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowSec63Modal(true)}>
                      <FileText size={14} style={{ marginRight: 6 }} /> View Certificate Declaration
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    Under Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023, electronic evidence requires a statutory certificate signed by an authorized Examiner of Electronic Evidence for court admissibility.
                  </p>
                  {isForensicExpert ? (
                    <div>
                      <button className="btn btn-primary" onClick={() => setShowSec63Modal(true)}>
                        <Shield size={14} style={{ marginRight: 6 }} />
                        Digitally Sign &amp; Issue Section 63 Certificate
                      </button>
                    </div>
                  ) : (
                    <div className="alert alert-info" style={{ margin: 0, fontSize: 13 }}>
                      Awaiting authorized Forensic Science Laboratory expert to issue and seal the Section 63 certificate.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Technical Examination Report Card (Person 3) */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} style={{ color: 'var(--navy-600)' }} />
                <h2 style={{ margin: 0 }}>Forensic Technical Examination Report</h2>
              </div>
              {ev.hasReport && (
                <span className="badge" style={{ backgroundColor: 'var(--emerald)', color: '#fff' }}>
                  ATTACHED
                </span>
              )}
            </div>
            <div className="card-body">
              {ev.hasReport || ev.reportTools ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                  <div className="detail-row">
                    <span className="detail-row-label">Tools Used</span>
                    <span className="detail-row-value">{ev.reportTools || ev.report?.tools_used || 'Forensic Workstation Suite'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row-label">Acquisition Methodology</span>
                    <span className="detail-row-value">{ev.reportMethodology || ev.report?.extraction_methodology || 'Bitstream Image Extraction'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row-label">Hash Verification</span>
                    <span className="detail-row-value">{ev.reportResults || ev.report?.hash_verification_results || 'Verified'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-row-label">Attached Document</span>
                    <span className="detail-row-value">{ev.reportFilename || ev.report?.filename || 'Examination_Report.pdf'}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <a href={evidenceAPI.reportDownloadUrl(id)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                      <Download size={13} style={{ marginRight: 6 }} /> Download Examination Report Document
                    </a>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    No formal forensic analysis document attached yet for this evidence.
                  </p>
                  {isForensicExpert && !showAttachReport && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAttachReport(true)}>
                      + Attach Examination Report
                    </button>
                  )}
                  {showAttachReport && (
                    <form onSubmit={handleAttachReportSubmit} style={{ border: '1px solid var(--border)', padding: 14, borderRadius: 6, background: 'var(--bg-table-alt)' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Tools Used</label>
                        <input className="form-input" placeholder="e.g. Autopsy v4.21, Cellebrite UFED" value={toolsInput} onChange={(e) => setToolsInput(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Methodology</label>
                        <input className="form-input" placeholder="Bit-stream acquisition under write-blocker" value={methodInput} onChange={(e) => setMethodInput(e.target.value)} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: 12 }}>Verification Results</label>
                        <input className="form-input" placeholder="SHA-256 bitstream match verified" value={resultsInput} onChange={(e) => setResultsInput(e.target.value)} required />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={attachingReport}>
                          {attachingReport ? 'Saving…' : 'Save Report'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAttachReport(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Extracted EXIF Metadata */}
          {metadata && (
            <div className="card">
              <div className="card-header"><h2><Camera size={16} style={{ marginRight: 6 }} />Extracted Media Metadata</h2></div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {metadata.gpsLat && metadata.gpsLng && (
                    <div className="detail-row">
                      <span className="detail-row-label"><MapPin size={12} /> GPS Coordinates</span>
                      <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {Number(metadata.gpsLat).toFixed(6)}, {Number(metadata.gpsLng).toFixed(6)}
                      </span>
                    </div>
                  )}
                  {metadata.cameraMake && (
                    <div className="detail-row">
                      <span className="detail-row-label"><Camera size={12} /> Camera / Capture Device</span>
                      <span className="detail-row-value">{metadata.cameraMake} {metadata.cameraModel || ''}</span>
                    </div>
                  )}
                  {metadata.originalDate && (
                    <div className="detail-row">
                      <span className="detail-row-label"><Clock size={12} /> Original Capture Timestamp</span>
                      <span className="detail-row-value">{new Date(metadata.originalDate).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Column — File Preview & Quick Actions */}
        <div>
          <div className="card">
            <div className="card-header"><h2>Media Stream Preview</h2></div>
            <div className="card-body">
              <FilePreview fileUrl={ev.fileUrl} mimeType={ev.mimeType} fileName={ev.fileName} />
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header"><h2>Quick Actions</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-secondary btn-block" onClick={handleVerify} disabled={verifyState === 'LOADING'}>
                <RefreshCw size={14} style={{ marginRight: 6 }} /> Check On-Chain Integrity
              </button>
              <button className="btn btn-secondary btn-block" onClick={() => setShowSec63Modal(true)}>
                <Shield size={14} style={{ marginRight: 6 }} /> {isCertified ? 'View Section 63 Certificate' : 'Issue Section 63 Certificate'}
              </button>
              <a href={evidenceAPI.downloadUrl(ev.id)} download={ev.fileName} className="btn btn-secondary btn-block">
                <Download size={14} style={{ marginRight: 6 }} /> Download Original File
              </a>
              {role === 'judicial_authority' && (
                <Link to={`/audit?targetId=${ev.id}`} className="btn btn-ghost btn-block">
                  <BookOpen size={14} style={{ marginRight: 6 }} /> View Chain-of-Custody Audit Trail
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 63 Certificate Signing & Preview Modal */}
      <Section63Modal
        evidenceId={id}
        isOpen={showSec63Modal}
        onClose={() => setShowSec63Modal(false)}
        onSigned={() => fetchEvidenceDetails()}
      />
    </>
  );
}
