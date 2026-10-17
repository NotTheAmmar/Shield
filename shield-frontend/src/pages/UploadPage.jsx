import React, { useState, useEffect } from 'react';
import { FileText, Archive, CheckCircle, MapPin, Shield, Lock, ExternalLink } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DropZone from '../components/DropZone';
import { firAPI, evidenceAPI } from '../services/api';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const CATEGORIES = ['photo', 'video', 'audio', 'document', 'other'];

const CRIME_CATEGORIES = [
  'Theft (BNS Sec 303)',
  'Cybercrime & Phishing (IT Act Sec 66D)',
  'Financial Fraud & Cheating (BNS Sec 318)',
  'Assault & Grievous Hurt (BNS Sec 115)',
  'Criminal Breach of Trust (BNS Sec 316)',
  'Burglary / Trespass (BNS Sec 331)',
  'Narcotics (NDPS Act)',
  'Other Statutory Offence'
];

const COMMON_STATIONS = [
  'Kothrud PS',
  'Andheri PS',
  'Bandra PS',
  'Cyber Crime PS, Pune',
  'Cyber Crime PS, Mumbai',
  'Shivajinagar PS',
  'Deccan Gymkhana PS',
  'Hinjewadi PS',
  'Crime Branch Station'
];

export default function UploadPage() {
  const { role, user } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Police officers only have Scanned FIR registration; Forensic Experts handle evidence batches
  const isPolice = role === 'police_officer';
  const isForensic = role === 'forensic_expert';

  const defaultTab = isForensic ? 'evidence' : 'fir';
  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    if (searchParams.get('tab') === 'evidence' && !isPolice) {
      setTab('evidence');
    }
  }, [searchParams, isPolice]);

  return (
    <>
      <PageHeader
        title={isPolice ? "Scanned FIR Registration" : "Upload Portal"}
        subtitle={
          isPolice
            ? "Register physical First Information Reports (FIR) with cryptographic SHA-256 seal & Section 193 BNSS immutability freeze."
            : "Upload forensic evidence batches and custody records."
        }
      />

      {/* Tabs shown only if user has access to multiple functions */}
      {!isPolice && (
        <div className="tabs">
          <button
            className={`tab-btn ${tab === 'fir' ? 'active' : ''}`}
            onClick={() => setTab('fir')}
            id="tab-fir"
          >
            <FileText size={14} /> Upload FIR
          </button>
          <button
            className={`tab-btn ${tab === 'evidence' ? 'active' : ''}`}
            onClick={() => setTab('evidence')}
            id="tab-evidence"
          >
            <Archive size={14} /> Upload Evidence Batch
          </button>
        </div>
      )}

      {isPolice ? (
        <UploadFirTab user={user} />
      ) : tab === 'fir' ? (
        <UploadFirTab user={user} />
      ) : (
        <UploadEvidenceTab searchParams={searchParams} />
      )}
    </>
  );
}

// ── Tab 1: Upload Scanned FIR (Police Officer Persona) ─────────────────────

function UploadFirTab({ user }) {
  const [firNumber, setFirNumber] = useState('');
  const [incidentDateTime, setIncidentDateTime] = useState('');
  const [applicableSections, setApplicableSections] = useState('');
  const [station, setStation] = useState(user?.station || '');
  const [incidentType, setIncidentType] = useState('Theft (BNS Sec 303)');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

  // Auto-sync station if user profile updates
  useEffect(() => {
    if (user?.station && !station) {
      setStation(user.station);
    }
  }, [user, station]);

  const handleFiles = (accepted) => {
    setFiles(accepted);
    setSuccess(null);
    setError('');
  };

  const handleGPS = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => setError('Unable to retrieve current GPS location.')
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firNumber.trim()) { setError('FIR Number is required.'); return; }
    if (!station.trim()) { setError('Police Station jurisdiction is mandatory.'); return; }
    if (!applicableSections.trim()) { setError('Applicable penal code / statutory sections are required.'); return; }
    if (!files.length) { setError('Please attach the scanned physical FIR document (PDF or Image).'); return; }

    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('firNumber', firNumber.trim());
      fd.append('incidentDateTime', incidentDateTime);
      fd.append('dateTime', incidentDateTime); // backward compatibility
      fd.append('applicableSections', applicableSections.trim());
      fd.append('station', station.trim());
      fd.append('incidentType', incidentType.trim());
      fd.append('location', location.trim());
      fd.append('description', description.trim());
      fd.append('file', files[0]);
      
      const result = await firAPI.upload(fd);
      setSuccess(result);
      setFiles([]);
      setFirNumber('');
      setIncidentDateTime('');
      setApplicableSections('');
      setLocation('');
      setDescription('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Scanned FIR registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="upload-form" onSubmit={handleSubmit} noValidate>
      {/* Immutability Legal Banner */}
      <div style={{
        background: 'rgba(28, 58, 95, 0.06)',
        border: '1px solid rgba(28, 58, 95, 0.2)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12
      }}>
        <Lock size={18} style={{ color: 'var(--navy-700)', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
          <strong>Statutory Compliance · Section 173 CrPC &amp; Section 193 BNSS, 2023:</strong>
          <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
            Once registered, the scanned FIR document and narrative are permanently locked and immutably anchored to the EVM blockchain ledger. Subsequent investigation discoveries must be appended using <strong>Section 193(9) BNSS Case Diaries</strong>.
          </div>
        </div>
      </div>

      {success && (
        <div className="alert alert-success" role="alert" style={{ marginBottom: 20 }}>
          <CheckCircle size={18} />
          <div style={{ width: '100%' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              FIR Registered &amp; Immutably Anchored!
            </div>
            <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              Case File: <strong>{success.firNumber}</strong> · Station: <strong>{success.station || station}</strong>
            </div>
            {success.sha256Hash && (
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                SHA-256 Digest: {success.sha256Hash}
              </div>
            )}
            {success.fir_id && (
              <div style={{ marginTop: 8 }}>
                <Link to={`/fir/${success.fir_id}`} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Open Case File &amp; Investigation Diary <ExternalLink size={12} />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="fir-number">
            FIR Number <span style={{ color: 'var(--crimson)' }}>*</span>
          </label>
          <input
            id="fir-number"
            className="form-input"
            placeholder="e.g. FIR/2026/MH/0214"
            value={firNumber}
            onChange={(e) => setFirNumber(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="station">
            Police Station Jurisdiction <span style={{ color: 'var(--crimson)' }}>*</span>
          </label>
          <input
            id="station"
            list="station-suggestions"
            className="form-input"
            placeholder="e.g. Kothrud PS"
            value={station}
            onChange={(e) => setStation(e.target.value)}
            required
          />
          <datalist id="station-suggestions">
            {COMMON_STATIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="date-time">
            Date / Time of Incident <span style={{ color: 'var(--crimson)' }}>*</span>
          </label>
          <input
            type="datetime-local"
            id="date-time"
            className="form-input"
            value={incidentDateTime}
            onChange={(e) => setIncidentDateTime(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="incident-type">
            Crime Category / Type
          </label>
          <select
            id="incident-type"
            className="form-select"
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
          >
            {CRIME_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="applicable-sections">
          Applicable Penal Code &amp; Special Act Sections <span style={{ color: 'var(--crimson)' }}>*</span>
        </label>
        <input
          id="applicable-sections"
          className="form-input"
          placeholder="e.g. BNS Sec 303 (Theft), Sec 318 (Cheating), IT Act Sec 66C, Sec 66D"
          value={applicableSections}
          onChange={(e) => setApplicableSections(e.target.value)}
          required
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
          Specify statutory provisions invoked under the Bharatiya Nyaya Sanhita (BNS) or specific central/state acts.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="location">Incident Location / Scene</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="location"
              className="form-input"
              placeholder="Physical street address or scene coordinates"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleGPS}
              title="Capture Current GPS Coordinates"
            >
              <MapPin size={16} />
            </button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="reporting-officer-display">Registering Investigating Officer</label>
          <input
            id="reporting-officer-display"
            className="form-input"
            value={user ? `${user.name} (${user.employeeId || user.role})` : 'Law Enforcement Officer'}
            disabled
            style={{ background: 'var(--bg-table-alt)', color: 'var(--text-secondary)' }}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="description">Initial Occurrence Narrative Summary</label>
        <textarea
          id="description"
          className="form-input"
          placeholder="Summary of the initial complaint, cognizable offence facts, or complainant allegations..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Physical Scanned FIR Document <span style={{ color: 'var(--crimson)' }}>*</span>
        </label>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Attach the high-resolution scanned paper document or photograph of the signed FIR (PDF, JPG, PNG). This file will be hashed on-the-fly and preserved in MinIO object storage.
        </p>
        <DropZone
          onFiles={handleFiles}
          accept={{
            'application/pdf': ['.pdf'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png']
          }}
          multiple={false}
          files={files}
          onRemove={(index) => setFiles(prev => prev.filter((_, idx) => idx !== index))}
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={submitting}
        style={{ marginTop: 8 }}
      >
        {submitting ? (
          <>
            <span className="spinner" style={{ width: 16, height: 16 }} />
            Calculating SHA-256 &amp; Anchoring to EVM…
          </>
        ) : (
          <>
            <Shield size={16} />
            Register &amp; Lock Scanned FIR
          </>
        )}
      </button>
    </form>
  );
}

// ── Tab 2: Upload Evidence Batch (Forensic Expert View) ────────────────────

function UploadEvidenceTab({ searchParams }) {
  const [firList, setFirList] = useState([]);
  const [form, setForm] = useState({
    firId: searchParams.get('firId') || '',
    category: 'photo',
    description: '',
  });
  const [sourceData, setSourceData] = useState({
    sourceType: '',
    make: '',
    model: '',
    serial: '',
    identifiers: '',
    lawfulControl: false,
    properOperation: false,
    ownershipStatus: '',
    deviceChain: [{ type: '', identifier: '' }]
  });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    firAPI.list({ limit: 100 }).then((d) => setFirList(d.data || []));
  }, []);

  const handleFiles = (accepted) => {
    setFiles(accepted);
    setSuccess(null);
    setError('');
  };

  const handleSourceChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSourceData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const updateChainItem = (index, field, value) => {
    setSourceData(prev => {
      const newChain = [...prev.deviceChain];
      newChain[index][field] = value;
      return { ...prev, deviceChain: newChain };
    });
  };

  const addChainItem = () => {
    setSourceData(prev => ({
      ...prev,
      deviceChain: [...prev.deviceChain, { type: '', identifier: '' }]
    }));
  };

  const removeChainItem = (index) => {
    setSourceData(prev => ({
      ...prev,
      deviceChain: prev.deviceChain.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firId) { setError('Please select a linked FIR.'); return; }
    if (!sourceData.sourceType) { setError('Please specify the source device type.'); return; }
    if (!sourceData.lawfulControl || !sourceData.properOperation) {
      setError('Legal declarations (lawful control & proper operation) are mandatory under Section 63 BSA.');
      return;
    }
    if (!files.length) { setError('Please select at least one evidence file.'); return; }
    
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('fir_id', form.firId);
      fd.append('category', form.category);
      fd.append('description', form.description);
      fd.append('sourceData', JSON.stringify(sourceData));
      
      files.forEach((f) => fd.append('file', f));
      
      const result = await evidenceAPI.upload(fd);
      setSuccess(result);
      setFiles([]);
      setForm((f) => ({ ...f, description: '' }));
      setSourceData({
        sourceType: '', make: '', model: '', serial: '', identifiers: '',
        lawfulControl: false, properOperation: false, ownershipStatus: '',
        deviceChain: [{ type: '', identifier: '' }]
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="upload-form" onSubmit={handleSubmit} noValidate>
      {success && (
        <div className="alert alert-success" role="alert">
          <CheckCircle size={16} />
          <div>
            <strong>Batch uploaded successfully.</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Source Batch ID: {success.sourceId} | Files Processed: {success.files?.length || 0}
            </div>
          </div>
        </div>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="form-group">
        <label className="form-label" htmlFor="linked-fir">Linked FIR <span style={{ color: 'var(--crimson)' }}>*</span></label>
        <select
          id="linked-fir"
          className="form-select"
          value={form.firId}
          onChange={(e) => setForm((f) => ({ ...f, firId: e.target.value }))}
          required
        >
          <option value="">— Select Registered FIR —</option>
          {firList.map((fir) => (
            <option key={fir.id} value={fir.id}>
              {fir.firNumber} {fir.station ? `(${fir.station})` : ''} - {fir.incidentType || 'General'}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="category">Category <span style={{ color: 'var(--crimson)' }}>*</span></label>
          <select
            id="category"
            className="form-select"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="description">Description</label>
          <input
            id="description"
            className="form-input"
            placeholder="Optional forensic notes"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>

      {/* SECTION 63 SOURCE DETAILS */}
      <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-table-alt)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>Section 63: Source Device Batch Info</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="sourceType">Device Type <span style={{ color: 'var(--crimson)' }}>*</span></label>
            <select id="sourceType" name="sourceType" className="form-select" value={sourceData.sourceType} onChange={handleSourceChange} required>
              <option value="">— Select Type —</option>
              <option value="Mobile Phone">Mobile Phone</option>
              <option value="CCTV DVR/NVR">CCTV DVR/NVR</option>
              <option value="Computer/Laptop">Computer/Laptop</option>
              <option value="Storage Media">Storage Media (USB/HDD)</option>
              <option value="Server/Cloud">Server/Cloud</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ownershipStatus">Ownership Status <span style={{ color: 'var(--crimson)' }}>*</span></label>
            <select id="ownershipStatus" name="ownershipStatus" className="form-select" value={sourceData.ownershipStatus} onChange={handleSourceChange} required>
              <option value="">— Select Status —</option>
              <option value="Owned">Owned</option>
              <option value="Maintained">Maintained</option>
              <option value="Managed">Managed</option>
              <option value="Operated">Operated</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="make">Make</label>
            <input id="make" name="make" className="form-input" placeholder="Apple, Hikvision..." value={sourceData.make} onChange={handleSourceChange} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="model">Model</label>
            <input id="model" name="model" className="form-input" placeholder="iPhone 13, DS-7208..." value={sourceData.model} onChange={handleSourceChange} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="serial">Serial Number</label>
            <input id="serial" name="serial" className="form-input" placeholder="S/N..." value={sourceData.serial} onChange={handleSourceChange} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="identifiers">Other Identifiers (IMEI, MAC, IP)</label>
          <input id="identifiers" name="identifiers" className="form-input" placeholder="Comma separated identifiers" value={sourceData.identifiers} onChange={handleSourceChange} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Device Chain (Extraction Pathway)</label>
          {sourceData.deviceChain.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="form-input" placeholder="Device (e.g., UFED Touch2)" value={item.type} onChange={(e) => updateChainItem(idx, 'type', e.target.value)} style={{ flex: 1 }} />
              <input className="form-input" placeholder="Identifier (e.g., S/N 12345)" value={item.identifier} onChange={(e) => updateChainItem(idx, 'identifier', e.target.value)} style={{ flex: 1 }} />
              {idx > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeChainItem(idx)}>X</button>}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addChainItem}>+ Add Node to Chain</button>
        </div>

        <div className="form-group" style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
          <label className="form-label" style={{ marginBottom: 8 }}>Mandatory Declarations <span style={{ color: 'var(--crimson)' }}>*</span></label>
          <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" name="lawfulControl" checked={sourceData.lawfulControl} onChange={handleSourceChange} />
              I have lawful control of the device
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" name="properOperation" checked={sourceData.properOperation} onChange={handleSourceChange} />
              Device was operating properly
            </label>
          </div>
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 24 }}>
        <label className="form-label">Evidence Files <span style={{ color: 'var(--crimson)' }}>*</span></label>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Files uploaded here will be bundled under the single Section 63 Certificate for the source device defined above.</p>
        <DropZone
          onFiles={handleFiles}
          multiple
          files={files}
          onRemove={(index) => setFiles(prev => prev.filter((_, idx) => idx !== index))}
        />
      </div>

      {files.length > 0 && (
        <div className="alert alert-info" style={{ marginTop: 12 }}>
          Selected {files.length} file(s) for secure batch upload.
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-lg" disabled={submitting} style={{ marginTop: 16 }}>
        {submitting ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Uploading Batch…</> : 'Upload Evidence Batch'}
      </button>
    </form>
  );
}
