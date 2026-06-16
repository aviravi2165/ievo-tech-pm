import { useState } from 'react';
import { useAuth } from '../../modules/auth/AuthContext';

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
    >
      <div
        style={{
          width: 420,
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 12px 40px rgba(0,0,0,.25)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Change Password
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) =>
                setCurrentPassword(e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
                marginTop: 4,
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
                marginTop: 4,
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
                marginTop: 4,
              }}
            />
          </div>

          {error && (
            <div
              style={{
                color: 'red',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                color: 'green',
                marginBottom: 12,
              }}
            >
              {success}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Saving...'
                : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}