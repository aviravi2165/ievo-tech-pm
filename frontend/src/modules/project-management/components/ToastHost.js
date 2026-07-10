import { useEffect, useState } from 'react';
import { useTheme } from '@emotion/react';
import { AlertTriangle } from 'lucide-react';
import { subscribeToasts } from '../hooks/toastStore';

export default function ToastHost() {
  const theme = useTheme();
  const [toasts, setToasts] = useState([]);
  useEffect(() => subscribeToasts(setToasts), []);

  if (!toasts.length) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 18, right: 18, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: t.type === 'error' ? theme.colors.danger : theme.colors.onyx,
          color: '#fff', padding: '10px 14px', borderRadius: theme.radius.sm,
          fontSize: 12, fontWeight: 500, lineHeight: 1.4, boxShadow: theme.shadow.lg,
        }}>
          <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
