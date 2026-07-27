import { useState } from 'react';
import { useAuth } from './AuthContext';
import logoIcon from '../../shell/assets/specula-icon.png';
import {
  Root, Brand, BrandInner, LogoRow, LogoIcon, Logo, LogoSub, Tagline, BrandFooter,
  FormPanel, FormCard, Heading, Subheading, Field, Label, Input,
  ErrorBox, SuccessBox, SubmitBtn, Hint,
} from './styles/AuthLayout.styles';
import { MobileLogoWrap, MobileLogo, MobileLogoSub } from './styles/ForceChangePasswordPage.styles';

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
    <Root>
      <Brand>
        <BrandInner>
          <LogoRow>
            <LogoIcon src={logoIcon} alt="" />
            <Logo>SPECULA</Logo>
          </LogoRow>
          <LogoSub>Unified Platform</LogoSub>
          <Tagline>Design | Demonstrate | Deliver</Tagline>
        </BrandInner>
        <BrandFooter>Iraj Evolution Design Co. Pvt. Ltd.</BrandFooter>
      </Brand>

      <FormPanel>
        <FormCard wide>
          <MobileLogoWrap>
            <MobileLogo>SPECULA</MobileLogo>
            <MobileLogoSub>ERP</MobileLogoSub>
          </MobileLogoWrap>

          <Heading>Set a new password</Heading>
          <Subheading>
            Your account requires a password change before you can continue.
          </Subheading>

          {success ? (
            <SuccessBox roomy role="status">
              Password changed successfully. Redirecting you to sign in…
            </SuccessBox>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <Field>
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                />
              </Field>

              <Field>
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </Field>

              {error && <ErrorBox role="alert">{error}</ErrorBox>}

              <SubmitBtn tight type="submit" disabled={loading}>
                {loading ? 'Updating…' : 'Change Password & Continue'}
              </SubmitBtn>
            </form>
          )}

          <Hint noTopMargin>
            You'll be asked to sign in again with your new password.
          </Hint>
        </FormCard>
      </FormPanel>
    </Root>
  );
}
