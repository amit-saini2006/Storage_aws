/**
 * Utility helpers for formatting and file type detection.
 */

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format a date string into a readable format.
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Get file category from content type.
 */
export function getFileCategory(contentType) {
  if (!contentType) return 'other';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('text/') ||
      contentType.includes('json') ||
      contentType.includes('xml') ||
      contentType.includes('javascript')) return 'code';
  if (contentType.includes('spreadsheet') ||
      contentType.includes('excel') ||
      contentType === 'text/csv') return 'spreadsheet';
  if (contentType.includes('presentation') ||
      contentType.includes('powerpoint')) return 'presentation';
  if (contentType.includes('document') ||
      contentType.includes('word') ||
      contentType.includes('rtf')) return 'document';
  if (contentType.includes('zip') ||
      contentType.includes('rar') ||
      contentType.includes('tar') ||
      contentType.includes('gzip') ||
      contentType.includes('7z')) return 'archive';
  return 'other';
}

/**
 * Get an emoji icon for a file category.
 */
export function getFileIcon(contentType) {
  const category = getFileCategory(contentType);
  const icons = {
    image: '🖼️',
    pdf: '📄',
    video: '🎬',
    audio: '🎵',
    code: '💻',
    spreadsheet: '📊',
    presentation: '📽️',
    document: '📝',
    archive: '📦',
    other: '📎',
  };
  return icons[category] || '📎';
}

/**
 * Check if a file supports inline preview.
 */
export function isPreviewable(contentType) {
  if (!contentType) return false;
  return (
    contentType.startsWith('image/') ||
    contentType === 'application/pdf' ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('text/')
  );
}

/**
 * Get the file extension from a filename.
 */
export function getExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toUpperCase() : '';
}
