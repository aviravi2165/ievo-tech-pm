import { useState, useMemo } from 'react';

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

/**
 * Inbox/Sent row text — split into a primary (big, line 1) and secondary
 * (smaller, line 2) line, based on conversation type:
 *
 *   - Group threads   → group name (big)        / participants (small)
 *   - Shared (cc)      → subject (big)            / participants (small)
 *   - Private (bcc)    → other person's name (big) / subject (small)
 */
function convDisplayLines(conv) {
  const count = conv.participantCount != null ? conv.participantCount : null;

  if (conv.convType === 'group_thread' || conv.groupName) {
    // Group chat: group name on top, subject (first message topic) below with member count
    const sub = [conv.subject, count != null ? `${count} members` : null]
      .filter(Boolean).join(' · ');
    return {
      primary:   conv.groupName || conv.subject || '?',
      secondary: sub || '',
    };
  }
  if (conv.convType === 'bcc') {
    // Private: recipient name on top, subject below
    return {
      primary:   conv.participantNames || conv.subject || '?',
      secondary: conv.subject || '',
    };
  }
  // Shared (cc): subject on top, participant count below
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
  unreadCount = 0,
  tab,
  onTabChange,
}) {
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
        {loading && <div className="loader-wrap"><div className="spinner" /></div>}

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

        {!loading && !error && filtered.map(conv => {
          const { primary, secondary } = convDisplayLines(conv);
          return (
            <div
              key={conv.conversationId}
              className={`msg-conv-item ${activeId === conv.conversationId ? 'active' : ''} ${conv.unreadCount > 0 ? 'unread' : ''} ${conv._flash ? 'conv-flash' : ''}`}
              onClick={() => onSelect(conv)}
            >
              <div className="conv-avatar">{initials(primary)}</div>
              <div className="conv-info">
                <div className="conv-top">
                  {/* PRIMARY LINE — see convDisplayLines() for which field this is per type */}
                  <span className="conv-subject">{primary}</span>
                  <span className="conv-time">{fmtTime(conv.latestAt || conv.createdAt)}</span>
                </div>
                <div className="conv-preview">
                  {/* SECONDARY LINE — muted, smaller */}
                  <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                    {secondary}
                  </span>
                </div>
              </div>
              {conv.unreadCount > 0 && <span className="conv-unread-dot" />}
            </div>
          );
        })}
      </div>
    </aside>
  );
}