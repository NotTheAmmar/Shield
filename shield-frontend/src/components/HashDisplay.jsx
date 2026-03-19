import React, { useState, useCallback } from 'react';
import { ShieldCheck, Copy, Check } from 'lucide-react';

export default function HashDisplay({ hash, label = 'SHA-256', truncate = false }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [hash]);

  const display = truncate && hash ? `${hash.slice(0, 16)}...${hash.slice(-8)}` : hash;

  if (!hash) return null;

  return (
    <div className="hash-display" data-testid="hash-display">
      <ShieldCheck size={16} className="hash-display-icon" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="hash-display-label">{label}</div>
        <div className={truncate ? 'hash-display-truncated' : 'hash-display-value'}>
          {display}
        </div>
      </div>
      <button
        className={`hash-copy-btn ${copied ? 'copied' : ''}`}
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy hash'}
        aria-label="Copy hash to clipboard"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
