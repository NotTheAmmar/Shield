import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Archive, CheckCircle, Clock, AlertTriangle, Users, UserCheck, UserX, Activity, Upload, BookOpen, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { dashboardAPI, adminAPI, auditAPI } from '../services/api';

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
  USER_UPDATED: 'Updated User',
  PASSWORD_RESET: 'Password Reset',
  VERIFY: 'Verified Evidence',
};



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
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [adminStats, setAdminStats] = useState(null);

  useEffect(() => {
    if (role === 'police_officer' || role === 'judicial_authority') {
      dashboardAPI.getStats().then((data) => {
        if (data) {
          setStats(data.stats);
          setActivity(data.recentActivity || []);
        }
      }).catch(err => console.error("Failed to load dashboard stats", err));
    } else if (role === 'admin') {
      adminAPI.listUsers().then((res) => {
        const users = res.users || [];
        const activeUsers = users.filter(u => u.status === 'active').length;
        const inactiveUsers = users.length - activeUsers;
        setAdminStats({
          totalUsers: users.length,
          activeUsers,
          inactiveUsers
        });
      }).catch(err => console.error("Failed to fetch users for admin stat", err));

      // Fetch recent user-account activity from auth service audit log
      auditAPI.listAuth({ limit: 20 }).then((res) => {
        const logs = res.auditLog || [];
        setActivity(logs.slice(0, 6).map(log => ({
          id: log.id,
          action: log.action,
          timestamp: log.timestamp,
          targetLabel: log.user_name ? `${log.user_name} (${log.user_role || '—'})` : log.targetLabel,
        })));
      }).catch(err => console.error('Failed to fetch admin activity', err));
    }
  }, [role]);

  const greeting = `Welcome back, ${user?.name?.split(' ')[0] || 'Officer'}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={greeting}
      />

      <div className="stat-cards-grid">
        {(role === 'police_officer' || role === 'judicial_authority') && stats && (
          <>
            <StatCard label="Total FIRs in System" value={stats.totalFirs} icon={FileText} accent="var(--navy-700)" />
            <StatCard label="Total Evidence Files" value={stats.totalEvidence} icon={Archive} accent="var(--navy-700)" />
            <StatCard label="Verified Integrity" value={stats.verifiedCount} icon={CheckCircle} accent="var(--emerald)" />
            <StatCard label="Tamper Alerts" value={stats.tamperedCount} icon={AlertTriangle} accent="var(--crimson)" onClick={() => navigate('/vault?status=tampered')} />
          </>
        )}
        {role === 'admin' && adminStats && (
          <>
            <StatCard label="Total System Users" value={adminStats.totalUsers} icon={Users} accent="var(--navy-700)" />
            <StatCard label="Active Users" value={adminStats.activeUsers} icon={UserCheck} accent="var(--emerald)" />
            <StatCard label="Inactive / Suspended" value={adminStats.inactiveUsers} icon={UserX} accent="var(--crimson)" />
          </>
        )}
      </div>

      {/* Digital Identity Card — shown for any user who has a blockchain address */}
      {user?.blockchainAddress && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <h2>Digital Identity</h2>
          </div>
          <div className="card-body">
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Blockchain Address</div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                background: 'var(--bg-page)',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                marginTop: '4px',
                wordBreak: 'break-all'
              }}>
                {user.blockchainAddress}
              </div>
            </div>
          </div>
        </div>
      )}

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
              {(role === 'police_officer') && (
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
