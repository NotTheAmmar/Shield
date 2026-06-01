import React from 'react';
import { FileText, Film, Music, Image, File, Download } from 'lucide-react';

function getTypeInfo(mimeType) {
  if (!mimeType) return { type: 'other' };
  if (mimeType.startsWith('image/')) return { type: 'image' };
  if (mimeType.startsWith('video/')) return { type: 'video' };
  if (mimeType.startsWith('audio/')) return { type: 'audio' };
  if (mimeType === 'application/pdf') return { type: 'pdf' };
  return { type: 'other' };
}

function getIconForType(type) {
  switch (type) {
    case 'image': return <Image size={40} />;
    case 'video': return <Film size={40} />;
    case 'audio': return <Music size={40} />;
    case 'pdf': return <FileText size={40} />;
    default: return <File size={40} />;
  }
}

export default function FilePreview({ fileUrl, mimeType, fileName }) {
  const { type } = getTypeInfo(mimeType);

  if (!fileUrl) {
    return (
      <div className="file-preview">
        <div className="file-preview-unavailable">
          <div className="file-preview-unavailable-icon">{getIconForType(type)}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No file stored for this record.
          </div>
        </div>
      </div>
    );
  }

  // If mime type is unknown, show download-only
  if (type === 'other') {
    return (
      <div className="file-preview">
        <div className="file-preview-unavailable">
          <File size={40} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Preview not available for this file type.
          </p>
          <a href={fileUrl} download={fileName} className="btn btn-secondary btn-sm">
            <Download size={14} /> Download File
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="file-preview" data-testid="file-preview">
      {type === 'image' && (
        <img src={fileUrl} alt={fileName || 'Evidence file'} />
      )}
      {type === 'video' && (
        <video controls>
          <source src={fileUrl} type={mimeType} />
          Your browser does not support video playback.
        </video>
      )}
      {type === 'audio' && (
        <audio controls style={{ width: '100%', padding: 16 }}>
          <source src={fileUrl} type={mimeType} />
          Your browser does not support audio playback.
        </audio>
      )}
      {type === 'pdf' && (
        <iframe src={fileUrl} title={fileName || 'Document'} />
      )}
    </div>
  );
}
