import { ThemeProvider, Global, css } from '@emotion/react';
import theme from './theme';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import { SocketProvider } from './modules/messages/context/SocketContext';
import LoginPage from './modules/auth/LoginPage';
import ForceChangePasswordPage from './modules/auth/ForceChangePasswordPage';
import AppShell from './shell/AppShell';

/**
 * Inner component — reads from AuthContext.
 * Shows LoginPage when logged out, AppShell when logged in.
 */
function AuthGate() {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div style={loadingStyles.root}>
        <div style={loadingStyles.logo}>I.EVO</div>
        <div style={loadingStyles.dots}>
          <span style={{ ...loadingStyles.dot, animationDelay: '0ms' }} />
          <span style={{ ...loadingStyles.dot, animationDelay: '160ms' }} />
          <span style={{ ...loadingStyles.dot, animationDelay: '320ms' }} />
        </div>
        <style>{`
          @keyframes blink {
            0%, 80%, 100% { opacity: 0.2; }
            40% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (!user || !token) {
    return <LoginPage />;
  }

  if (user.mustChangePassword) {
    return <ForceChangePasswordPage />;
  }

  return (
    <SocketProvider token={token}>
      <AppShell currentUser={user} />
    </SocketProvider>
  );
}

// Base document typography/background + scrollbar styling — this used to
// live in modules/messages/assets/messaging.css's `html, body, #root { }`
// rule and only actually applied once the messaging module happened to
// mount (its CSS import was the only thing setting it), so the whole app
// was accidentally depending on an unrelated module's stylesheet for its
// base font/color. Genuinely global, so it belongs here at the app root,
// not in any one module's styles.
const globalStyles = (t) => css`
  html, body, #root {
    height: 100%;
    background: ${t.colors.greige};
    color: ${t.colors.onyx};
    font-family: ${t.font.body};
    font-size: 12px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${t.colors.ashLight}; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: ${t.colors.ash}; }
`;

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <Global styles={globalStyles(theme)} />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}

const loadingStyles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.colors.onyx,
    gap: 20,
  },
  logo: {
    fontFamily: 'Georgia, serif',
    fontSize: 36,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: theme.colors.white,
  },
  dots: {
    display: 'flex',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: theme.colors.copper,
    display: 'inline-block',
    animation: 'blink 1.2s infinite ease-in-out',
  },
};