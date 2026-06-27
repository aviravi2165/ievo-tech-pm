import { useMessaging } from '../context/MessagingContext';

export default function MessageTabBar({ tab, onTabChange, isSuperAdmin = false }) {
  const { inboxUnreadCount, groupUnreadCount } = useMessaging();

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
        {inboxUnreadCount > 0 && (
          <span className="badge">{inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}</span>
        )}
      </button>
      <button type="button"
        className={`msg-nav-btn ${tab === 'groups' ? 'active' : ''}`}
        onClick={() => onTabChange('groups')}>
        Groups
        {groupUnreadCount > 0 && (
          <span className="badge">{groupUnreadCount > 99 ? '99+' : groupUnreadCount}</span>
        )}
      </button>
    </nav>
  );
}