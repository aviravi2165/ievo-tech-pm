/**
 * ERP top bar — brand, module title, user session.
 */
export default function TopBanner({ currentUser, activeModule }) {
  const displayName = [currentUser?.firstName, currentUser?.lastName]
    .filter(Boolean)
    .join(' ') || 'User';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="erp-topbar">
      <div className="erp-topbar-brand">
        <span className="erp-topbar-logo">I.EVO</span>
        <span className="erp-topbar-divider" />
        <span className="erp-topbar-module">{activeModule?.label ?? 'ERP'}</span>
      </div>

      <p className="erp-topbar-tagline">Design | Demonstrate | Deliver</p>

      <div className="erp-topbar-actions">
        <span className="erp-topbar-status">
          <span className="erp-status-dot" />
          Logged in
        </span>
        <button type="button" className="erp-topbar-profile" title={displayName}>
          <span className="erp-topbar-avatar">{initials}</span>
          <span className="erp-topbar-name">{displayName}</span>
        </button>
      </div>
    </header>
  );
}
