import { useState } from 'react';
import { useAuth } from './AuthContext';
import { useTheme } from '@emotion/react';
import logoIcon from '../../shell/assets/specula-icon.png';
import {
  Root, Brand, BrandInner, LogoRow, LogoIcon, Logo, LogoSub, Tagline, BrandFooter,
  FormPanel, FormCard, Heading, Subheading, Field, Label, Input,
  ErrorBox, SuccessBox, SubmitBtn, Hint,
} from './styles/AuthLayout.styles';
import { FeatureList, FeatureItem, FeatureDot, PassWrap, EyeBtn, LinkBtn, BackBtn, CheckCircle } from './styles/LoginPage.styles';

// Three views inside the form card:
//  'login'       — normal username/password sign-in
//  'forgot'      — email input to request password reset
//  'forgot-sent' — confirmation after reset email was dispatched

export default function LoginPage() {
  const { login, forgotPassword } = useAuth();
  const theme = useTheme();

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
    <Root>

      {/* Left brand panel */}
      <Brand>
        <BrandInner>
          <LogoRow>
            <LogoIcon src={logoIcon} alt="" />
            <Logo>SPECULA</Logo>
          </LogoRow>
          <LogoSub>Unified Platform</LogoSub>
          <Tagline>Design | Demonstrate | Deliver</Tagline>
          <FeatureList>
            {['Communication & Messaging', 'Project Management', 'Production Scheduling', 'HR & Workforce'].map((f) => (
              <FeatureItem key={f}>
                <FeatureDot />
                {f}
              </FeatureItem>
            ))}
          </FeatureList>
        </BrandInner>
        <BrandFooter>Iraj Evolution Design Co. Pvt. Ltd.</BrandFooter>
      </Brand>

      {/* Right form panel */}
      <FormPanel>
        <FormCard>

          {/* ── LOGIN VIEW ── */}
          {view === 'login' && (
            <>
              <Heading>Welcome back</Heading>
              <Subheading>Sign in to your account</Subheading>

              {justChangedPassword && (
                <SuccessBox role="status">
                  Password changed successfully. Please sign in with your new password.
                </SuccessBox>
              )}

              <form onSubmit={handleLogin} noValidate>
                <Field>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    disabled={loading}
                  />
                </Field>

                <Field>
                  <Label htmlFor="password">Password</Label>
                  <PassWrap>
                    <Input
                      id="password"
                      style={{ paddingRight: 40 }}
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      disabled={loading}
                    />
                    <EyeBtn
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? '🙈' : '👁'}
                    </EyeBtn>
                  </PassWrap>
                </Field>

                {error && <ErrorBox role="alert">{error}</ErrorBox>}

                <SubmitBtn type="submit" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </SubmitBtn>
              </form>

              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <LinkBtn type="button" onClick={() => switchView('forgot')}>
                  Forgot Password?
                </LinkBtn>
              </div>

              <Hint>
                Access is managed by your administrator.<br />
                Contact IT to request an account.
              </Hint>
            </>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {view === 'forgot' && (
            <>
              <BackBtn type="button" onClick={() => switchView('login')}>
                ← Back to Sign In
              </BackBtn>

              <Heading>Reset Password</Heading>
              <Subheading>
                Enter your registered email address. A temporary password will be sent to you.
              </Subheading>

              <form onSubmit={handleForgotPassword} noValidate>
                <Field>
                  <Label htmlFor="fp-email">Email Address</Label>
                  <Input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    placeholder="your.email@company.com"
                    disabled={loading}
                  />
                </Field>

                {error && <ErrorBox role="alert">{error}</ErrorBox>}

                <SubmitBtn type="submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send Reset Email'}
                </SubmitBtn>
              </form>
            </>
          )}

          {/* ── FORGOT PASSWORD SENT VIEW ── */}
          {view === 'forgot-sent' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                  stroke={theme.colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </CheckCircle>

              <Heading small style={{ marginBottom: 10 }}>
                Check your inbox
              </Heading>
              <p style={{ fontSize: 14, color: theme.colors.ash, lineHeight: 1.6, marginBottom: 24 }}>
                If <strong>{fpEmail}</strong> is registered and active, a temporary password
                has been sent. Use it to sign in — you'll be prompted to set a new password immediately.
              </p>
              <p style={{ fontSize: 13, color: theme.colors.ash, lineHeight: 1.6, marginBottom: 28 }}>
                Didn't receive it? Check your spam folder or contact your administrator.
              </p>

              <SubmitBtn type="button" onClick={() => switchView('login')}>
                Back to Sign In
              </SubmitBtn>
            </div>
          )}

        </FormCard>
      </FormPanel>
    </Root>
  );
}
