import { formatBytes } from '../services/utils';

/**
 * Sidebar — navigation with brand, nav items, and storage indicator.
 */
export default function Sidebar({ currentPage, onNavigate, totalSize, isOpen, onClose }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'files',     label: 'My Files',  icon: '📁' },
    { id: 'upload',    label: 'Upload',     icon: '☁️' },
  ];

  // Assume 5 GB free tier
  const maxStorage = 5 * 1024 * 1024 * 1024;
  const usedPercent = Math.min((totalSize / maxStorage) * 100, 100);

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">☁️</div>
          <div>
            <h1>CloudVault</h1>
            <span>AWS S3 Storage</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => { onNavigate(item.id); onClose(); }}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Storage usage */}
        <div className="sidebar-storage">
          <div className="sidebar-storage-label">Storage Used</div>
          <div className="sidebar-storage-bar">
            <div
              className="sidebar-storage-fill"
              style={{ width: `${Math.max(usedPercent, 2)}%` }}
            />
          </div>
          <div className="sidebar-storage-text">
            {formatBytes(totalSize)} of {formatBytes(maxStorage)}
          </div>
        </div>
      </aside>
    </>
  );
}
