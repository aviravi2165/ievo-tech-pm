import { useAuth } from '../../modules/auth/AuthContext';

export default function TopBanner({ currentUser, activeModule }) {
  const { logout } = useAuth();

  const displayName = [currentUser?.firstName, currentUser?.lastName]
    .filter(Boolean)
    .join(' ') || currentUser?.username || 'User';

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
          {currentUser?.userType || 'Employee'}
        </span>

        <button type="button" className="erp-topbar-profile" title={displayName}>
          <span className="erp-topbar-avatar">{initials}</span>
          <span className="erp-topbar-name">{displayName}</span>
        </button>

        <button
          type="button"
          className="erp-topbar-logout"
          onClick={logout}
          title="Sign out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>
  );
}