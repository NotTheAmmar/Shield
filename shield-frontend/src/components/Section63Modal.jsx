import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Download, FileText, Shield, AlertTriangle, Key } from 'lucide-react';
import SignaturePad from './SignaturePad';
import HashDisplay from './HashDisplay';
import { evidenceAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function Section63Modal({ evidenceId, isOpen, onClose, onSigned }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [useCryptoSign, setUseCryptoSign] = useState(false);
  const [signedSuccess, setSignedSuccess] = useState(false);
  const [certPath, setCertPath] = useState('');

  useEffect(() => {
    if (!isOpen || !evidenceId) return;
    setLoading(true);
    setError('');
    setSignedSuccess(false);

    evidenceAPI.getCertificateData(evidenceId)
      .then((res) => {
        setData(res);
        if (res.sec63Status === 'CERTIFIED') {
          setSignedSuccess(true);
          setCertPath(res.sec63CertPath || '');
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.error || err.message || 'Failed to load Section 63 certificate preview');
      })
      .finally(() => setLoading(false));
  }, [isOpen, evidenceId]);

  if (!isOpen) return null;

  const handleSign = async () => {
    if (!useCryptoSign && !signatureData) {
      alert('Please provide a handwritten signature or toggle cryptographic EVM signing.');
      return;
    }

    setSigning(true);
    setError('');
    try {
      const payload = {
        signatureBase64: useCryptoSign ? null : signatureData
      };
      const res = await evidenceAPI.signCertificate(evidenceId, payload);
      setSignedSuccess(true);
      setCertPath(res.certPath);
      if (onSigned) onSigned(res);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to sign Section 63 Certificate');
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadPdf = () => {
    window.open(evidenceAPI.certificateUrl(evidenceId), '_blank');
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(3px)',
      padding: 16
    }}>
      <div
        className="modal-container card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 780,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
          border: '1px solid var(--border)'
        }}
      >
        {/* Header */}
        <div className="card-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          padding: '16px 20px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} style={{ color: 'var(--navy-600)' }} />
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Section 63(4) BSA Certificate of Electronic Evidence</h2>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Bharatiya Sakshya Adhiniyam, 2023 · Statutory Certificate of Authenticity &amp; EVM Ledger Anchoring
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="card-body" style={{ overflowY: 'auto', padding: '20px' }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <span className="spinner" style={{ width: 24, height: 24, marginBottom: 12 }} />
              <p style={{ color: 'var(--text-secondary)' }}>Generating statutory preview from blockchain &amp; case repository…</p>
            </div>
          )}

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!loading && data && (
            <>
              {signedSuccess && (
                <div className="alert alert-success" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle size={18} />
                    <div>
                      <strong>Section 63(4) BSA Certificate Legally Issued &amp; Sealed</strong>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>Court-admissible PDF generated and stored immutably in MinIO.</div>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleDownloadPdf}>
                    <Download size={14} /> Download PDF
                  </button>
                </div>
              )}

              {/* Statutory Certificate Preview Paper Container */}
              <div style={{
                background: 'var(--bg-table-alt)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '20px',
                marginBottom: 20
              }}>
                <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                    GOVERNMENT OF INDIA · FORENSIC SCIENCE LABORATORY (FSL)
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                    CERTIFICATE UNDER SECTION 63(4) OF THE BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023
                  </div>
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: 2 }}>
                    (Admissibility of Electronic Records · Official Certificate of Examiner of Electronic Evidence)
                  </div>
                </div>

                {/* Grid 1: Case & Evidence Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 16 }}>
                  <div><strong>FIR Number:</strong> {data.firNumber || '—'}</div>
                  <div><strong>Police Station:</strong> {data.station || '—'}</div>
                  <div><strong>Media Filename:</strong> {data.filename}</div>
                  <div><strong>Category:</strong> <span style={{ textTransform: 'capitalize' }}>{data.category}</span></div>
                  <div><strong>File Size:</strong> {data.fileSize ? `${(data.fileSize / (1024 * 1024)).toFixed(2)} MB` : '—'}</div>
                  <div><strong>MIME Type:</strong> {data.mimeType || '—'}</div>
                </div>

                {/* Section 2: Cryptographic Proof */}
                <div style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    IMMUTABLE CRYPTOGRAPHIC IDENTIFIER (SHA-256)
                  </div>
                  <HashDisplay hash={data.sha256Hash} />
                  
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Ethereum TxHash: </span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{data.ledgerTxId ? `${data.ledgerTxId.slice(0, 20)}…` : 'Anchored on PoA'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>EVM Block Height: </span>
                      <span style={{ fontWeight: 600 }}>{data.ledgerBlockNumber ? `#${data.ledgerBlockNumber}` : 'Verified'}</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Forensic Methodology */}
                <div style={{ fontSize: 12, marginBottom: 16, color: 'var(--text-secondary)' }}>
                  <div><strong>Tools Used:</strong> {data.toolsUsed}</div>
                  <div style={{ marginTop: 4 }}><strong>Acquisition Methodology:</strong> {data.extractionMethodology}</div>
                  <div style={{ marginTop: 4 }}><strong>Integrity Verification:</strong> {data.hashVerificationResults}</div>
                </div>

                {/* Section 4: Legal Affirmation Text */}
                <div style={{
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: 'var(--text-primary)'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--navy-600)' }}>
                    Statutory Affirmation (Section 63(4) BSA 2023):
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{data.statutoryDeclaration}</p>
                </div>

                {/* Section 5: Examiner Particulars */}
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div><strong>Examiner:</strong> {data.expertName}</div>
                  <div><strong>Analyst ID:</strong> {data.analystId}</div>
                  <div><strong>Designation:</strong> {data.designation}</div>
                  <div><strong>Laboratory:</strong> {data.fslLab}</div>
                </div>
              </div>

              {/* Signature Section */}
              {!signedSuccess && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                      Examiner Digital Signature / Seal <span style={{ color: 'var(--crimson)' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${!useCryptoSign ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setUseCryptoSign(false)}
                      >
                        Handwritten Signature Pad
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${useCryptoSign ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setUseCryptoSign(true)}
                      >
                        <Key size={13} style={{ marginRight: 4 }} />
                        EVM Cryptographic Seal
                      </button>
                    </div>
                  </div>

                  {useCryptoSign ? (
                    <div style={{
                      padding: 20,
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px dashed var(--emerald)',
                      borderRadius: 6,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--emerald)' }}>
                        ✓ Cryptographic Seal Mode Active
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                        This certificate will be signed using your provisioned Ethereum keypair: <br />
                        <code style={{ fontSize: 11 }}>{user?.blockchainAddress || '0x45a999... [Authorized FSL Expert Key]'}</code>
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                        Draw your signature on the canvas below to embed into the official Section 63(4) court certificate:
                      </p>
                      <SignaturePad
                        onSign={(dataUrl) => setSignatureData(dataUrl)}
                        onClear={() => setSignatureData(null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="card-footer" style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-table-alt)'
        }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={signing}>
            Close
          </button>
          {signedSuccess ? (
            <button className="btn btn-primary" onClick={handleDownloadPdf}>
              <Download size={14} style={{ marginRight: 6 }} /> Download Court-Admissible PDF
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={signing || loading || (!useCryptoSign && !signatureData)}
              onClick={handleSign}
            >
              {signing ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />
                  Signing &amp; Archiving to MinIO…
                </>
              ) : (
                <>
                  <Shield size={14} style={{ marginRight: 6 }} />
                  Digitally Sign &amp; Issue Section 63 Certificate
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
