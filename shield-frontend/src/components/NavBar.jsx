import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Shield, LayoutDashboard, Upload, FileText, Archive, BookOpen, Users, ChevronDown, LogOut, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';
import RoleBadge from './RoleBadge';

const NAV_LINKS = [
  { to: '/',             label: 'Dashboard',       Icon: LayoutDashboard, roles: ['police_officer', 'judicial_authority', 'admin'] },
  { to: '/upload',       label: 'Upload',           Icon: Upload,          roles: ['police_officer'] },
  { to: '/fir',          label: 'FIR Registry',     Icon: FileText,        roles: ['police_officer', 'judicial_authority'] },
  { to: '/vault',        label: 'Evidence Vault',   Icon: Archive,         roles: ['police_officer', 'judicial_authority'] },
  { to: '/audit',        label: 'Audit Log',         Icon: BookOpen,        roles: ['judicial_authority'] },
  { to: '/admin/users',  label: 'User Management',  Icon: Users,           roles: ['admin'] },
];

export default function NavBar() {
  const { user, role, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  if (!isAuthenticated) return null;

  const visibleLinks = NAV_LINKS.filter((l) => l.roles.includes(role));

  const roleLabel = {
    police_officer: 'Police Officer',
    judicial_authority: 'Judicial Authority',
    admin: 'Administrator',
  }[role] || role;

  return (
    <nav className="navbar" data-testid="navbar">
      {/* Brand */}
      <NavLink to="/" className="navbar-brand">
        <Shield size={18} className="brand-icon" />
        SHIELD
      </NavLink>

      <div className="navbar-divider" />

      {/* Navigation Links */}
      <div className="navbar-nav">
        {visibleLinks.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Right side */}
      <div className="navbar-right">
        <ThemeToggle />

        <div className="navbar-user-wrapper" ref={menuRef}>
          <button
            className="user-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <User size={14} />
            <span>{user?.name?.split(' ')[0]}</span>
            <ChevronDown size={12} />
          </button>

          {menuOpen && (
            <div className="user-menu-dropdown" role="menu">
              <div className="user-menu-info">
                <div className="user-name">{user?.name}</div>
                <div className="user-role">{roleLabel}</div>
                {user?.employeeId && (
                  <div className="user-role" style={{ marginTop: 2 }}>{user.employeeId}</div>
                )}
              </div>
              <button className="user-menu-item danger" onClick={handleLogout} role="menuitem">
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
