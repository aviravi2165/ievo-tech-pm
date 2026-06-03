import './shell/assets/shell.css';
import { SocketProvider } from './modules/messages/context/SocketContext';
import AppShell from './shell/AppShell';

/**
 * I.EVO ERP root — dashboard shell + collapsible messages rail.
 * Replace DEV_USER with auth from the parent ERP when embedding.
 */
const DEV_USER = {
  userId: 1,
  firstName: 'Dev',
  lastName: 'User',
};

export default function App() {
  const currentUser = DEV_USER;

  return (
    <SocketProvider>
      <AppShell currentUser={currentUser} />
    </SocketProvider>
  );
}
