import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, CheckCircle2, Clock, AlertCircle, FileText, Scale, ExternalLink, RefreshCw, BookOpen, Archive } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { judgeAPI } from '../services/api';
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

export default function SessionsJudgePage() {
  const { user } = useAuth();
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filter, setFilter] = useState('ALL');

  // Status update modal
  const [selectedCase, setSelectedCase] = useState(null);
  const [targetStatus, setTargetStatus] = useState('UNDER_TRIAL');
  const [remarks, setRemarks] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await judgeAPI.getTrialRoster();
      setRoster(res.roster || []);
    } catch (err) {
      console.error('Failed to load trial roster:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to retrieve trial roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;
    setUpdating(true);
    setError('');
    try {
      await judgeAPI.updateCaseStatus(selectedCase.id, {
        status: targetStatus,
        remarks
      });
      setSuccessMsg(`Case ${selectedCase.firNumber} status updated to ${targetStatus}.`);
      setSelectedCase(null);
      setRemarks('');
      await loadRoster();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Status update failed');
    } finally {
      setUpdating(false);
    }
  };

  const committedCount = roster.filter(c => c.status === 'COMMITTED_FOR_TRIAL').length;
  const underTrialCount = roster.filter(c => c.status === 'UNDER_TRIAL').length;
  const disposedCount = roster.filter(c => c.status === 'DISPOSED' || c.status === 'JUDGED').length;

  const filteredRoster = roster.filter(c => {
    if (filter === 'COMMITTED_FOR_TRIAL') return c.status === 'COMMITTED_FOR_TRIAL';
    if (filter === 'UNDER_TRIAL') return c.status === 'UNDER_TRIAL';
    if (filter === 'DISPOSED') return c.status === 'DISPOSED' || c.status === 'JUDGED';
    return true;
  });

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
      <PageHeader
        title="Sessions Judge Trial Bench"
        subtitle={`Presiding Judge: ${user?.name || 'Hon. Sessions Judge'} · Courtroom: ${user?.sessionsCourtId || 'Sessions Division Court'}`}
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

      {/* KPI Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: 24 }}>
        <StatCard label="Total Trial Roster" value={roster.length} icon={Gavel} accent="var(--navy-700)" />
        <StatCard label="Committed for Trial" value={committedCount} icon={Clock} accent="var(--amber)" />
        <StatCard label="Under Active Trial" value={underTrialCount} icon={AlertCircle} accent="var(--navy-700)" />
        <StatCard label="Disposed / Judged" value={disposedCount} icon={CheckCircle2} accent="var(--emerald)" />
      </div>

      {/* Main Trial Roster Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
              <Gavel size={18} color="var(--navy-700)" />
              Sessions Courtroom Trial Roster
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Criminal cases committed from the Judicial Magistrate bench for full sessions trial proceedings.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', background: 'var(--bg-page)', borderRadius: 6, padding: 3, border: '1px solid var(--border)' }}>
              {['ALL', 'COMMITTED_FOR_TRIAL', 'UNDER_TRIAL', 'DISPOSED'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    background: filter === tab ? 'var(--navy-700)' : 'transparent',
                    color: filter === tab ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {tab === 'ALL' ? 'All Cases' : tab === 'COMMITTED_FOR_TRIAL' ? 'Committed' : tab === 'UNDER_TRIAL' ? 'Under Trial' : 'Disposed'}
                </button>
              ))}
            </div>

            <button className="btn btn-secondary" onClick={loadRoster} disabled={loading} style={{ fontSize: 12, padding: '5px 10px' }}>
              <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {filteredRoster.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No cases found matching the current roster filter.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Case / FIR Number</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Station &amp; Sections</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Committal Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Evidence &amp; Diary</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Approved Counsel</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Trial Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Lifecycle Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((caseItem) => {
                    const advocates = caseItem.approvedAdvocates || [];

                    return (
                      <tr key={caseItem.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <Link to={`/fir/${caseItem.id}`} className="cell-link" style={{ fontWeight: 600 }}>
                            {caseItem.firNumber}
                          </Link>
                          {caseItem.caseCategory && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseItem.caseCategory}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12 }}>
                          <div style={{ fontWeight: 500 }}>{caseItem.station || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseItem.applicableSections || '—'}</div>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12 }}>
                          {fmtDate(caseItem.committalDate || caseItem.registeredAt)}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12 }}>
                          <div>📁 <strong>{caseItem.evidenceCount || 0}</strong> evidence files</div>
                          <div>📖 <strong>{caseItem.supplementaryCount || 0}</strong> diary reports</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {advocates.length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No appearance filed</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {advocates.map((adv) => (
                                <div key={adv.id} style={{ fontSize: 11 }}>
                                  <span style={{
                                    fontWeight: 600,
                                    color: adv.designation === 'DEFENSE_COUNSEL' ? '#3B82F6' : '#A855F7'
                                  }}>
                                    [{adv.designation === 'DEFENSE_COUNSEL' ? 'DEF' : 'PROS'}]
                                  </span>{' '}
                                  Adv. {adv.advocateName}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="badge" style={{
                            background: caseItem.status === 'UNDER_TRIAL'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : caseItem.status === 'COMMITTED_FOR_TRIAL'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                            color: caseItem.status === 'UNDER_TRIAL'
                              ? '#3B82F6'
                              : caseItem.status === 'COMMITTED_FOR_TRIAL'
                              ? '#F59E0B'
                              : '#10B981',
                            padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                          }}>
                            {caseItem.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setSelectedCase(caseItem);
                              setTargetStatus(caseItem.status === 'COMMITTED_FOR_TRIAL' ? 'UNDER_TRIAL' : 'DISPOSED');
                            }}
                            style={{ fontSize: 11, padding: '4px 10px' }}
                          >
                            Update Trial Status
                          </button>
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

      {/* Trial Status Update Modal */}
      {selectedCase && (
        <div className="modal-backdrop" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-card" style={{
            background: 'var(--bg-card)', borderRadius: 8, width: 480, maxWidth: '90%',
            border: '1px solid var(--border)', padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Update Case Trial Lifecycle Status</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Transition trial state for Case <strong>{selectedCase.firNumber}</strong>. Updates will be cryptographically logged to the system audit trail.
            </p>

            <form onSubmit={handleStatusSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Select New Trial State</label>
                <select
                  className="input"
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="COMMITTED_FOR_TRIAL">COMMITTED_FOR_TRIAL (Awaiting First Roster Call)</option>
                  <option value="UNDER_TRIAL">UNDER_TRIAL (Witness Examination &amp; Evidence Hearing)</option>
                  <option value="DISPOSED">DISPOSED / JUDGED (Final Judgment Pronounced)</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Judicial Bench Order Remarks</label>
                <textarea
                  className="input"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Formal charges framed under Sec 303 BNS. Trial hearings commenced..."
                  rows={3}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedCase(null)}
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updating}
                >
                  {updating ? 'Updating Status...' : 'Apply Trial Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
