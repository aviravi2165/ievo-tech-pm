import { useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * Shown instead of the main app when user.mustChangePassword === true
 * (set by an admin inserting/resetting a user with must_change_password = 1).
 *
 * Flow:
 *   1. User is logged in (has a valid token) but is gated here instead of AppShell.
 *   2. They must supply their current (temp) password + a new one.
 *   3. On success, the backend clears must_change_password back to 0.
 *   4. We then log them out and bounce back to LoginPage, per the requirement
 *      that they sign in fresh with their new password rather than continuing
 *      straight into the app.
 */
export default function ForceChangePasswordPage() {
  const { setInitialPassword, logout } = useAuth();

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [success,         setSuccess]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await setInitialPassword({ newPassword });
      setSuccess(true);
      // Let them see the confirmation briefly, then sign them out so they
      // come back through LoginPage and authenticate with the new password.
      sessionStorage.setItem('erp_pwd_changed', '1');
      setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to set password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.brand}>
        <div style={styles.brandInner}>
          <div style={styles.logo}>I.EVO</div>
          <div style={styles.logoSub}>Unified Platform</div>
          <p style={styles.tagline}>Design | Demonstrate | Deliver</p>
        </div>
        <p style={styles.brandFooter}>Iraj Evolution Design Co. Pvt. Ltd.</p>
      </div>

      <div style={styles.formPanel}>
        <div style={styles.formCard}>
          <div style={styles.mobileLogoWrap}>
            <span style={styles.mobileLogo}>I.EVO</span>
            <span style={styles.mobileLogoSub}>ERP</span>
          </div>

          <h1 style={styles.heading}>Set a new password</h1>
          <p style={styles.subheading}>
            Your account requires a password change before you can continue.
          </p>

          {success ? (
            <div style={styles.successBox} role="status">
              Password changed successfully. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="newPassword">New password</label>
                <input
                  id="newPassword"
                  style={styles.input}
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="confirmPassword">Confirm new password</label>
                <input
                  id="confirmPassword"
                  style={styles.input}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              {error && (
                <div style={styles.errorBox} role="alert">{error}</div>
              )}

              <button
                type="submit"
                style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
                disabled={loading}
              >
                {loading ? 'Updating…' : 'Change Password & Continue'}
              </button>
            </form>
          )}

          <p style={styles.hint}>
            You'll be asked to sign in again with your new password.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', height: '100vh', fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" },
  brand: {
    width: '42%', minWidth: 320, background: '#1a1d23', borderRight: '3px solid #ed1c24',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 52px', color: '#f0ede8',
  },
  brandInner: { display: 'flex', flexDirection: 'column', gap: 8 },
  logo: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 600, letterSpacing: '0.12em', color: '#ffffff', lineHeight: 1 },
  logoSub: { fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#ed1c24', fontWeight: 600, marginBottom: 24 },
  tagline: { fontSize: 14, color: '#a8a49c', letterSpacing: '0.08em', marginBottom: 32 },
  brandFooter: { fontSize: 11, color: '#4a4a46', letterSpacing: '0.06em', textTransform: 'uppercase' },
  formPanel: { flex: 1, background: '#f8f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' },
  formCard: { width: '100%', maxWidth: 420, background: '#ffffff', borderRadius: 8, border: '1px solid #e0dcd4', padding: '40px 36px', boxShadow: '0 4px 24px rgba(26,29,35,0.08)' },
  mobileLogoWrap: { display: 'none' },
  mobileLogo: { fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 600, color: '#1a1d23', letterSpacing: '0.08em' },
  mobileLogoSub: { fontSize: 11, color: '#ed1c24', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginLeft: 8 },
  heading: { fontSize: 24, fontWeight: 600, color: '#1a1d23', marginBottom: 6, fontFamily: 'Georgia, serif' },
  subheading: { fontSize: 14, color: '#707070', marginBottom: 28, lineHeight: 1.5 },
  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#434242', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #e0dcd4', borderRadius: 4, fontSize: 14,
    color: '#1a1d23', background: '#faf9f7', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  errorBox: { background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#7b1d1d', marginBottom: 18 },
  successBox: { background: '#eafaf1', border: '1px solid #b7e4c7', borderRadius: 4, padding: '14px 16px', fontSize: 14, color: '#1f6e43', marginBottom: 12 },
  submitBtn: {
    width: '100%', padding: '12px', background: '#ed1c24', color: '#ffffff', border: 'none', borderRadius: 4,
    fontSize: 14, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 20,
  },
  hint: { fontSize: 12, color: '#9e9e9e', textAlign: 'center', lineHeight: 1.7 },
};