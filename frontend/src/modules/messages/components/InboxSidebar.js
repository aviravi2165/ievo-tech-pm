import { useState, useMemo } from 'react';
import { useMessaging } from '../context/MessagingContext';

function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d        = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function convDisplayLines(conv) {
  const count = conv.participantCount != null ? conv.participantCount : null;
  if (conv.convType === 'group_thread' || conv.groupName) {
    return {
      primary:   conv.groupName || conv.subject || '?',
      secondary: conv.subject || (count != null ? `${count} members` : ''),
    };
  }
  if (conv.convType === 'bcc') {
    return {
      primary:   conv.participantNames || conv.subject || '?',
      secondary: conv.subject || '',
    };
  }
  const participantLabel = count != null ? `${count} participants` : (conv.participantNames || '');
  return {
    primary:   conv.subject || conv.participantNames || '?',
    secondary: participantLabel,
  };
}

export default function InboxSidebar({
  conversations = [],
  loading,
  error,
  activeId,
  onSelect,
  onCompose,
  hideTabs = false,
  tab,
  onTabChange,
}) {
  const { unreadCount } = useMessaging();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c =>
      c.subject?.toLowerCase().includes(q) ||
      c.participantNames?.toLowerCase().includes(q) ||
      c.groupName?.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  return (
    <aside className="msg-sidebar">
      {/* Header — matches groups tab style */}
      <div className="msg-sidebar-header">
        <h2>I.EVO</h2>
        <p>Messages · Design | Demonstrate | Deliver</p>
      </div>

      <button className="msg-compose-btn" onClick={onCompose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New Message
      </button>

      <div className="msg-search-wrap">
        <input
          type="text"
          placeholder="Search conversations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {!hideTabs && (
        <nav className="msg-nav">
          <button
            type="button"
            className={`msg-nav-btn ${tab === 'inbox' ? 'active' : ''}`}
            onClick={() => onTabChange('inbox')}
          >
            Inbox
            {unreadCount > 0 && (
              <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`msg-nav-btn ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => onTabChange('groups')}
          >
            Groups
          </button>
        </nav>
      )}

      <div className="msg-conv-list" style={{ padding: '8px 12px' }}>
        {loading && <div className="loader-wrap"><div className="spinner" /></div>}

        {!loading && error && (
          <div className="msg-list-error">
            <p>{error}</p>
            <p className="msg-list-error-hint">Check that you are logged in and the API is running.</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {search ? 'No results found.' : 'No conversations yet.'}
          </div>
        )}

        {!loading && !error && filtered.map(conv => {
          const { primary, secondary } = convDisplayLines(conv);
          const isUnread = conv.unreadCount > 0;
          const timeStr  = fmtTime(conv.latestAt || conv.createdAt);
          return (
            <div
              key={conv.conversationId}
              className={`group-card ${activeId === conv.conversationId ? 'active' : ''} ${conv._flash ? 'conv-flash' : ''}`}
              style={{ margin: '0 0 8px', cursor: 'pointer', borderColor: isUnread ? 'var(--accent)' : undefined }}
              onClick={() => onSelect(conv)}
            >
              <div className="group-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>

              <div className="group-info" style={{ minWidth: 0 }}>
                <div className="group-name" style={{ fontWeight: isUnread ? 700 : 600 }}>
                  {primary}
                </div>
                <div className="group-count" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {secondary}
                </div>
              </div>

              {/* Right: time + unread dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                {timeStr && (
                  <span style={{
                    fontSize: 11.5, whiteSpace: 'nowrap',
                    color: isUnread ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: isUnread ? 600 : 400,
                  }}>
                    {timeStr}
                  </span>
                )}
                {isUnread && <span className="conv-unread-dot" />}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}