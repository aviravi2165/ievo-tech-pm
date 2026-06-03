import { useState, useMemo } from 'react';

/** Formats a date/ISO string to a short human label */
function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** First letter(s) for avatar */
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/**
 * InboxSidebar
 * Props:
 *   conversations   — array from useInbox
 *   loading         — bool
 *   activeId        — conversationId currently open
 *   onSelect(conv)  — click handler
 *   onCompose()     — open compose modal
 *   onViewGroups()  — switch to groups panel
 *   unreadCount     — number for badge
 */
export default function InboxSidebar({
  conversations = [],
  loading,
  error,
  activeId,
  onSelect,
  onCompose,
  hideTabs = false,
  unreadCount = 0,
  tab,
  onTabChange,
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      c =>
        c.subject?.toLowerCase().includes(q) ||
        c.latestSender?.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  return (
    <aside className="msg-sidebar">
      {/* Header */}
      <div className="msg-sidebar-header">
        <h2>I.EVO</h2>
        <p>Messages · Design | Demonstrate | Deliver</p>
      </div>

      {/* Compose button */}
      <button className="msg-compose-btn" onClick={onCompose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New Message
      </button>

      {/* Search */}
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
            className={`msg-nav-btn ${tab === 'sent' ? 'active' : ''}`}
            onClick={() => onTabChange('sent')}
          >
            Sent
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

      <div className="msg-conv-list">
        {loading && (
          <div className="loader-wrap">
            <div className="spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="msg-list-error">
            <p>{error}</p>
            <p className="msg-list-error-hint">Check that you are logged in and the API is running.</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {search ? 'No results found.' : 'No conversations yet.'}
          </div>
        )}

        {!loading && !error && filtered.map(conv => (
          <div
            key={conv.conversationId}
            className={`msg-conv-item ${activeId === conv.conversationId ? 'active' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}`}
            onClick={() => onSelect(conv)}
          >
            <div className="conv-avatar">{initials(conv.latestSender || conv.subject)}</div>
            <div className="conv-info">
              <div className="conv-top">
                <span className="conv-subject">{conv.subject}</span>
                <span className="conv-time">{fmtTime(conv.latestAt || conv.createdAt)}</span>
              </div>
              <div className="conv-preview">
                {conv.latestSender && <strong>{conv.latestSender}: </strong>}
                {conv.preview || 'No messages yet.'}
              </div>
            </div>
            {conv.unreadCount > 0 && <span className="conv-unread-dot" />}
          </div>
        ))}
      </div>
    </aside>
  );
}