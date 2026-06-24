import { useMessaging } from '../../modules/messages/context/MessagingContext';
import CommunicationModule from '../../modules/messages/CommunicationModule';

/**
 * Collapsible right rail — communication module always available.
 *
 * Previously called useUnreadCount() directly, which created a second
 * independent hook instance. That instance had its own socket listener and
 * its own count state, kept in sync with MessagingPage's instance only via
 * a window.dispatchEvent('messages-unread-decrement') hack. Now both the
 * toggle badge and the inbox tab badge read from MessagingContext — one
 * listener, one count, no cross-instance events.
 */
export default function MessagePanel({ currentUser, open, onToggle }) {
  // CommunicationModule renders MessagingProvider, so useMessaging() is only
  // available once the module is mounted. We read it here via a wrapper that
  // is always inside the provider tree (AppShell renders MessagePanel inside
  // the same tree that has CommunicationModule). If the context is not yet
  // available (e.g. panel never opened), fall back to 0 gracefully.
  let unreadCount = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ({ unreadCount } = useMessaging());
  } catch {
    // Provider not mounted yet — badge stays 0 until panel opens
  }

  return (
    <aside
      className={`erp-message-panel ${open ? 'open' : 'collapsed'}`}
      aria-label="Messages"
    >
      <button
        type="button"
        className="erp-message-toggle"
        onClick={onToggle}
        title={open ? 'Collapse messages' : 'Open messages'}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {!open && unreadCount > 0 && (
          <span className="erp-message-toggle-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className="erp-message-toggle-label">Messages</span>
      </button>

      {open && (
        <div className="erp-message-panel-body">
          <CommunicationModule currentUser={currentUser} />
        </div>
      )}
    </aside>
  );
}