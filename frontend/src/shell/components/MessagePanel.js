import { useMessaging }       from '../../modules/messages/context/MessagingContext';
import CommunicationModule   from '../../modules/messages/CommunicationModule';

/**
 * Collapsible right rail — communication module always available.
 *
 * MessagingProvider now lives in App.js (inside SocketProvider, above
 * AppShell), so it is always mounted regardless of whether this panel is
 * open or collapsed. useMessaging() is therefore safe to call directly —
 * no try/catch fallback needed, and the unread badge updates via socket
 * events even when the panel is closed.
 */
export default function MessagePanel({ currentUser, open, onToggle }) {
  const { unreadCount } = useMessaging();

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