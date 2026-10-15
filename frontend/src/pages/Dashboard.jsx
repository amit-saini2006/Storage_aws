import { formatBytes, formatDate, getFileIcon, getFileCategory } from '../services/utils';

/**
 * Dashboard — stats overview, quick actions, and recent files.
 */
export default function Dashboard({ files, loading, onNavigate }) {
  const totalFiles = files.length;
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  // Unique file types
  const fileTypes = new Set(files.map((f) => getFileCategory(f.content_type)));

  // Recent files — sorted by upload date, take last 5
  const recentFiles = [...files]
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    .slice(0, 5);

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your cloud storage</p>
      </div>

      {/* Stats cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon files">📁</div>
          <div className="stat-info">
            <h3>{totalFiles}</h3>
            <p>Total Files</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon storage">💾</div>
          <div className="stat-info">
            <h3>{formatBytes(totalSize)}</h3>
            <p>Storage Used</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon recent">🕐</div>
          <div className="stat-info">
            <h3>{recentFiles.length}</h3>
            <p>Recent Uploads</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon types">📎</div>
          <div className="stat-info">
            <h3>{fileTypes.size}</h3>
            <p>File Types</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <button className="quick-action-btn" onClick={() => onNavigate('upload')}>
          <span className="icon">⬆️</span> Upload Files
        </button>
        <button className="quick-action-btn" onClick={() => onNavigate('files')}>
          <span className="icon">📂</span> Browse Files
        </button>
      </div>

      {/* Recent files */}
      <div className="card">
        <div className="card-header">
          <h3>Recent Uploads</h3>
          {files.length > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('files')}>
              View All →
            </button>
          )}
        </div>
        <div className="card-body">
          {recentFiles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <h3>No files yet</h3>
              <p>Upload your first file to get started</p>
              <button className="btn btn-primary" onClick={() => onNavigate('upload')}>
                ⬆️ Upload Files
              </button>
            </div>
          ) : (
            recentFiles.map((file) => (
              <div key={file.file_id} className="recent-file-item">
                <span className="recent-file-icon">{getFileIcon(file.content_type)}</span>
                <div className="recent-file-info">
                  <div className="recent-file-name">{file.original_name}</div>
                  <div className="recent-file-meta">
                    {formatBytes(file.size)} · {formatDate(file.uploaded_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
