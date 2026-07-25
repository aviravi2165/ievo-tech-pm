import { useState } from 'react';
import { useAuth } from '../../modules/auth/AuthContext';
import {
  Overlay, ModalCard, ModalTitle, FormField, FieldLabel, FieldInput,
  ErrorText, SuccessText, FormActions, CancelBtn, SubmitBtn,
} from '../styles/ChangePasswordModal.styles';
import { useEscapeKey } from '../../modules/shared/hooks/useEscapeKey';

export default function ChangePasswordModal({
  open,
  onClose,
}) {
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEscapeKey(onClose, open);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!currentPassword.trim()) {
      setError('Current password is required.');
      return;
    }

    if (!newPassword.trim()) {
      setError('New password is required.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      await changePassword({
        currentPassword,
        newPassword,
      });

      setSuccess('Password changed successfully.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        onClose?.();
      }, 1000);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to change password.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay>
      <ModalCard>
        <ModalTitle>Change Password</ModalTitle>

        <form onSubmit={handleSubmit}>
          <FormField>
            <FieldLabel>Current Password</FieldLabel>
            <FieldInput
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </FormField>

          <FormField>
            <FieldLabel>New Password</FieldLabel>
            <FieldInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>

          <FormField>
            <FieldLabel>Confirm Password</FieldLabel>
            <FieldInput
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>

          {error && <ErrorText>{error}</ErrorText>}
          {success && <SuccessText>{success}</SuccessText>}

          <FormActions>
            <CancelBtn type="button" onClick={onClose} disabled={loading}>
              Cancel
            </CancelBtn>
            <SubmitBtn type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Change Password'}
            </SubmitBtn>
          </FormActions>
        </form>
      </ModalCard>
    </Overlay>
  );
}
