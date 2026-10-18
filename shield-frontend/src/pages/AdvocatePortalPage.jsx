import React, { useState, useEffect, useCallback } from 'react';
import { Briefcase, Search, Upload, FileText, CheckCircle, Clock, XCircle, Download, ExternalLink, ShieldAlert, RefreshCw, Eye } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { advocateAPI, evidenceAPI } from '../services/api';
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

export default function AdvocatePortalPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('VAULT'); // 'VAULT' | 'APPLICATIONS' | 'FILE'
  const [myCases, setMyCases] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filing Vakalatnama Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFir, setSelectedFir] = useState(null);
  const [designation, setDesignation] = useState('DEFENSE_COUNSEL');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Selected Case Detail View in Vault
  const [viewingCase, setViewingCase] = useState(null);

  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [casesRes, appsRes] = await Promise.all([
        advocateAPI.getMyCases(),
        advocateAPI.getMyApplications()
      ]);
      setMyCases(casesRes.cases || []);
      setApplications(appsRes.applications || []);
      if (casesRes.cases && casesRes.cases.length > 0 && !viewingCase) {
        setViewingCase(casesRes.cases[0]);
      }
    } catch (err) {
      console.error('Failed to load advocate data:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to load advocate portal data');
    } finally {
      setLoading(false);
    }
  }, [viewingCase]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  // Handle FIR search
  const handleSearchFir = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError('');
    try {
      const res = await advocateAPI.searchFir(searchQuery.trim());
      setSearchResults(res.results || []);
      if (!res.results || res.results.length === 0) {
        setError(`No FIR record found matching "${searchQuery}".`);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // Handle Vakalatnama form submit
  const handleVakalatnamaSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFir) {
      setError('Please search and select a target FIR first.');
      return;
    }
    if (!file) {
      setError('Please select or upload a signed Vakalatnama PDF document.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('firId', selectedFir.firId);
      fd.append('designation', designation);
      fd.append('vakalatnama', file);

      await advocateAPI.submitVakalatnama(fd);
      setSuccessMsg(`Vakalatnama representation for FIR ${selectedFir.firNumber} submitted for judicial review.`);
      setSelectedFir(null);
      setFile(null);
      setSearchQuery('');
      setSearchResults([]);
      setActiveTab('APPLICATIONS');
      await loadPortalData();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const barRegNo = user?.barEnrollmentNo || user?.employeeId || 'BAR/MAH/2026/001';

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
      <PageHeader
        title="Advocate Legal Portal & Discovery Vault"
        subtitle={`Adv. ${user?.name || 'Legal Counsel'} · Bar Reg: ${barRegNo} · Locus Standi & Discovery Material`}
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

      {/* Regulatory Notice Banner */}
      <div className="card" style={{
        marginBottom: 24,
        background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.08) 0%, rgba(59, 130, 246, 0.05) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.3)'
      }}>
        <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <ShieldAlert size={22} color="var(--navy-700)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
              Statutory Chain-of-Custody &amp; Locus Standi Notice
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Under judicial bar ethics and Indian evidence law, legal counsel may not conduct surveillance or general browsing of police records. Access to case narratives, evidence files, and Section 193(9) BNSS supplementary diaries is granted strictly per-case upon approval of a digital Vakalatnama. All exported documents are dynamically watermarked with your Bar Council credentials (<strong>{barRegNo}</strong>) to prevent unauthorized leaks.
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="stat-cards-grid" style={{ marginBottom: 24 }}>
        <StatCard label="Approved Cases in Vault" value={myCases.length} icon={Briefcase} accent="var(--emerald)" />
        <StatCard label="Pending Applications" value={applications.filter(a => a.status === 'PENDING').length} icon={Clock} accent="var(--amber)" />
        <StatCard label="Total Applications Filed" value={applications.length} icon={FileText} accent="var(--navy-700)" />
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('VAULT')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'VAULT' ? '2px solid var(--navy-700)' : '2px solid transparent',
            color: activeTab === 'VAULT' ? 'var(--navy-700)' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: 14,
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Briefcase size={16} /> My Cases Vault ({myCases.length})
        </button>

        <button
          onClick={() => setActiveTab('APPLICATIONS')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'APPLICATIONS' ? '2px solid var(--navy-700)' : '2px solid transparent',
            color: activeTab === 'APPLICATIONS' ? 'var(--navy-700)' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: 14,
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Clock size={16} /> Vakalatnama Applications ({applications.length})
        </button>

        <button
          onClick={() => setActiveTab('FILE')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'FILE' ? '2px solid var(--navy-700)' : '2px solid transparent',
            color: activeTab === 'FILE' ? 'var(--navy-700)' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: 14,
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Upload size={16} /> File New Vakalatnama
        </button>
      </div>

      {/* TAB 1: MY CASES VAULT */}
      {activeTab === 'VAULT' && (
        myCases.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Briefcase size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>No Approved Cases in Your Vault</h3>
            <p style={{ fontSize: 13, marginBottom: 18 }}>
              You do not currently have any active judicial Vakalatnama approvals. Search for a case and file your Vakalatnama appearance to unlock discovery materials.
            </p>
            <button className="btn btn-primary" onClick={() => setActiveTab('FILE')}>
              File Appearance (Vakalatnama)
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
            {/* Left Case Selector */}
            <div className="card" style={{ height: 'fit-content' }}>
              <div className="card-header">
                <h3 style={{ fontSize: 14 }}>Approved Cases</h3>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {myCases.map((c) => {
                  const isSelected = viewingCase?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setViewingCase(c)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        background: isSelected ? 'var(--bg-page)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--navy-700)' : '3px solid transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.firNumber}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.station} · {c.designation === 'DEFENSE_COUNSEL' ? 'Defense' : 'Prosecution'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--emerald)', marginTop: 4 }}>
                        ✓ Approved by {c.approvedBy || 'Court'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Case Detail & Watermarked Evidence Locker */}
            {viewingCase && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Case Master Summary */}
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ fontSize: 16 }}>{viewingCase.firNumber}</h2>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Police Station: {viewingCase.station} · Registered: {fmtDate(viewingCase.registeredAt)}
                      </div>
                    </div>
                    <span className="badge" style={{
                      background: 'rgba(16, 185, 129, 0.15)', color: '#10B981',
                      padding: '4px 10px', borderRadius: 4, fontWeight: 600, fontSize: 12
                    }}>
                      {viewingCase.designation === 'DEFENSE_COUNSEL' ? 'Defense Counsel' : 'Prosecution'}
                    </span>
                  </div>
                  <div className="card-body">
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Applicable Statutory Sections</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{viewingCase.applicableSections || 'BNS Penal Sections'}</div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Incident Narrative</div>
                      <div style={{ fontSize: 13, background: 'var(--bg-page)', padding: 10, borderRadius: 4, border: '1px solid var(--border)' }}>
                        {viewingCase.description || 'No description provided.'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Supplementary Diary Timeline (Sec 193(9) BNSS) */}
                <div className="card">
                  <div className="card-header">
                    <h3 style={{ fontSize: 14 }}>Investigation Case Diary Updates (Section 193(9) BNSS)</h3>
                  </div>
                  <div className="card-body">
                    {(!viewingCase.supplementaryReports || viewingCase.supplementaryReports.length === 0) ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No supplementary diary reports appended yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {viewingCase.supplementaryReports.map((rep) => (
                          <div key={rep.id} style={{
                            padding: 12, borderRadius: 6, background: 'var(--bg-page)', border: '1px solid var(--border)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <strong style={{ fontSize: 12 }}>Supplementary Diary Entry #{rep.reportNumber}</strong>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(rep.createdAt)}</span>
                            </div>
                            <div style={{ fontSize: 12, marginBottom: 6 }}>{rep.narrative}</div>
                            {rep.discoveredItems && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                <strong>Items Seized:</strong> {rep.discoveredItems}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Evidence Locker with Watermarked Download */}
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 14 }}>Trial Discovery Evidence &amp; Watermarked Export</h3>
                    <span style={{ fontSize: 11, color: 'var(--crimson)', fontWeight: 600 }}>
                      🔒 DYNAMIC ANTI-LEAK WATERMARKING ACTIVE
                    </span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {(!viewingCase.evidence || viewingCase.evidence.length === 0) ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        No digital evidence objects anchored for this FIR.
                      </div>
                    ) : (
                      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>Evidence File</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>Category</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12 }}>Blockchain Proof</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12 }}>Export Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewingCase.evidence.map((evi) => (
                            <tr key={evi.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{evi.filename}</div>
                                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                  SHA: {evi.sha256Hash?.substring(0, 16)}...
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: 12 }}>{evi.category}</td>
                              <td style={{ padding: '10px 12px', fontSize: 11 }}>
                                {evi.ledgerTxId ? (
                                  <span style={{ color: 'var(--emerald)', fontWeight: 500 }}>
                                    ✓ EVM Anchored
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                <a
                                  href={advocateAPI.watermarkedDownloadUrl(evi.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-primary"
                                  style={{
                                    fontSize: 11,
                                    padding: '4px 10px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  <Download size={12} /> Download Watermarked PDF
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* TAB 2: MY APPLICATIONS */}
      {activeTab === 'APPLICATIONS' && (
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: 14 }}>My Vakalatnama Representation Applications</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {applications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                You have not filed any Vakalatnama applications yet.
              </div>
            ) : (
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>FIR Number</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Police Station</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Designation</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Submission Date</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Judicial Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Reviewer Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{app.firNumber}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>{app.station}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className="badge" style={{
                          background: app.designation === 'DEFENSE_COUNSEL' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                          color: app.designation === 'DEFENSE_COUNSEL' ? '#3B82F6' : '#A855F7',
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                        }}>
                          {app.designation === 'DEFENSE_COUNSEL' ? 'Defense Counsel' : 'Prosecution'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12 }}>{fmtDate(app.createdAt)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {app.status === 'APPROVED' && (
                          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '3px 8px', borderRadius: 4, fontWeight: 600, fontSize: 11 }}>
                            ✓ APPROVED
                          </span>
                        )}
                        {app.status === 'PENDING' && (
                          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', padding: '3px 8px', borderRadius: 4, fontWeight: 600, fontSize: 11 }}>
                            ⏳ PENDING REVIEW
                          </span>
                        )}
                        {app.status === 'REJECTED' && (
                          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', padding: '3px 8px', borderRadius: 4, fontWeight: 600, fontSize: 11 }}>
                            ✕ REJECTED
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {app.rejectionReason ? <span style={{ color: 'var(--crimson)' }}>{app.rejectionReason}</span> : (app.reviewerName ? `Reviewed by ${app.reviewerName}` : 'Awaiting bench assignment')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FILE APPEARANCE (VAKALATNAMA) */}
      {activeTab === 'FILE' && (
        <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="card-header">
            <h2 style={{ fontSize: 16 }}>File Representation (Vakalatnama)</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Search the target FIR by case number, attach your signed digital Vakalatnama, and specify your representation capacity.
            </p>
          </div>

          <div className="card-body">
            {/* Step 1: Search FIR */}
            <form onSubmit={handleSearchFir} style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                1. Target FIR Case Number Search
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. 0214/2026 or FIR-2026-042"
                  style={{ flex: 1 }}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={searching}>
                  <Search size={14} /> {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedFir && (
              <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg-page)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                  MATCHING POLICE CASES FOUND:
                </div>
                {searchResults.map((r) => (
                  <div key={r.firId} style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{r.firNumber}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Station: {r.station} · Registered: {fmtDate(r.registeredAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setSelectedFir(r)}
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      Select FIR
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Selected FIR Banner */}
            {selectedFir && (
              <div style={{
                marginBottom: 20, padding: 14, borderRadius: 6,
                background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--navy-700)', fontWeight: 600 }}>SELECTED TARGET CASE</div>
                  <strong style={{ fontSize: 14 }}>{selectedFir.firNumber}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Station: {selectedFir.station}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedFir(null)}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  Change FIR
                </button>
              </div>
            )}

            {/* Step 2 & 3: Details & Document Upload */}
            <form onSubmit={handleVakalatnamaSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  2. Representation Capacity
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{
                    flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border)',
                    background: designation === 'DEFENSE_COUNSEL' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-page)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    <input
                      type="radio"
                      name="designation"
                      value="DEFENSE_COUNSEL"
                      checked={designation === 'DEFENSE_COUNSEL'}
                      onChange={() => setDesignation('DEFENSE_COUNSEL')}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Defense Counsel</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Representing accused / respondent</div>
                    </div>
                  </label>

                  <label style={{
                    flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border)',
                    background: designation === 'PROSECUTION' ? 'rgba(168, 85, 247, 0.1)' : 'var(--bg-page)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    <input
                      type="radio"
                      name="designation"
                      value="PROSECUTION"
                      checked={designation === 'PROSECUTION'}
                      onChange={() => setDesignation('PROSECUTION')}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Prosecution / State</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Special public prosecutor / complainant</div>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  3. Upload Signed Vakalatnama (PDF)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files[0])}
                  required
                  style={{ display: 'block', width: '100%', fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Maximum file size: 25 MB. Must be a clear PDF scan bearing advocate seal and signature.
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={submitting || !selectedFir || !file}
                style={{ padding: '10px 16px', fontSize: 14 }}
              >
                {submitting ? 'Submitting Vakalatnama...' : 'Submit Vakalatnama for Judicial Approval'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
