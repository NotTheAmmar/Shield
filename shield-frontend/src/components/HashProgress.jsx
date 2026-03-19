import React from 'react';
import { Lock } from 'lucide-react';

export default function HashProgress({ fileName, progress = 0, visible = false }) {
  if (!visible) return null;
  return (
    <div className="hash-progress-box" data-testid="hash-progress">
      <div className="hash-progress-header">
        <Lock size={14} />
        {progress < 100
          ? `Calculating SHA-256 Fingerprint${fileName ? ` — ${fileName}` : ''}…`
          : '✓ SHA-256 Fingerprint Calculated'}
      </div>
      <div className="hash-progress-bar-track">
        <div
          className="hash-progress-bar-fill"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="hash-progress-pct">{progress}%</div>
      {progress < 100 && (
        <div className="hash-progress-caption">
          Creating a unique digital fingerprint of your file for tamper detection.
        </div>
      )}
    </div>
  );
}
