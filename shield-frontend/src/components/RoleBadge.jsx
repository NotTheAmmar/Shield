import React from 'react';
import { Shield, Scale, Settings } from 'lucide-react';

const CONFIG = {
  police_officer:    { className: 'badge-police',   Icon: Shield, label: 'Police Officer'    },
  judicial_authority:{ className: 'badge-judicial', Icon: Scale,  label: 'Judicial Authority' },
  admin:             { className: 'badge-admin',    Icon: Settings,label: 'Admin'              },
};

export default function RoleBadge({ role }) {
  const cfg = CONFIG[role];
  if (!cfg) return null;
  const { className, Icon, label } = cfg;
  return (
    <span className={`badge ${className}`} data-testid={`role-badge-${role}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}
