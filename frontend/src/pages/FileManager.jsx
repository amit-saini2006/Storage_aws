import { useState, useMemo } from 'react';
import {
  formatBytes, formatDate, getFileIcon, getExtension, isPreviewable,
} from '../services/utils';
import { getDownloadUrl, getPreviewUrl, deleteFile } from '../services/api';

/**
 * FileManager — table/grid view of all files with search, sort,
 * download, preview, and delete.
 */
export default function FileManager({ files, loading, onRefresh, addToast }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('uploaded_at');
  const [sortDir, setSortDir] = useState('desc');
  const [viewMode, setViewMode] = useState('table');

  // Modal states
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Filtering & sorting ──────────────────────────────────────────

  const filteredFiles = useMemo(() => {
    let result = [...files];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.original_name.toLowerCase().includes(q) ||
          (f.content_type || '').toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      if (sortKey === 'original_name') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      if (sortKey === 'uploaded_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [files, search, sortKey, sortDir]);

  // ── Sort toggle ──────────────────────────────────────────────────

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  // ── Download ─────────────────────────────────────────────────────

  const handleDownload = async (file) => {
    try {
      const url = await getDownloadUrl(file.file_id);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.original_name || 'download');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1000);
    } catch (err) {
      addToast('error', 'Download Failed', err.message);
    }
  };

  // ── Preview ──────────────────────────────────────────────────────

  const handlePreview = async (file) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    try {
      const url = await getPreviewUrl(file.file_id);
      setPreviewUrl(url);
    } catch (err) {
      addToast('error', 'Preview Failed', err.message);
      setPreviewUrl('');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewUrl('');
  };

  // ── Delete ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFile(deleteTarget.file_id);
      addToast('success', 'File Deleted', `"${deleteTarget.original_name}" has been removed.`);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      addToast('error', 'Delete Failed', err.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
        <p>Loading files…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>My Files</h2>
        <p>{files.length} file(s) in storage</p>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search files by name or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="view-toggle">
          <button
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            ☰
          </button>
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            ▦
          </button>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
          🔄 Refresh
        </button>
      </div>

      {/* Empty state */}
      {filteredFiles.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">{search ? '🔍' : '📭'}</div>
            <h3>{search ? 'No matching files' : 'No files uploaded yet'}</h3>
            <p>{search ? 'Try a different search term' : 'Upload files to see them here'}</p>
          </div>
        </div>
      )}

      {/* Table view */}
      {filteredFiles.length > 0 && viewMode === 'table' && (
        <div className="card">
          <div className="file-table-container">
            <table className="file-table">
              <thead>
                <tr>
                  <th
                    className={sortKey === 'original_name' ? 'sorted' : ''}
                    onClick={() => toggleSort('original_name')}
                  >
                    Name <span className="sort-icon">{sortIcon('original_name')}</span>
                  </th>
                  <th>Type</th>
                  <th
                    className={sortKey === 'size' ? 'sorted' : ''}
                    onClick={() => toggleSort('size')}
                  >
                    Size <span className="sort-icon">{sortIcon('size')}</span>
                  </th>
                  <th
                    className={sortKey === 'uploaded_at' ? 'sorted' : ''}
                    onClick={() => toggleSort('uploaded_at')}
                  >
                    Uploaded <span className="sort-icon">{sortIcon('uploaded_at')}</span>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.file_id}>
                    <td>
                      <div className="file-name-cell">
                        <span className="file-icon">{getFileIcon(file.content_type)}</span>
                        <span className="file-name-text">{file.original_name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="file-type-badge">{getExtension(file.original_name)}</span>
                    </td>
                    <td>{formatBytes(file.size)}</td>
                    <td>{formatDate(file.uploaded_at)}</td>
                    <td>
                      <div className="file-actions">
                        {isPreviewable(file.content_type) && (
                          <button
                            className="file-action-btn preview"
                            title="Preview"
                            onClick={() => handlePreview(file)}
                          >
                            👁️
                          </button>
                        )}
                        <button
                          className="file-action-btn download"
                          title="Download"
                          onClick={() => handleDownload(file)}
                        >
                          ⬇️
                        </button>
                        <button
                          className="file-action-btn delete"
                          title="Delete"
                          onClick={() => setDeleteTarget(file)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid view */}
      {filteredFiles.length > 0 && viewMode === 'grid' && (
        <div className="file-grid">
          {filteredFiles.map((file) => (
            <div key={file.file_id} className="file-grid-item">
              <div className="file-grid-actions">
                {isPreviewable(file.content_type) && (
                  <button
                    className="file-action-btn preview"
                    onClick={() => handlePreview(file)}
                  >
                    👁️
                  </button>
                )}
                <button
                  className="file-action-btn download"
                  onClick={() => handleDownload(file)}
                >
                  ⬇️
                </button>
                <button
                  className="file-action-btn delete"
                  onClick={() => setDeleteTarget(file)}
                >
                  🗑️
                </button>
              </div>
              <div className="file-grid-icon">{getFileIcon(file.content_type)}</div>
              <div className="file-grid-name">{file.original_name}</div>
              <div className="file-grid-meta">
                {formatBytes(file.size)} · {formatDate(file.uploaded_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirmation modal ───────────────────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete File</h3>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="confirm-dialog">
                <div className="icon">⚠️</div>
                <h4>Are you sure?</h4>
                <p>This will permanently delete:</p>
                <p className="filename">"{deleteTarget.original_name}"</p>
                <p style={{ marginTop: 8 }}>This action cannot be undone.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : '🗑️ Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview modal ───────────────────────────────────────── */}
      {previewFile && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📄 {previewFile.original_name}</h3>
              <button className="modal-close" onClick={closePreview}>✕</button>
            </div>
            <div className="modal-body">
              {previewLoading ? (
                <div className="loading-spinner">
                  <div className="spinner" />
                  <p>Loading preview…</p>
                </div>
              ) : previewUrl ? (
                <div className="preview-content">
                  {previewFile.content_type?.startsWith('image/') ? (
                    <img
                      src={previewUrl}
                      alt={previewFile.original_name}
                      className="preview-image"
                    />
                  ) : previewFile.content_type === 'application/pdf' ? (
                    <iframe
                      src={previewUrl}
                      className="preview-iframe"
                      title={previewFile.original_name}
                    />
                  ) : previewFile.content_type?.startsWith('video/') ? (
                    <div style={{ textAlign: 'center', width: '100%' }}>
                      <video
                        src={previewUrl}
                        controls
                        autoPlay
                        className="preview-video"
                      />
                    </div>
                  ) : previewFile.content_type?.startsWith('audio/') ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', width: '100%' }}>
                      <audio src={previewUrl} controls autoPlay className="preview-audio" />
                    </div>
                  ) : previewFile.content_type?.startsWith('text/') ? (
                    <iframe
                      src={previewUrl}
                      className="preview-iframe"
                      title={previewFile.original_name}
                    />
                  ) : (
                    <div className="preview-unavailable">
                      <div className="icon">{getFileIcon(previewFile.content_type)}</div>
                      <h3>Preview not available</h3>
                      <p>This file type does not support inline preview.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="preview-unavailable">
                  <div className="icon">❌</div>
                  <h3>Could not load preview</h3>
                  <p>Try downloading the file instead.</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closePreview}>Close</button>
              <button className="btn btn-primary" onClick={() => handleDownload(previewFile)}>
                ⬇️ Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
