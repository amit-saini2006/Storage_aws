import { useState, useEffect, useCallback } from 'react';
import './index.css';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { ToastContainer, useToast } from './components/Toast';

import Dashboard from './pages/Dashboard';
import FileManager from './pages/FileManager';
import UploadPage from './pages/UploadPage';

import { listFiles, checkHealth } from './services/api';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  files: 'My Files',
  upload: 'Upload Files',
};

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { toasts, addToast, removeToast } = useToast();

  // ── Fetch files from backend ────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFiles();
      setFiles(data.files || []);
    } catch (err) {
      addToast('error', 'Connection Error', err.message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // ── Check health & initial load ─────────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const health = await checkHealth();
        setIsDevMode(health.mode === 'development');
      } catch {
        // Server might not be running yet
      }
      fetchFiles();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──────────────────────────────────────────────────

  const navigate = (page) => {
    setCurrentPage(page);
    if (page === 'files' || page === 'dashboard') {
      fetchFiles();
    }
  };

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  // ── Render current page ─────────────────────────────────────────

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            files={files}
            loading={loading}
            onNavigate={navigate}
          />
        );
      case 'files':
        return (
          <FileManager
            files={files}
            loading={loading}
            onRefresh={fetchFiles}
            addToast={addToast}
          />
        );
      case 'upload':
        return (
          <UploadPage
            onUploadComplete={() => {
              fetchFiles();
              navigate('files');
            }}
            addToast={addToast}
          />
        );
      default:
        return <Dashboard files={files} loading={loading} onNavigate={navigate} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={currentPage}
        onNavigate={navigate}
        totalSize={totalSize}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-area">
        <TopBar
          title={PAGE_TITLES[currentPage] || 'CloudVault'}
          isDevMode={isDevMode}
          onMenuToggle={() => setSidebarOpen((o) => !o)}
        />
        <main className="page-content">
          {renderPage()}
        </main>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
