import React from 'react';
import { Shield, Scale, Settings, Search } from 'lucide-react';

const CONFIG = {
  'police_officer':    { className: 'badge-police',   Icon: Shield, label: 'police_officer'    },
  'judicial_authority':{ className: 'badge-judicial', Icon: Scale,  label: 'judicial_authority' },
  'admin':             { className: 'badge-admin',    Icon: Settings,label: 'admin'              },
  'forensic_expert':   { className: 'badge-forensic', Icon: Search,  label: 'forensic_expert'    },
};

const ROLE_MAP = {
  'police_officer': 'police_officer',
  'Police Officer': 'police_officer',
  'judicial_authority': 'judicial_authority',
  'Judicial Authority': 'judicial_authority',
  'admin': 'admin',
  'Admin': 'admin',
  'forensic_expert': 'forensic_expert',
  'Forensic Expert': 'forensic_expert'
};

export default function RoleBadge({ role }) {
  const normalized = ROLE_MAP[role] || role?.toLowerCase();
  const cfg = CONFIG[normalized];
  if (!cfg) return null;
  const { className, Icon, label } = cfg;
  return (
    <span className={`badge ${className}`} data-testid={`role-badge-${normalized}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}
