import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      await login({ username: username.trim(), password });
      // AuthContext updates user — App.js will re-render into the shell
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

  return (
    <div style={styles.root}>
      {/* Left panel — brand */}
      <div style={styles.brand}>
        <div style={styles.brandInner}>
          <div style={styles.logo}>I.EVO</div>
          <div style={styles.logoSub}>ERP Platform</div>
          <p style={styles.tagline}>Design | Demonstrate | Deliver</p>
          <ul style={styles.featureList}>
            {['Communication & Messaging', 'Project Management', 'Production Scheduling', 'HR & Workforce'].map((f) => (
              <li key={f} style={styles.featureItem}>
                <span style={styles.featureDot} />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p style={styles.brandFooter}>
          Iraj Evolution Design Co. Pvt. Ltd.
        </p>
      </div>

      {/* Right panel — form */}
      <div style={styles.formPanel}>
        <div style={styles.formCard}>
          {/* Mobile logo */}
          <div style={styles.mobileLogoWrap}>
            <span style={styles.mobileLogo}>I.EVO</span>
            <span style={styles.mobileLogoSub}>ERP</span>
          </div>

          <h1 style={styles.heading}>Welcome back</h1>
          <p style={styles.subheading}>Sign in to your ERP account</p>

          <form onSubmit={handleSubmit} noValidate>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="username">Username</label>
              <input
                id="username"
                style={styles.input}
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                disabled={loading}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="password">Password</label>
              <div style={styles.passWrap}>
                <input
                  id="password"
                  style={{ ...styles.input, paddingRight: 40 }}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  style={styles.eyeBtn}
                  onClick={() => setShowPass((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div style={styles.errorBox} role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={styles.hint}>
            Access is managed by your administrator.<br />
            Contact IT to request an account.
          </p>
        </div>
      </div>
    </div>
  );
}

// Inline styles — matches the existing IEVO shell theme variables
// (white background, ievo-red accent, coal text, divider borders)
const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  },
  // Left brand panel
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
  // Right form panel
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
  mobileLogoWrap: {
    display: 'none', // shown on mobile via media query — inline styles can't do that easily
    // kept here for structure; add a class in real project if needed
  },
  mobileLogo: {
    fontFamily: 'Georgia, serif',
    fontSize: 22,
    fontWeight: 600,
    color: '#1a1d23',
    letterSpacing: '0.08em',
  },
  mobileLogoSub: {
    fontSize: 11,
    color: '#ed1c24',
    fontWeight: 600,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    marginLeft: 8,
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
  },
  field: {
    marginBottom: 18,
  },
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
  passWrap: {
    position: 'relative',
  },
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
    marginBottom: 20,
  },
  hint: {
    fontSize: 12,
    color: '#9e9e9e',
    textAlign: 'center',
    lineHeight: 1.7,
  },
};