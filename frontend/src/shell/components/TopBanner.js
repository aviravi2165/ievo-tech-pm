import { useAuth }              from '../../modules/auth/AuthContext';
import logo                     from '../assets/logo.png';
import { useState, useEffect } from 'react';
import ProfileMenu              from './ProfileMenu';
import ChangePasswordModal      from './ChangePasswordModal';
import UserManagementModal      from '../../modules/users/UserManagementModal';
import {
  Topbar, TopbarBrand, TopbarLogoImg, TopbarDivider, TopbarModule,
  TopbarActions, TopbarStatus, StatusDot, TopbarProfile, TopbarAvatar,
  TopbarName, TopbarLogout, UserMgmtBtn,
} from '../styles/TopBanner.styles';

export default function TopBanner({ currentUser, activeModule }) {
  const { logout } = useAuth();
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // User management (admin only)
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [userMgmtTab,  setUserMgmtTab]  = useState('register');

  const isAdmin = currentUser?.userType === 'admin';

  // Opened programmatically by the admin dashboard's "Manage Users"/"Active
  // Users" shortcuts (this modal's open state is otherwise only reachable
  // via the topbar icon button below) — mirrors the existing
  // 'open-messages-panel' pattern. detail.tab lets the caller land on the
  // Edit Users tab directly instead of always defaulting to Register —
  // previously every dashboard shortcut opened Register regardless of what
  // it was actually labeled ("Active Users", "Manage Users →").
  useEffect(() => {
    if (!isAdmin) return;
    const open = (e) => { setUserMgmtTab(e.detail?.tab || 'register'); setUserMgmtOpen(true); };
    window.addEventListener('open-user-management', open);
    return () => window.removeEventListener('open-user-management', open);
  }, [isAdmin]);

  const displayName = [currentUser?.firstName, currentUser?.lastName]
    .filter(Boolean).join(' ') || currentUser?.username || 'User';

  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Topbar>
      <TopbarBrand>
        <TopbarLogoImg src={logo} alt="I.EVO" />
        <TopbarDivider />
        <TopbarModule>{activeModule?.label ?? 'ERP'}</TopbarModule>
      </TopbarBrand>

      {/* Tagline dropped entirely — was shown only above 900px anyway,
          decorative marketing copy that ate width the slimmer redesign
          needs for the workspace instead. */}

      <TopbarActions>
        <TopbarStatus>
          <StatusDot />
          Online
        </TopbarStatus>

        {/* ── User Management button — admin only ───────────────────────────── */}
        {isAdmin && (
          <UserMgmtBtn type="button" onClick={() => { setUserMgmtTab('manage'); setUserMgmtOpen(true); }} title="User Management">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            <span>Manage Users</span>
          </UserMgmtBtn>
        )}

        {/* ── Profile ───────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <TopbarProfile
            type="button"
            title={displayName}
            onClick={() => setProfileOpen(v => !v)}
          >
            <TopbarAvatar>{initials}</TopbarAvatar>
            <TopbarName>{displayName}</TopbarName>
          </TopbarProfile>

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

        <TopbarLogout type="button" onClick={logout} title="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </TopbarLogout>
      </TopbarActions>

      {/* User Management Modal */}
      <UserManagementModal
        open={userMgmtOpen}
        defaultTab={userMgmtTab}
        onClose={() => setUserMgmtOpen(false)}
      />
    </Topbar>
  );
}
