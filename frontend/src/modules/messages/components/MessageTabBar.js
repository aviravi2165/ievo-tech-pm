import { useMessaging } from '../context/MessagingContext';

/**
 * Always-visible Inbox / Sent / Groups tabs for the message drawer.
 *
 * Previously received unreadCount as a prop from MessagingPage.
 * Now reads it from MessagingContext directly — no prop needed.
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
        className={`msg-nav-btn ${tab === 'sent' ? 'active' : ''}`}
        onClick={() => onTabChange('sent')}>
        Sent
      </button>
      <button type="button"
        className={`msg-nav-btn ${tab === 'groups' ? 'active' : ''}`}
        onClick={() => onTabChange('groups')}>
        Groups
      </button>
    </nav>
  );
}