import './shell/assets/shell.css';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import { SocketProvider } from './modules/messages/context/SocketContext';
import LoginPage from './modules/auth/LoginPage';
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

  return (
    <SocketProvider token={token}>
      <AppShell currentUser={user} />
    </SocketProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

const loadingStyles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1a1d23',
    gap: 20,
  },
  logo: {
    fontFamily: 'Georgia, serif',
    fontSize: 36,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: '#ffffff',
  },
  dots: {
    display: 'flex',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#ed1c24',
    display: 'inline-block',
    animation: 'blink 1.2s infinite ease-in-out',
  },
};