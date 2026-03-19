import React from 'react';

export default function StatCard({ label, value, icon: Icon, accent = 'var(--navy-700)' }) {
  return (
    <div className="stat-card" style={{ '--stat-accent': accent }} data-testid="stat-card">
      <div className="stat-card-icon">
        {Icon && <Icon size={20} />}
      </div>
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
