import { useAuth }              from '../../modules/auth/AuthContext';
import logo                     from '../assets/logo.png';
import { useState } from 'react';
import ProfileMenu              from './ProfileMenu';
import ChangePasswordModal      from './ChangePasswordModal';
import UserManagementModal      from '../../modules/users/UserManagementModal';

export default function TopBanner({ currentUser, activeModule }) {
  const { logout } = useAuth();
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // User management (admin only)
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);

  const isAdmin = currentUser?.userType === 'admin';

  const displayName = [currentUser?.firstName, currentUser?.lastName]
    .filter(Boolean).join(' ') || currentUser?.username || 'User';

  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header className="erp-topbar">
      <div className="erp-topbar-brand">
        <img src={logo} alt="I.EVO" className="erp-topbar-logo-img" />
        <span className="erp-topbar-divider" />
        <span className="erp-topbar-module">{activeModule?.label ?? 'ERP'}</span>
      </div>

      <p className="erp-topbar-tagline">Design | Demonstrate | Deliver</p>

      <div className="erp-topbar-actions">
        <span className="erp-topbar-status">
          <span className="erp-status-dot" />
          Online
        </span>

        {/* ── User Management button — admin only ───────────────────────────── */}
        {isAdmin && (
          <button
            type="button"
            className="erp-usermgmt-btn"
            onClick={() => setUserMgmtOpen(true)}
            title="User Management"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            <span>User Mgmt</span>
          </button>
        )}

        {/* ── Profile ───────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="erp-topbar-profile"
            title={displayName}
            onClick={() => setProfileOpen(v => !v)}
          >
            <span className="erp-topbar-avatar">{initials}</span>
            <span className="erp-topbar-name">{displayName}</span>
          </button>

          <ProfileMenu
            open={profileOpen}
            user={currentUser}
            onClose={() => setProfileOpen(false)}
            onChangePassword={() => { setProfileOpen(false); setPasswordOpen(true); }}
          />

          <ChangePasswordModal
            open={passwordOpen}
            onClose={() => setPasswordOpen(false)}
          />
        </div>

        <button
          type="button"
          className="erp-topbar-logout"
          onClick={logout}
          title="Sign out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* User Management Modal */}
      <UserManagementModal
        open={userMgmtOpen}
        defaultTab="register"
        onClose={() => setUserMgmtOpen(false)}
      />
    </header>
  );
}