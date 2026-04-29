import React, { useState } from 'react';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/api';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'Contains an uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Contains a lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'Contains a number', test: (p) => /[0-9]/.test(p) },
];

function StrengthRule({ met, label }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: met ? 'var(--emerald)' : 'var(--text-muted)', transition: 'color 150ms ease' }}>
      <CheckCircle2 size={13} style={{ flexShrink: 0, opacity: met ? 1 : 0.35 }} />
      {label}
    </li>
  );
}

export default function ForcePasswordChangePage() {
  const { user, clearMustChangePassword, logout } = useAuth();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState({ current: false, newPwd: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const toggleShow = (field) => setShow((s) => ({ ...s, [field]: !s[field] }));

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(form.newPassword));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (!allRulesMet) {
      setError('New password does not meet all the requirements below.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authAPI.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      // Brief moment to show success state, then ungate the app
      setTimeout(() => clearMustChangePassword(), 1500);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Password change failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" style={{ alignItems: 'center' }}>
      <div className="login-card" style={{ maxWidth: 440 }}>
        {/* Header */}
        <div className="login-logo">
          <Shield size={28} color="var(--navy-900)" className="login-logo-icon" />
          <span className="login-logo-text">SHIELD</span>
        </div>

        {/* Mandatory prompt banner */}
        <div style={{
          background: 'var(--amber-light)',
          border: '1px solid var(--amber)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 20,
        }}>
          <KeyRound size={16} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', marginBottom: 2 }}>
              Password Change Required
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Welcome, <strong>{user?.name}</strong>. Your account was provisioned with a temporary password. 
              You must set a new password before you can access the system.
            </p>
          </div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle2 size={48} style={{ color: 'var(--emerald)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Password Updated Successfully</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Taking you to the dashboard…</p>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            {/* Current (temporary) password */}
            <div className="form-group">
              <label className="form-label" htmlFor="currentPassword">Temporary Password</label>
              <div className="form-input-wrapper">
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type={show.current ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter your temporary password"
                  value={form.currentPassword}
                  onChange={handleChange}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 36 }}
                />
                <button type="button" className="form-input-icon" onClick={() => toggleShow('current')} aria-label="Toggle visibility">
                  {show.current ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="form-group">
              <label className="form-label" htmlFor="newPassword">New Password</label>
              <div className="form-input-wrapper">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={show.newPwd ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Create a strong password"
                  value={form.newPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                  style={{ paddingRight: 36 }}
                />
                <button type="button" className="form-input-icon" onClick={() => toggleShow('newPwd')} aria-label="Toggle visibility">
                  {show.newPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Inline strength checklist */}
              {form.newPassword.length > 0 && (
                <ul style={{ listStyle: 'none', padding: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {PASSWORD_RULES.map((rule) => (
                    <StrengthRule key={rule.label} label={rule.label} met={rule.test(form.newPassword)} />
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm new password */}
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm New Password</label>
              <div className="form-input-wrapper">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={show.confirm ? 'text' : 'password'}
                  className={`form-input ${form.confirmPassword && form.confirmPassword !== form.newPassword ? 'error' : ''}`}
                  placeholder="Re-enter your new password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                  style={{ paddingRight: 36 }}
                />
                <button type="button" className="form-input-icon" onClick={() => toggleShow('confirm')} aria-label="Toggle visibility">
                  {show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.confirmPassword && form.confirmPassword !== form.newPassword && (
                <p className="form-error">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Updating…</> : 'Set New Password'}
            </button>

            <button
              type="button"
              onClick={logout}
              className="btn btn-ghost btn-full"
              style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}
            >
              Cancel &amp; Sign Out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
