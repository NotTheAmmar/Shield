import React from 'react';

export default function StatCard({ label, value, icon: Icon, accent = 'var(--navy-700)', onClick }) {
  return (
    <div
      className="stat-card"
      style={{ '--stat-accent': accent, cursor: onClick ? 'pointer' : 'default' }}
      data-testid="stat-card"
      onClick={onClick}
    >
      <div className="stat-card-icon">
        {Icon && <Icon size={20} />}
      </div>
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{label}</div>
      {onClick && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Click to view →</div>}
    </div>
  );
}
