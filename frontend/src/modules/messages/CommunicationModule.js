import './assets/messaging.css';
import MessagingPage from './pages/MessagingPage';

/**
 * Communication / messaging module — mounts inside the right drawer.
 * Keeps messaging UI scoped; SocketProvider should wrap the app shell.
 */
export default function CommunicationModule({ currentUser }) {
  return (
    <div className="msg-module-root">
      <MessagingPage currentUser={currentUser} />
    </div>
  );
}
