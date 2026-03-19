import React from 'react';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const CONFIG = {
  verified:  { className: 'badge-verified',   Icon: CheckCircle,   label: 'Verified'  },
  pending:   { className: 'badge-pending',    Icon: Clock,         label: 'Pending'   },
  tampered:  { className: 'badge-tampered',   Icon: AlertTriangle, label: 'Tampered'  },
};

export default function StatusBadge({ status }) {
  const cfg = CONFIG[status] || CONFIG.pending;
  const { className, Icon, label } = cfg;
  return (
    <span className={`badge ${className}`} data-testid={`badge-${status}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}
