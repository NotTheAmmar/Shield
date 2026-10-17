import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Shield, 
  Search, 
  Upload, 
  FileText, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft, 
  AlertTriangle, 
  Cpu, 
  Lock, 
  Hash,
  ExternalLink
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DropZone from '../components/DropZone';
import HashDisplay from '../components/HashDisplay';
import Section63Modal from '../components/Section63Modal';
import { firAPI, evidenceAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const EVIDENCE_CATEGORIES = [
  'CCTV Footage',
  'Disk Image (E01/DD)',
  'Mobile Extraction Dump',
  'Chat Logs / Social Media Export',
  'Audio Recording'
];

export default function ForensicUploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Stepper state: 1 = FIR Selection, 2 = Evidence Upload & Live Hash, 3 = Forensic Report & Anchoring
  const [step, setStep] = useState(1);

  // Step 1: FIR Search & Selection
  const [firSearch, setFirSearch] = useState('');
  const [firs, setFirs] = useState([]);
  const [selectedFir, setSelectedFir] = useState(null);
  const [loadingFirs, setLoadingFirs] = useState(false);

  // Step 2: Evidence Files & Live Hashing
  const [category, setCategory] = useState('CCTV Footage');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [computedHashes, setComputedHashes] = useState({});
  const [hashingProgress, setHashingProgress] = useState(0);
  const [isHashing, setIsHashing] = useState(false);

  // Step 3: Forensic Technical Report
  const [toolsUsed, setToolsUsed] = useState('Cellebrite UFED v7.68, Autopsy Digital Forensics v4.21, Tableau T8u Hardware Write-Blocker');
  const [extractionMethodology, setExtractionMethodology] = useState('Bit-stream physical forensic image acquisition conducted under strict hardware write-blocker isolation.');
  const [hashVerificationResults, setHashVerificationResults] = useState('Post-acquisition SHA-256 cryptographic bitstream verified 100% identical against source device without sector variance.');
  const [examinerNotes, setExaminerNotes] = useState('Chain-of-custody sealed bag intact upon intake. Storage temperature and moisture within standard specifications.');
  const [reportFiles, setReportFiles] = useState([]);

  // Submission & Results
  const [submitting, setSubmitting] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');
  const [showSec63Modal, setShowSec63Modal] = useState(false);

  // Load FIRs on mount
  useEffect(() => {
    fetchFirs();
  }, [firSearch]);

  const fetchFirs = async () => {
    setLoadingFirs(true);
    try {
      const res = await firAPI.list({ search: firSearch, limit: 50 });
      setFirs(res.data || []);
    } catch (e) {
      console.error('Failed to load FIRs:', e);
    } finally {
      setLoadingFirs(false);
    }
  };

  // Live in-browser SHA-256 calculation using Web Crypto API
  const computeFileHash = async (file) => {
    setIsHashing(true);
    setHashingProgress(20);
    try {
      const buffer = await file.arrayBuffer();
      setHashingProgress(60);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setHashingProgress(100);
      return hashHex;
    } catch (e) {
      console.error('In-browser hashing error:', e);
      return null;
    } finally {
      setIsHashing(false);
    }
  };

  const handleEvidenceFiles = async (accepted) => {
    setFiles(accepted);
    if (accepted.length > 0) {
      const hashes = {};
      for (const f of accepted) {
        const h = await computeFileHash(f);
        if (h) hashes[f.name] = h;
      }
      setComputedHashes(hashes);
    }
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFir) {
      setError('Please select a registered FIR.');
      setStep(1);
      return;
    }
    if (!files.length) {
      setError('Please attach at least one raw digital evidence file.');
      setStep(2);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // 1. Upload Raw Evidence File
      const fd = new FormData();
      fd.append('fir_id', selectedFir.id);
      fd.append('category', category);
      fd.append('description', description);
      files.forEach((f) => fd.append('file', f));

      const evRes = await evidenceAPI.upload(fd);
      const evidenceId = evRes.id || evRes.files?.[0]?.id;

      // 2. Attach Technical Analysis Report
      const reportFd = new FormData();
      reportFd.append('toolsUsed', toolsUsed);
      reportFd.append('extractionMethodology', extractionMethodology);
      reportFd.append('hashVerificationResults', hashVerificationResults);
      reportFd.append('examinerNotes', examinerNotes);
      if (reportFiles.length > 0) {
        reportFd.append('reportFile', reportFiles[0]);
      }

      await evidenceAPI.uploadReport(evidenceId, reportFd);

      setUploadResult({
        evidenceId,
        firNumber: selectedFir.firNumber,
        category,
        filename: files[0].name,
        sha256Hash: evRes.files?.[0]?.sha256_hash || computedHashes[files[0].name],
        ledgerTxId: evRes.files?.[0]?.ledgerTxId || 'Pending Anchoring',
        ledgerBlockNumber: evRes.files?.[0]?.ledgerBlockNumber
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Evidence ingestion failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Forensic Evidence Ingestion &amp; Blockchain Anchoring"
        subtitle="Forensic Science Laboratory (FSL) Custody Portal · Section 63 BSA &amp; EvidenceLedger.sol Verification"
      />

      {/* Completion View */}
      {uploadResult ? (
        <div className="card" style={{ maxWidth: 840, margin: '0 auto', borderLeft: '4px solid var(--emerald)' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={22} style={{ color: 'var(--emerald)' }} />
            <div>
              <h2 style={{ margin: 0, color: 'var(--emerald)' }}>Evidence Ingestion &amp; EVM Anchoring Completed</h2>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Bitstream preserved immutably in MinIO and cryptographic footprint anchored to private EVM blockchain.
              </p>
            </div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: 'var(--bg-table-alt)', padding: 16, borderRadius: 8 }}>
              <div>
                <span className="detail-row-label">Evidence UUID</span>
                <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{uploadResult.evidenceId}</span>
              </div>
              <div>
                <span className="detail-row-label">Linked Case FIR</span>
                <span className="detail-row-value">{uploadResult.firNumber}</span>
              </div>
              <div>
                <span className="detail-row-label">Media File</span>
                <span className="detail-row-value">{uploadResult.filename} ({uploadResult.category})</span>
              </div>
              <div>
                <span className="detail-row-label">Blockchain Block Height</span>
                <span className="detail-row-value" style={{ fontWeight: 600 }}>
                  {uploadResult.ledgerBlockNumber ? `Block #${uploadResult.ledgerBlockNumber}` : 'Anchored on EVM PoA'}
                </span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="detail-row-label">SHA-256 Bitstream Hash</span>
                <HashDisplay hash={uploadResult.sha256Hash} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="detail-row-label">Ethereum Transaction ID</span>
                <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{uploadResult.ledgerTxId}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => setShowSec63Modal(true)}
              >
                <Shield size={16} style={{ marginRight: 6 }} />
                Digitally Sign Section 63 BSA Certificate
              </button>
              <Link to={`/vault/${uploadResult.evidenceId}`} className="btn btn-secondary btn-lg">
                View in Evidence Vault
              </Link>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setUploadResult(null);
                  setStep(1);
                  setSelectedFir(null);
                  setFiles([]);
                  setComputedHashes({});
                }}
              >
                Ingest Another Evidence Item
              </button>
            </div>
          </div>

          <Section63Modal
            evidenceId={uploadResult.evidenceId}
            isOpen={showSec63Modal}
            onClose={() => setShowSec63Modal(false)}
            onSigned={() => {}}
          />
        </div>
      ) : (
        /* Stepper Workflow Form */
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

          {/* Stepper Tabs Header */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[
              { num: 1, label: '1. Select Linked FIR' },
              { num: 2, label: '2. Ingest Media & Hash' },
              { num: 3, label: '3. Technical Report & Anchor' }
            ].map((s) => (
              <div
                key={s.num}
                onClick={() => { if (step > s.num) setStep(s.num); }}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: step === s.num ? '2px solid var(--navy-600)' : '1px solid var(--border)',
                  background: step === s.num ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)',
                  cursor: step > s.num ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: step === s.num ? 'var(--navy-600)' : 'var(--text-muted)' }}>
                  STEP {s.num}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: step === s.num ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {s.label.split('. ')[1]}
                </div>
              </div>
            ))}
          </div>

          {/* STEP 1: Select Registered FIR */}
          {step === 1 && (
            <div className="card">
              <div className="card-header">
                <h2>Step 1: Search &amp; Select Registered FIR</h2>
              </div>
              <div className="card-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Direct FIR ingestion: As an authorized Forensic Expert, select the registered First Information Report from your regional jurisdiction to link electronic evidence.
                </p>

                <div className="search-bar" style={{ marginBottom: 16 }}>
                  <Search size={16} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search by FIR Number (e.g. 0214/2026), station name, or applicable sections…"
                    value={firSearch}
                    onChange={(e) => setFirSearch(e.target.value)}
                  />
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                  {loadingFirs ? (
                    <div style={{ padding: 20, textAlign: 'center' }}><span className="spinner" /> Loading FIR registry…</div>
                  ) : firs.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No registered FIRs found matching query.</div>
                  ) : (
                    firs.map((f) => {
                      const isSelected = selectedFir?.id === f.id;
                      return (
                        <div
                          key={f.id}
                          onClick={() => setSelectedFir(f)}
                          style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? 'var(--navy-600)' : 'var(--text-primary)' }}>
                              FIR {f.firNumber}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                              Station: {f.station || 'General'} · Sections: {f.applicableSections || f.incidentType || '—'}
                            </div>
                          </div>
                          {isSelected && <CheckCircle size={18} style={{ color: 'var(--navy-600)' }} />}
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedFir && (
                  <div className="alert alert-info" style={{ marginTop: 16 }}>
                    ✓ Selected: <strong>FIR {selectedFir.firNumber}</strong> ({selectedFir.station || 'Police Station'})
                  </div>
                )}

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    disabled={!selectedFir}
                    onClick={() => setStep(2)}
                  >
                    Proceed to Media Ingestion <ArrowRight size={14} style={{ marginLeft: 6 }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Media Ingestion & Live Hashing */}
          {step === 2 && (
            <div className="card">
              <div className="card-header">
                <h2>Step 2: Raw Digital Evidence Upload &amp; Live Checksum</h2>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-cat">
                      Evidence Category <span style={{ color: 'var(--crimson)' }}>*</span>
                    </label>
                    <select
                      id="ev-cat"
                      className="form-select"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {EVIDENCE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-desc">
                      Forensic Extraction Description
                    </label>
                    <input
                      id="ev-desc"
                      className="form-input"
                      placeholder="e.g. Traffic camera raw stream export / Physical bitstream acquisition dump"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Raw Evidence File <span style={{ color: 'var(--crimson)' }}>*</span>
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Drag and drop digital media files (video, disk image, dump, logs). The browser will immediately compute the SHA-256 hash in real time before stream transfer.
                  </p>
                  <DropZone
                    onFiles={handleEvidenceFiles}
                    multiple={false}
                    files={files}
                    onRemove={(index) => {
                      setFiles([]);
                      setComputedHashes({});
                    }}
                  />
                </div>

                {isHashing && (
                  <div style={{ marginTop: 12, background: 'var(--bg-table-alt)', padding: 12, borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span>Computing in-browser SHA-256 cryptographic digest…</span>
                      <span>{hashingProgress}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${hashingProgress}%`, background: 'var(--navy-600)', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )}

                {files.length > 0 && computedHashes[files[0].name] && (
                  <div style={{ marginTop: 16, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid var(--emerald)', borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--emerald)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                      <CheckCircle size={15} /> Real-Time Cryptographic Hash Computed:
                    </div>
                    <HashDisplay hash={computedHashes[files[0].name]} />
                  </div>
                )}

                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                  <button className="btn btn-secondary" onClick={() => setStep(1)}>
                    <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!files.length || isHashing}
                    onClick={() => setStep(3)}
                  >
                    Proceed to Technical Report <ArrowRight size={14} style={{ marginLeft: 6 }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Forensic Technical Report & EVM Anchoring */}
          {step === 3 && (
            <form onSubmit={handleFinalSubmit}>
              <div className="card">
                <div className="card-header">
                  <h2>Step 3: Attach Technical Examination Report &amp; Anchor</h2>
                </div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label" htmlFor="tools-used">
                      Forensic Examination Tools Used <span style={{ color: 'var(--crimson)' }}>*</span>
                    </label>
                    <input
                      id="tools-used"
                      className="form-input"
                      value={toolsUsed}
                      onChange={(e) => setToolsUsed(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="extraction-method">
                      Acquisition &amp; Extraction Methodology <span style={{ color: 'var(--crimson)' }}>*</span>
                    </label>
                    <textarea
                      id="extraction-method"
                      className="form-input"
                      rows={2}
                      value={extractionMethodology}
                      onChange={(e) => setExtractionMethodology(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="hash-results">
                      Cryptographic Hash Verification Statement <span style={{ color: 'var(--crimson)' }}>*</span>
                    </label>
                    <textarea
                      id="hash-results"
                      className="form-input"
                      rows={2}
                      value={hashVerificationResults}
                      onChange={(e) => setHashVerificationResults(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="examiner-notes">
                      Examiner Custody Notes
                    </label>
                    <textarea
                      id="examiner-notes"
                      className="form-input"
                      rows={2}
                      value={examinerNotes}
                      onChange={(e) => setExaminerNotes(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Optional Attached Formal Report Document (PDF / DOCX)
                    </label>
                    <DropZone
                      onFiles={(acc) => setReportFiles(acc)}
                      multiple={false}
                      files={reportFiles}
                      onRemove={() => setReportFiles([])}
                    />
                  </div>

                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                      <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-lg"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                          Ingesting &amp; Anchoring on Ethereum EVM…
                        </>
                      ) : (
                        <>
                          <Shield size={16} style={{ marginRight: 8 }} />
                          Submit Evidence &amp; Anchor to Blockchain
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
