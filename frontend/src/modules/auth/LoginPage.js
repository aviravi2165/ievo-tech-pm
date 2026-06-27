import { useState } from 'react';
import { useAuth } from './AuthContext';

// Three views inside the form card:
//  'login'       — normal username/password sign-in
//  'forgot'      — email input to request password reset
//  'forgot-sent' — confirmation after reset email was dispatched

export default function LoginPage() {
  const { login, forgotPassword } = useAuth();

  // Login view state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Shared state
  const [view,    setView]    = useState('login');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [fpEmail, setFpEmail] = useState('');

  // Banner for successful password change (set by ForceChangePasswordPage via sessionStorage)
  const [justChangedPassword] = useState(() => {
    const flag = sessionStorage.getItem('erp_pwd_changed');
    if (flag) sessionStorage.removeItem('erp_pwd_changed');
    return Boolean(flag);
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  function switchView(v) {
    setView(v);
    setError('');
    setFpEmail('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError('');
    if (!fpEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(fpEmail.trim());
      setView('forgot-sent');
    } catch (err) {
      // SMTP not configured or server error — show a helpful message
      setError(
        err.response?.data?.error ||
        'Could not send reset email. Please contact your administrator.'
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>

      {/* Left brand panel */}
      <div style={s.brand}>
        <div style={s.brandInner}>
          <div style={s.logo}>I.EVO</div>
          <div style={s.logoSub}>Unified Platform</div>
          <p style={s.tagline}>Design | Demonstrate | Deliver</p>
          <ul style={s.featureList}>
            {['Communication & Messaging', 'Project Management', 'Production Scheduling', 'HR & Workforce'].map((f) => (
              <li key={f} style={s.featureItem}>
                <span style={s.featureDot} />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p style={s.brandFooter}>Iraj Evolution Design Co. Pvt. Ltd.</p>
      </div>

      {/* Right form panel */}
      <div style={s.formPanel}>
        <div style={s.formCard}>

          {/* ── LOGIN VIEW ── */}
          {view === 'login' && (
            <>
              <h1 style={s.heading}>Welcome back</h1>
              <p style={s.subheading}>Sign in to your account</p>

              {justChangedPassword && (
                <div style={s.successBox} role="status">
                  Password changed successfully. Please sign in with your new password.
                </div>
              )}

              <form onSubmit={handleLogin} noValidate>
                <div style={s.field}>
                  <label style={s.label} htmlFor="username">Username</label>
                  <input
                    id="username"
                    style={s.input}
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    disabled={loading}
                  />
                </div>

                <div style={s.field}>
                  <label style={s.label} htmlFor="password">Password</label>
                  <div style={s.passWrap}>
                    <input
                      id="password"
                      style={{ ...s.input, paddingRight: 40 }}
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      style={s.eyeBtn}
                      onClick={() => setShowPass((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                {error && <div style={s.errorBox} role="alert">{error}</div>}

                <button
                  type="submit"
                  style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
                  disabled={loading}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  style={s.linkBtn}
                  onClick={() => switchView('forgot')}
                >
                  Forgot Password?
                </button>
              </div>

              <p style={s.hint}>
                Access is managed by your administrator.<br />
                Contact IT to request an account.
              </p>
            </>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {view === 'forgot' && (
            <>
              <button type="button" style={s.backBtn} onClick={() => switchView('login')}>
                ← Back to Sign In
              </button>

              <h1 style={s.heading}>Reset Password</h1>
              <p style={s.subheading}>
                Enter your registered email address. A temporary password will be sent to you.
              </p>

              <form onSubmit={handleForgotPassword} noValidate>
                <div style={s.field}>
                  <label style={s.label} htmlFor="fp-email">Email Address</label>
                  <input
                    id="fp-email"
                    style={s.input}
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    placeholder="your.email@company.com"
                    disabled={loading}
                  />
                </div>

                {error && <div style={s.errorBox} role="alert">{error}</div>}

                <button
                  type="submit"
                  style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send Reset Email'}
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT PASSWORD SENT VIEW ── */}
          {view === 'forgot-sent' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              {/* Check mark */}
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#eafaf1', border: '2px solid #b7e4c7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                  stroke="#1f6e43" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>

              <h2 style={{ ...s.heading, fontSize: 20, marginBottom: 10 }}>
                Check your inbox
              </h2>
              <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
                If <strong>{fpEmail}</strong> is registered and active, a temporary password
                has been sent. Use it to sign in — you'll be prompted to set a new password immediately.
              </p>
              <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: 28 }}>
                Didn't receive it? Check your spam folder or contact your administrator.
              </p>

              <button
                type="button"
                style={s.submitBtn}
                onClick={() => switchView('login')}
              >
                Back to Sign In
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root: {
    display: 'flex',
    height: '100vh',
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  },
  brand: {
    width: '42%',
    minWidth: 320,
    background: '#1a1d23',
    borderRight: '3px solid #ed1c24',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '48px 52px',
    color: '#f0ede8',
  },
  brandInner: { display: 'flex', flexDirection: 'column', gap: 8 },
  logo: {
    fontFamily: 'Georgia, serif',
    fontSize: 48,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: '#ffffff',
    lineHeight: 1,
  },
  logoSub: {
    fontSize: 13,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: '#ed1c24',
    fontWeight: 600,
    marginBottom: 24,
  },
  tagline: {
    fontSize: 14,
    color: '#a8a49c',
    letterSpacing: '0.08em',
    marginBottom: 32,
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 14,
    color: '#c8c4bc',
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#ed1c24',
    flexShrink: 0,
  },
  brandFooter: {
    fontSize: 11,
    color: '#4a4a46',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  formPanel: {
    flex: 1,
    background: '#f8f5f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
  },
  formCard: {
    width: '100%',
    maxWidth: 400,
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e0dcd4',
    padding: '40px 36px',
    boxShadow: '0 4px 24px rgba(26,29,35,0.08)',
  },
  heading: {
    fontSize: 24,
    fontWeight: 600,
    color: '#1a1d23',
    marginBottom: 6,
    fontFamily: 'Georgia, serif',
  },
  subheading: {
    fontSize: 14,
    color: '#707070',
    marginBottom: 28,
    lineHeight: 1.5,
  },
  field: { marginBottom: 18 },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#434242',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e0dcd4',
    borderRadius: 4,
    fontSize: 14,
    color: '#1a1d23',
    background: '#faf9f7',
    outline: 'none',
    transition: 'border-color 0.18s',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  passWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 4px',
    color: '#707070',
    fontFamily: 'inherit',
  },
  errorBox: {
    background: '#fdecea',
    border: '1px solid #f5c6cb',
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 13,
    color: '#7b1d1d',
    marginBottom: 18,
  },
  successBox: {
    background: '#eafaf1',
    border: '1px solid #b7e4c7',
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 13,
    color: '#1f6e43',
    marginBottom: 18,
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    background: '#ed1c24',
    color: '#ffffff',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    transition: 'background 0.18s',
    fontFamily: 'inherit',
    marginBottom: 16,
  },
  // "Forgot Password?" text link
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#ed1c24',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
    padding: 0,
  },
  // "← Back to Sign In" small nav link
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#707070',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0 0 20px 0',
    display: 'block',
    textDecoration: 'none',
  },
  hint: {
    fontSize: 12,
    color: '#9e9e9e',
    textAlign: 'center',
    lineHeight: 1.7,
    marginTop: 8,
  },
};