import { useTheme } from '@emotion/react';

export default function NotFoundPage() {
  const theme = useTheme();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 600, letterSpacing: '0.12em', color: theme.colors.onyx }}>404</div>
      <div style={{ color: theme.colors.ashLight, fontSize: 14, textAlign: 'center', maxWidth: 340 }}>
        This page doesn't exist.
      </div>
      <a href="/" style={{ color: theme.colors.copper, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
        ← Back to Dashboard
      </a>
    </div>
  );
}
