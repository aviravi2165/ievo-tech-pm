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
        right: '0',
        width: '320px',
        background: '#fff',
        border: '1px solid #d9d9d9',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 2000,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px' }}>
        <h4
          style={{
            margin: '0 0 16px 0',
            color: '#222',
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          My Profile
        </h4>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontSize: '14px',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: '#666',
                marginBottom: '2px',
              }}
            >
              Name
            </div>
            <div style={{ color: '#222' }}>{name}</div>
          </div>

          <div>
            <div
              style={{
                fontWeight: 600,
                color: '#666',
                marginBottom: '2px',
              }}
            >
              Email
            </div>
            <div style={{ color: '#222' }}>
              {user?.email || '-'}
            </div>
          </div>

          <div>
            <div
              style={{
                fontWeight: 600,
                color: '#666',
                marginBottom: '2px',
              }}
            >
              Username
            </div>
            <div style={{ color: '#222' }}>
              {user?.username || '-'}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid #eee',
          padding: '12px 16px',
        }}
      >
        <button
          type="button"
          onClick={onChangePassword}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            borderRadius: '6px',
            background: '#e31b23',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          Change Password
        </button>
      </div>
    </div>
  );
}