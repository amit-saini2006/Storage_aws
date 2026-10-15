import { useState, useRef, useCallback } from 'react';
import { formatBytes, getFileIcon } from '../services/utils';
import { uploadFiles } from '../services/api';

/**
 * UploadPage — drag-and-drop + click-to-browse file upload with progress.
 */
export default function UploadPage({ onUploadComplete, addToast }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Drag & drop handlers
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setProgress(0);

    try {
      const result = await uploadFiles(selectedFiles, (loaded, total) => {
        setProgress(Math.round((loaded / total) * 100));
      });

      if (result.uploaded && result.uploaded.length > 0) {
        addToast('success', 'Upload Complete', result.message);
      }
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((err) => {
          addToast('error', 'Upload Failed', `${err.filename}: ${err.error}`);
        });
      }

      setSelectedFiles([]);
      setProgress(0);
      onUploadComplete();
    } catch (err) {
      addToast('error', 'Upload Error', err.message);
    } finally {
      setUploading(false);
    }
  };

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <div>
      <div className="page-header">
        <h2>Upload Files</h2>
        <p>Drag and drop files or click to browse</p>
      </div>

      {/* Drop zone */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className="upload-zone-icon">☁️</span>
        <h3>{dragOver ? 'Drop files here!' : 'Drag & drop files here'}</h3>
        <p>or click to browse from your computer</p>
        <button
          className="btn btn-primary"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          📎 Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h3>{selectedFiles.length} file(s) selected ({formatBytes(totalSize)})</h3>
          </div>
          <div className="card-body">
            <div className="upload-file-list">
              {selectedFiles.map((file, i) => (
                <div key={`${file.name}-${i}`} className="upload-file-item">
                  <span className="icon">{getFileIcon(file.type)}</span>
                  <span className="name">{file.name}</span>
                  <span className="size">{formatBytes(file.size)}</span>
                  {!uploading && (
                    <button className="remove-btn" onClick={() => removeFile(i)}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {uploading && (
              <div className="progress-container">
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-text">Uploading… {progress}%</div>
              </div>
            )}

            {/* Upload button */}
            {!uploading && (
              <div style={{ marginTop: 20, textAlign: 'right' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedFiles([])}
                  style={{ marginRight: 10 }}
                >
                  Clear All
                </button>
                <button className="btn btn-primary" onClick={handleUpload}>
                  ⬆️ Upload {selectedFiles.length} File(s)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
