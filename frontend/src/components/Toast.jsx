import { useState, useEffect, useCallback } from 'react';

/**
 * Toast notification system — provides addToast() and a <ToastContainer>.
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, title, message = '') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

export function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-icon">{icons[toast.type]}</span>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
          <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
          <div className="toast-progress" />
        </div>
      ))}
    </div>
  );
}
