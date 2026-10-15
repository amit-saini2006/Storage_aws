/**
 * TopBar — application header with page title, mode badge, and avatar.
 */
export default function TopBar({ title, isDevMode, onMenuToggle }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-menu-btn" onClick={onMenuToggle}>
          ☰
        </button>
        <h2 className="topbar-title">{title}</h2>
      </div>
      <div className="topbar-right">
        {isDevMode && (
          <span className="topbar-badge dev">🔧 Dev Mode</span>
        )}
        {!isDevMode && (
          <span className="topbar-badge">☁️ AWS S3</span>
        )}
        <div className="topbar-avatar" title="User">U</div>
      </div>
    </header>
  );
}
