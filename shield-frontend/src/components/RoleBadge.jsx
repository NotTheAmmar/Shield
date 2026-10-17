import React from 'react';
import { Shield, Scale, Settings, Search, Briefcase } from 'lucide-react';

const CONFIG = {
  'police_officer':     { className: 'badge-police',   Icon: Shield,    label: 'Police Officer'      },
  'judicial_authority': { className: 'badge-judicial', Icon: Scale,     label: 'Judicial Authority'  },
  'judicial_magistrate':{ className: 'badge-judicial', Icon: Scale,     label: 'Judicial Magistrate' },
  'sessions_judge':     { className: 'badge-judicial', Icon: Scale,     label: 'Sessions Judge'      },
  'advocate':           { className: 'badge-forensic', Icon: Briefcase, label: 'Advocate'            },
  'admin':              { className: 'badge-admin',    Icon: Settings,  label: 'Admin'               },
  'forensic_expert':    { className: 'badge-forensic', Icon: Search,    label: 'Forensic Expert'     },
};

const ROLE_MAP = {
  'police_officer': 'police_officer',
  'Police Officer': 'police_officer',
  'judicial_authority': 'judicial_authority',
  'Judicial Authority': 'judicial_authority',
  'judicial_magistrate': 'judicial_magistrate',
  'Judicial Magistrate': 'judicial_magistrate',
  'sessions_judge': 'sessions_judge',
  'Sessions Judge': 'sessions_judge',
  'advocate': 'advocate',
  'Advocate': 'advocate',
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
