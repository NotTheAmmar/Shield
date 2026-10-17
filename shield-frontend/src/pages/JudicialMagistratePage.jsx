import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Clock, AlertTriangle, CheckCircle, ArrowRight, ShieldCheck, FileText, Check, X, ExternalLink, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { judicialAPI, firAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function JudicialMagistratePage() {
  const { user } = useAuth();
  const [feed, setFeed] = useState([]);
  const [pendingVaks, setPendingVaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Committal Modal State
  const [committalTarget, setCommittalTarget] = useState(null);
  const [courtroom, setCourtroom] = useState('Sessions Court, Pune');
  const [remarks, setRemarks] = useState('');
  const [committing, setCommitting] = useState(false);

  // Verification state per FIR
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResults, setVerifyResults] = useState({});

  // Reviewing Vakalatnama state
  const [reviewingId, setReviewingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [feedRes, vakRes] = await Promise.all([
        judicialAPI.getFeed(),
        judicialAPI.getPendingVakalatnama()
      ]);
      setFeed(feedRes.data || []);
      setPendingVaks(vakRes.requests || []);
    } catch (err) {
      console.error('Failed to load judicial data:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to connect to judicial pre-trial registry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle 1-Click FIR verification
  const handleVerifyFir = async (firId) => {
    setVerifyingId(firId);
    try {
      const res = await firAPI.verify(firId);
      const isOk = res.status === 'verified' || res.status === 'OK' || res.match === true;
      setVerifyResults(prev => ({
        ...prev,
        [firId]: { status: isOk ? 'VERIFIED' : 'TAMPERED', hash: res.currentHash }
      }));
    } catch (err) {
      setVerifyResults(prev => ({
        ...prev,
        [firId]: { status: 'ERROR', error: err.message }
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  // Handle case committal submission
  const handleCommitSubmit = async (e) => {
    e.preventDefault();
    if (!committalTarget) return;
    setCommitting(true);
    setError('');
    try {
      await judicialAPI.commitCase(committalTarget.id, {
        sessionsCourtId: courtroom,
        committalRemarks: remarks
      });
      setSuccessMsg(`FIR ${committalTarget.firNumber} successfully committed to ${courtroom} for trial.`);
      setCommittalTarget(null);
      setRemarks('');
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Committal failed');
    } finally {
      setCommitting(false);
    }
  };

  // Handle Vakalatnama Review (Approve / Reject)
  const handleReviewVakalatnama = async (id, action) => {
    let rejectionReason = null;
    if (action === 'REJECT') {
      rejectionReason = window.prompt('Please enter the judicial ground for rejecting this Vakalatnama:');
      if (rejectionReason === null) return; // user cancelled
    }
    setReviewingId(id);
    try {
      await judicialAPI.reviewVakalatnama(id, { action, rejectionReason });
      setSuccessMsg(`Vakalatnama representation ${action === 'APPROVE' ? 'approved' : 'rejected'}.`);
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Review action failed');
    } finally {
      setReviewingId(null);
    }
  };

  const withinCount = feed.filter(f => f.statutory_24h_status === 'WITHIN_LIMIT').length;
  const expiredCount = feed.filter(f => f.statutory_24h_status === 'EXPIRED').length;
  const committedCount = feed.filter(f => f.status === 'COMMITTED_FOR_TRIAL').length;

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
      <PageHeader
        title="Judicial Magistrate Pre-Trial Bench"
        subtitle={`Presiding Magistrate: ${user?.name || 'Hon. Judicial Magistrate'} · Section 176 BNSS Statutory Compliance & Committal`}
      />

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <span>⚠️ {error}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: 20 }}>
          <span>✅ {successMsg}</span>
        </div>
      )}

      {/* Summary KPI Grid */}
      <div className="stat-cards-grid" style={{ marginBottom: 24 }}>
        <StatCard label="Jurisdiction FIRs" value={feed.length} icon={FileText} accent="var(--navy-700)" />
        <StatCard label="Within 24-Hr Limit" value={withinCount} icon={CheckCircle} accent="var(--emerald)" />
        <StatCard label="24-Hr Clock Expired" value={expiredCount} icon={AlertTriangle} accent="var(--crimson)" />
        <StatCard label="Pending Vakalatnamas" value={pendingVaks.length} icon={Scale} accent="var(--amber)" />
      </div>

      {/* Section 1: 24-Hour Statutory Compliance Queue (Section 176 BNSS) */}
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
              <Clock size={18} color="var(--navy-700)" />
              Section 176 BNSS 24-Hour Statutory Compliance Queue
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Strict legal requirement under Bharatiya Nagarik Suraksha Sanhita, 2023: police must transmit FIR records to Magistrate within 24 hours of registration.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={loadData} disabled={loading} style={{ fontSize: 12, padding: '4px 10px' }}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {feed.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No FIRs registered in your assigned police stations.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>FIR Number</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Police Station</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Registered Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Statutory 24-Hr Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Evidence</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>On-Chain Integrity</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Committal Action</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map((fir) => {
                    const isWithin = fir.statutory_24h_status === 'WITHIN_LIMIT';
                    const verification = verifyResults[fir.id];
                    const isCommitted = fir.status === 'COMMITTED_FOR_TRIAL' || fir.trialStatus === 'COMMITTED_FOR_TRIAL';

                    return (
                      <tr key={fir.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <Link to={`/fir/${fir.id}`} className="cell-link" style={{ fontWeight: 600 }}>
                            {fir.firNumber}
                          </Link>
                          {fir.caseCategory && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fir.caseCategory}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13 }}>
                          {fir.station || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12 }}>
                          {fmtDate(fir.registeredAt)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {isWithin ? (
                            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
                              <CheckCircle size={12} />
                              WITHIN 24H ({fir.hours_remaining}h left)
                            </span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
                              <AlertTriangle size={12} />
                              EXPIRED (+{fir.hours_since_filing}h)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500 }}>
                          {fir.evidenceCount || 0} item(s)
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {verification ? (
                            <span className="badge" style={{
                              background: verification.status === 'VERIFIED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: verification.status === 'VERIFIED' ? '#10B981' : '#EF4444',
                              padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                            }}>
                              {verification.status}
                            </span>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleVerifyFir(fir.id)}
                              disabled={verifyingId === fir.id}
                              style={{ fontSize: 11, padding: '3px 8px' }}
                            >
                              <ShieldCheck size={12} /> {verifyingId === fir.id ? 'Checking...' : 'Verify Hash'}
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {isCommitted ? (
                            <span className="badge" style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 8px', fontSize: 11 }}>
                              Committed ({fir.sessionsCourtId || 'Sessions Court'})
                            </span>
                          ) : (
                            <button
                              className="btn btn-primary"
                              onClick={() => setCommittalTarget(fir)}
                              style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              Commit to Sessions <ArrowRight size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Pending Advocate Vakalatnama Approval Drawer */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <Scale size={18} color="var(--navy-700)" />
            Pending Advocate Vakalatnama Requests ({pendingVaks.length})
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Advocates must file a signed digital Vakalatnama for locus standi. Approval unlocks full case discovery and watermarked evidence inspection.
          </p>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {pendingVaks.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              No pending Vakalatnama applications awaiting review.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Advocate Name</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Bar Council Reg No</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Designation</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Target FIR</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Submission Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Document</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Judicial Review</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingVaks.map((req) => (
                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                        Adv. {req.advocateName}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                        {req.barEnrollmentNo}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className="badge" style={{
                          background: req.designation === 'DEFENSE_COUNSEL' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                          color: req.designation === 'DEFENSE_COUNSEL' ? '#3B82F6' : '#A855F7',
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                        }}>
                          {req.designation === 'DEFENSE_COUNSEL' ? 'Defense Counsel' : 'Prosecution'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 500 }}>{req.firNumber}</span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.station}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12 }}>
                        {fmtDate(req.createdAt)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <a
                          href={judicialAPI.vakalatnamaDocUrl(req.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="cell-link"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                          <ExternalLink size={12} /> Inspect PDF
                        </a>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleReviewVakalatnama(req.id, 'APPROVE')}
                            disabled={reviewingId === req.id}
                            style={{ fontSize: 11, padding: '4px 10px', background: 'var(--emerald)', borderColor: 'var(--emerald)' }}
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleReviewVakalatnama(req.id, 'REJECT')}
                            disabled={reviewingId === req.id}
                            style={{ fontSize: 11, padding: '4px 10px', color: 'var(--crimson)' }}
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Case Committal Modal */}
      {committalTarget && (
        <div className="modal-backdrop" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-card" style={{
            background: 'var(--bg-card)', borderRadius: 8, width: 480, maxWidth: '90%',
            border: '1px solid var(--border)', padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Commit Case to Sessions Court for Trial</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Under the Code of Criminal Procedure / BNSS 2023, committing this case transfers jurisdiction from the pre-trial Magistrate bench directly to the Sessions Judge Trial Court Roster.
            </p>

            <form onSubmit={handleCommitSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Target Case</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg-page)', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
                  {committalTarget.firNumber} — {committalTarget.station}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Target Sessions Court Roster</label>
                <input
                  type="text"
                  className="input"
                  value={courtroom}
                  onChange={(e) => setCourtroom(e.target.value)}
                  placeholder="e.g. Sessions Court, Pune"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Committal Order Notes / Remarks</label>
                <textarea
                  className="input"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Case prima facie established for trial under applicable sections..."
                  rows={3}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCommittalTarget(null)}
                  disabled={committing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={committing}
                >
                  {committing ? 'Committing Case...' : 'Execute Trial Committal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
