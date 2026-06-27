import { useMessaging } from '../context/MessagingContext';

/**
 * Always-visible Inbox / Groups tabs for the message drawer.
 * Sent tab has been removed — inbox shows private and shared chats,
 * groups tab manages all group conversations.
 */
export default function MessageTabBar({ tab, onTabChange, isSuperAdmin = false }) {
  const { unreadCount } = useMessaging();

  if (isSuperAdmin) {
    return (
      <nav className="msg-tab-bar" aria-label="Message views">
        <button type="button"
          className={`msg-nav-btn ${tab === 'threads' ? 'active' : ''}`}
          onClick={() => onTabChange('threads')}>
          Threads
        </button>
        <button type="button"
          className={`msg-nav-btn ${tab === 'groups' ? 'active' : ''}`}
          onClick={() => onTabChange('groups')}>
          Groups
        </button>
      </nav>
    );
  }

  return (
    <nav className="msg-tab-bar" aria-label="Message views">
      <button type="button"
        className={`msg-nav-btn ${tab === 'inbox' ? 'active' : ''}`}
        onClick={() => onTabChange('inbox')}>
        Inbox
        {unreadCount > 0 && (
          <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      <button type="button"
        className={`msg-nav-btn ${tab === 'groups' ? 'active' : ''}`}
        onClick={() => onTabChange('groups')}>
        Groups
      </button>
    </nav>
  );
}