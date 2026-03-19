import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Archive, CheckCircle, Clock, AlertTriangle, Users, UserCheck, UserX, Activity, Upload, BookOpen, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { dashboardAPI } from '../services/api';

// Format ISO timestamp to IST locale
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const ACTION_LABELS = {
  UPLOADED_FIR: 'Uploaded FIR',
  UPLOADED_EVIDENCE: 'Uploaded Evidence',
  VERIFIED_FIR: 'Verified FIR Integrity',
  VERIFIED_EVIDENCE: 'Verified Evidence Integrity',
  DOWNLOADED_FIR: 'Downloaded FIR',
  DOWNLOADED_EVIDENCE: 'Downloaded Evidence',
  LOGIN: 'Logged In',
  LOGOUT: 'Logged Out',
  USER_CREATED: 'Created User Account',
  USER_DEACTIVATED: 'Deactivated User',
  USER_REACTIVATED: 'Reactivated User',
};

const MOCK_POLICE_STATS = { firsUploaded: 24, evidenceFiles: 87, verified: 79, pendingVerification: 8 };
const MOCK_JUDICIAL_STATS = { totalFirs: 142, totalEvidence: 890, verifiedIntegrity: 880, tamperAlerts: 2 };
const MOCK_ADMIN_STATS = { totalUsers: 38, activeUsers: 35, deactivatedUsers: 3, recentLogins: 12 };
const MOCK_RECENT_ACTIVITY = [
  { id: 'a1', timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'UPLOADED_EVIDENCE', targetLabel: 'crime_scene_photo.jpg' },
  { id: 'a2', timestamp: new Date(Date.now() - 7200000).toISOString(), action: 'UPLOADED_FIR', targetLabel: 'FIR/2025/MH/0042' },
  { id: 'a3', timestamp: new Date(Date.now() - 86400000).toISOString(), action: 'VERIFIED_FIR', targetLabel: 'FIR/2025/MH/0041' },
  { id: 'a4', timestamp: new Date(Date.now() - 172800000).toISOString(), action: 'LOGIN', targetLabel: null },
];

function ActivityItem({ item }) {
  return (
    <div className="activity-item">
      <div className="activity-icon" style={{ background: 'var(--bg-page)', border: '1px solid var(--border)' }}>
        <Activity size={13} color="var(--text-muted)" />
      </div>
      <div className="activity-body">
        <div className="activity-title">
          {ACTION_LABELS[item.action] || item.action}
          {item.targetLabel && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {item.targetLabel}</span>}
        </div>
        <div className="activity-time">{fmtTime(item.timestamp)}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { role, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    dashboardAPI.getStats().then((data) => {
      if (data) {
        setStats(data.stats);
        setActivity(data.recentActivity || []);
      } else {
        // Use mock data
        if (role === 'police_officer') { setStats(MOCK_POLICE_STATS); setActivity(MOCK_RECENT_ACTIVITY); }
        else if (role === 'judicial_authority') { setStats(MOCK_JUDICIAL_STATS); setActivity(MOCK_RECENT_ACTIVITY); }
        else if (role === 'admin') { setStats(MOCK_ADMIN_STATS); setActivity(MOCK_RECENT_ACTIVITY); }
      }
    });
  }, [role]);

  const greeting = `Welcome back, ${user?.name?.split(' ')[0] || 'Officer'}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={greeting}
      />

      <div className="stat-cards-grid">
        {role === 'police_officer' && stats && (
          <>
            <StatCard label="FIRs Uploaded" value={stats.firsUploaded} icon={FileText} accent="var(--navy-700)" />
            <StatCard label="Evidence Files" value={stats.evidenceFiles} icon={Archive} accent="var(--navy-700)" />
            <StatCard label="Verified" value={stats.verified} icon={CheckCircle} accent="var(--emerald)" />
            <StatCard label="Pending Verification" value={stats.pendingVerification} icon={Clock} accent="var(--amber)" />
          </>
        )}
        {role === 'judicial_authority' && stats && (
          <>
            <StatCard label="Total FIRs in System" value={stats.totalFirs} icon={FileText} accent="var(--navy-700)" />
            <StatCard label="Total Evidence Files" value={stats.totalEvidence} icon={Archive} accent="var(--navy-700)" />
            <StatCard label="Verified Integrity" value={stats.verifiedIntegrity} icon={CheckCircle} accent="var(--emerald)" />
            <StatCard label="Tamper Alerts" value={stats.tamperAlerts} icon={AlertTriangle} accent="var(--crimson)" />
          </>
        )}
        {role === 'admin' && stats && (
          <>
            <StatCard label="Total Users" value={stats.totalUsers} icon={Users} accent="var(--navy-700)" />
            <StatCard label="Active Users" value={stats.activeUsers} icon={UserCheck} accent="var(--emerald)" />
            <StatCard label="Deactivated Users" value={stats.deactivatedUsers} icon={UserX} accent="var(--slate-500)" />
            <StatCard label="Logins (24h)" value={stats.recentLogins} icon={Activity} accent="var(--navy-700)" />
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
        {/* Recent Activity */}
        <div className="card">
          <div className="card-header">
            <h2>Recent Activity</h2>
          </div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            {activity.length > 0 ? (
              <div className="activity-list">
                {activity.slice(0, 6).map((item) => <ActivityItem key={item.id} item={item} />)}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No recent activity.</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="card-body">
            <div className="quick-action-bar" style={{ flexDirection: 'column' }}>
              {role === 'police_officer' && (
                <>
                  <Link to="/upload" className="btn btn-primary btn-full">
                    <Upload size={14} /> Upload FIR / Evidence
                  </Link>
                  <Link to="/fir" className="btn btn-secondary btn-full">
                    <FileText size={14} /> Browse FIR Registry
                  </Link>
                  <Link to="/vault" className="btn btn-secondary btn-full">
                    <Archive size={14} /> Evidence Vault
                  </Link>
                </>
              )}
              {role === 'judicial_authority' && (
                <>
                  <Link to="/fir" className="btn btn-primary btn-full">
                    <FileText size={14} /> Browse FIR Registry
                  </Link>
                  <Link to="/vault" className="btn btn-secondary btn-full">
                    <Archive size={14} /> Evidence Vault
                  </Link>
                  <Link to="/audit" className="btn btn-secondary btn-full">
                    <BookOpen size={14} /> Audit Log
                  </Link>
                </>
              )}
              {role === 'admin' && (
                <>
                  <Link to="/admin/users" className="btn btn-primary btn-full">
                    <Settings size={14} /> Manage Users
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
