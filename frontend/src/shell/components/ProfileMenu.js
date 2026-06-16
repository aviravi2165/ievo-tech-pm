import { useEffect, useRef } from 'react';

export default function ProfileMenu({
  user,
  open,
  onClose,
  onChangePassword,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!open) return null;

  const name =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ') ||
    user?.username ||
    'User';

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '58px',
        right: '50px',
        width: '280px',
        background: '#111827',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)',
        zIndex: 2000,
        overflow: 'hidden'
      }}
    >
      <div style={{ padding: '16px' }}>
        <h4 style={{ margin: 0, marginBottom: 12 }}>
          Profile
        </h4>

        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div>
            <strong>Name:</strong> {name}
          </div>

          <div>
            <strong>Email:</strong> {user?.email || '-'}
          </div>

          <div>
            <strong>Username:</strong> {user?.username || '-'}
          </div>

          <div>
            <strong>Role:</strong> {user?.role || '-'}
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,.08)',
          padding: '10px'
        }}
      >
        <button
          type="button"
          onClick={onChangePassword}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Change Password
        </button>
      </div>
    </div>
  );
}