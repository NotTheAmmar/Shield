import React, { useState, useEffect } from 'react';
import { FileText, Archive, CheckCircle, MapPin } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DropZone from '../components/DropZone';
import { firAPI, evidenceAPI } from '../services/api';
import { useSearchParams } from 'react-router-dom';

const CATEGORIES = ['photo', 'video', 'audio', 'document', 'other'];

export default function UploadPage() {
  const [tab, setTab] = useState('fir');
  const [searchParams] = useSearchParams();

  // Switch to evidence tab if navigated from FIR detail with ev pre-selection
  useEffect(() => {
    if (searchParams.get('tab') === 'evidence') setTab('evidence');
  }, [searchParams]);

  return (
    <>
      <PageHeader
        title="Upload"
        subtitle="Submit a scanned FIR document or attach digital evidence to a case."
      />

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
          <Archive size={14} /> Upload Evidence
        </button>
      </div>

      {tab === 'fir' ? <UploadFirTab /> : <UploadEvidenceTab searchParams={searchParams} />}
    </>
  );
}

// ── Tab 1: Upload FIR ──────────────────────────────────────────────────────

function UploadFirTab() {
  const [firNumber, setFirNumber] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');

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
      () => setError('Unable to retrieve your location.')
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firNumber.trim()) { setError('FIR Number is required.'); return; }
    if (!files.length) { setError('Please select a file to upload.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('firNumber', firNumber.trim());
      fd.append('incidentType', incidentType.trim());
      fd.append('dateTime', dateTime);
      fd.append('location', location.trim());
      fd.append('description', description.trim());
      fd.append('file', files[0]);
      
      const result = await firAPI.upload(fd);
      setSuccess(result);
      setFiles([]);
      setFirNumber('');
      setIncidentType('');
      setDateTime('');
      setLocation('');
      setDescription('');
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
            <strong>FIR uploaded successfully.</strong>
            <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {success.firNumber}
            </div>
          </div>
        </div>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="fir-number">FIR Number <span style={{ color: 'var(--crimson)' }}>*</span></label>
          <input
            id="fir-number"
            className="form-input"
            placeholder="e.g. FIR/2025/MH/0042"
            value={firNumber}
            onChange={(e) => setFirNumber(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="incident-type">Incident Type</label>
          <input
            id="incident-type"
            className="form-input"
            placeholder="e.g. Theft, Assault"
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="date-time">Date/Time of Incident</label>
          <input
            type="datetime-local"
            id="date-time"
            className="form-input"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="location">Location</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="location"
              className="form-input"
              placeholder="Address or Coordinates"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleGPS} title="Use Current GPS">
              <MapPin size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="description">Incident Description</label>
        <textarea
          id="description"
          className="form-input"
          placeholder="Brief description of the incident..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Scanned FIR Document <span style={{ color: 'var(--crimson)' }}>*</span></label>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Accepted formats: PDF, JPG, PNG. This is a scanned/photographed physical FIR — not form data.
        </p>
        <DropZone
          onFiles={handleFiles}
          accept={{ 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] }}
          multiple={false}
          files={files}
          onRemove={(index) => setFiles(prev => prev.filter((_, idx) => idx !== index))}
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Uploading & Securing…</> : 'Upload FIR'}
      </button>
    </form>
  );
}

// ── Tab 2: Upload Evidence ─────────────────────────────────────────────────

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
    if (!sourceData.lawfulControl || !sourceData.properOperation) { setError('Legal declarations (lawful control & proper operation) are mandatory under Section 63 BSA.'); return; }
    if (!files.length) { setError('Please select at least one evidence file.'); return; }
    
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('fir_id', form.firId);
      fd.append('category', form.category);
      fd.append('description', form.description);
      // Ensure sourceData is appended BEFORE files
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
        <select id="linked-fir" className="form-select" value={form.firId} onChange={(e) => setForm((f) => ({ ...f, firId: e.target.value }))} required>
          <option value="">— Select FIR —</option>
          {firList.map((fir) => <option key={fir.id} value={fir.id}>{fir.firNumber}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="category">Category <span style={{ color: 'var(--crimson)' }}>*</span></label>
          <select id="category" className="form-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="description">Description</label>
          <input id="description" className="form-input" placeholder="Optional description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
      </div>

      {/* SECTION 63 SOURCE DETAILS */}
      <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--navy-200)', borderRadius: 8, background: 'var(--navy-50)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--navy-800)' }}>Section 63: Source Device Batch Info</h3>
        
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
            <label className="form-label" htmlFor="ownershipStatus">Ownership Status</label>
            <input id="ownershipStatus" name="ownershipStatus" className="form-input" placeholder="e.g. Victim's phone, Public CCTV" value={sourceData.ownershipStatus} onChange={handleSourceChange} />
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

        <div className="form-group" style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
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
