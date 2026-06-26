import { useAuth }              from '../../modules/auth/AuthContext';
import logo                     from '../assets/logo.png';
import { useState, useRef, useEffect } from 'react';
import ProfileMenu              from './ProfileMenu';
import ChangePasswordModal      from './ChangePasswordModal';
import UserManagementModal      from '../../modules/users/UserManagementModal';

export default function TopBanner({ currentUser, activeModule }) {
  const { logout } = useAuth();
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // User management (admin only)
  const [userMgmtOpen,     setUserMgmtOpen]     = useState(false);
  const [userMgmtTab,      setUserMgmtTab]      = useState('register');
  const [userMgmtDropdown, setUserMgmtDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const isAdmin = currentUser?.userType === 'admin';

  // Close user-mgmt dropdown on outside click
  useEffect(() => {
    if (!userMgmtDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setUserMgmtDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMgmtDropdown]);

  const openModal = (tab) => {
    setUserMgmtTab(tab);
    setUserMgmtDropdown(false);
    setUserMgmtOpen(true);
  };

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
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="erp-usermgmt-btn"
              onClick={() => setUserMgmtDropdown(v => !v)}
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
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 2 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {userMgmtDropdown && (
              <div className="erp-usermgmt-dropdown">
                <button
                  type="button"
                  className="erp-usermgmt-item"
                  onClick={() => openModal('register')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                  Register User
                </button>
                <button
                  type="button"
                  className="erp-usermgmt-item"
                  onClick={() => openModal('manage')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  Edit Users
                </button>
              </div>
            )}
          </div>
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
        defaultTab={userMgmtTab}
        onClose={() => setUserMgmtOpen(false)}
      />
    </header>
  );
}