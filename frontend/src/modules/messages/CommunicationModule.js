import MessagingPage from './pages/MessagingPage';
import { ModuleRoot } from './styles/MessagingPage.styles';

/**
 * Communication / messaging module — mounts inside the right drawer.
 * Keeps messaging UI scoped; SocketProvider should wrap the app shell.
 */
export default function CommunicationModule({ currentUser }) {
  return (
    <ModuleRoot>
      <MessagingPage currentUser={currentUser} />
    </ModuleRoot>
  );
}
