import React from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, File, X } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DropZone({ onFiles, accept, multiple = false, files = [] }) {
  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length) onFiles(accepted);
    },
    accept,
    multiple,
  });

  let zoneClass = 'dropzone';
  if (isDragActive && isDragAccept) zoneClass += ' accepted';
  else if (isDragActive && isDragReject) zoneClass += ' rejected';
  else if (isDragActive) zoneClass += ' active';

  return (
    <div>
      <div {...getRootProps({ className: zoneClass })} data-testid="dropzone">
        <input {...getInputProps()} />
        <div className="dropzone-icon">
          <UploadCloud size={36} />
        </div>
        <div className="dropzone-title">
          {isDragActive ? 'Drop files here…' : 'Drop files here, or click to browse'}
        </div>
        <div className="dropzone-sub">
          {accept
            ? `Accepted: ${Object.values(accept).flat().join(', ')}`
            : 'All file types accepted'}
        </div>
      </div>
      {files.length > 0 && (
        <div className="dropzone-file-list">
          {files.map((f, i) => (
            <div key={i} className="dropzone-file-item">
              <File size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
              <span className="dropzone-file-name">{f.name}</span>
              <span className="dropzone-file-size">{formatBytes(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
