import { useState, useMemo } from 'react';
import { useMessaging } from '../context/MessagingContext';
import { Sidebar, SidebarHeader } from '../styles/MessagingPage.styles';
import { ComposeBtn, SearchWrap, SearchInput, SidebarNav, StickyTop } from '../styles/InboxSidebar.styles';
import { NavBtn, Badge, LoaderWrap, Spinner } from '../styles/shared.styles';
import {
  ConvListWrap, ListError, ListErrorHint, ListEmptyMsg, GroupCard, GroupIcon,
  GroupInfo, GroupName, GroupCount, RowRight, RowTime, UnreadDot,
} from '../styles/ConversationList.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect, FilterToggle } from '../../shared/components/TableControls';

function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d        = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
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
  const [showControls, setShowControls] = useState(false);

  const searched = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c =>
      c.subject?.toLowerCase().includes(q) ||
      c.participantNames?.toLowerCase().includes(q) ||
      c.groupName?.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  // Sort/filter on top of the search results — same collapsed-behind-a-
  // toggle pattern used everywhere else (see PhasePanel.js's FilterToggle),
  // so it doesn't add a permanent row of controls above every conversation
  // list. Default sort is newest-first, matching what the backend already
  // returns, made an explicit toggleable choice instead of an implicit
  // assumption about server ordering (same reasoning as AuditLog.js).
  const {
    items: filtered, sortDir, toggleSortDir, filters, setFilter,
  } = useSortFilter(searched, {
    sorters: { recent: (a, b) => new Date(a.latestAt || a.createdAt || 0).getTime() - new Date(b.latestAt || b.createdAt || 0).getTime() },
    filters: { unreadOnly: { predicate: (c) => c.unreadCount > 0 } },
    defaultSortKey: 'recent',
    defaultSortDir: 'desc',
  });

  return (
    <Sidebar as="aside" data-msg-sidebar>
      {/* Header — matches groups tab style */}
      <SidebarHeader>
        <h2>I.EVO</h2>
        <p>Messages · Design | Demonstrate | Deliver</p>
      </SidebarHeader>

      {/* Compose/search/nav — a non-scrolling header sibling ABOVE
          ConvListWrap, not living inside its scroll flow (see StickyTop's
          comment in InboxSidebar.styles.js — a sticky-inside-scroll
          approach here previously let conversation cards scroll up OVER
          this header instead of staying beneath it). */}
      <StickyTop>
        <ComposeBtn onClick={onCompose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Message
        </ComposeBtn>

        <SearchWrap>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <SearchInput
                type="text"
                placeholder="Search conversations…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {conversations.length > 0 && (
              <FilterToggle open={showControls} onClick={() => setShowControls(v => !v)}
                active={!!filters.unreadOnly} title="Sort & filter" />
            )}
          </div>
          {showControls && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <SortSelect value="recent" onChange={() => {}} dir={sortDir} onToggleDir={toggleSortDir}
                options={[{ value: 'recent', label: sortDir === 'desc' ? 'Newest first' : 'Oldest first' }]} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!filters.unreadOnly} onChange={e => setFilter('unreadOnly', e.target.checked || null)} />
                Unread only
              </label>
            </div>
          )}
        </SearchWrap>

        {!hideTabs && (
          <SidebarNav>
            <NavBtn type="button" active={tab === 'inbox'} onClick={() => onTabChange('inbox')}>
              Inbox
              {unreadCount > 0 && <Badge>{unreadCount > 99 ? '99+' : unreadCount}</Badge>}
            </NavBtn>
            <NavBtn type="button" active={tab === 'groups'} onClick={() => onTabChange('groups')}>
              Groups
            </NavBtn>
          </SidebarNav>
        )}
      </StickyTop>

      <ConvListWrap>
        <div style={{ padding: '8px 12px' }}>
          {loading && <LoaderWrap><Spinner /></LoaderWrap>}

          {!loading && error && (
            <ListError>
              <p>{error}</p>
              <ListErrorHint>Check that you are logged in and the API is running.</ListErrorHint>
            </ListError>
          )}

          {!loading && !error && filtered.length === 0 && (
            <ListEmptyMsg>
              {search ? 'No results found.' : filters.unreadOnly ? 'No unread conversations.' : 'No conversations yet.'}
            </ListEmptyMsg>
          )}

          {!loading && !error && filtered.map(conv => {
            const { primary, secondary } = convDisplayLines(conv);
            const isUnread = conv.unreadCount > 0;
            const timeStr  = fmtTime(conv.latestAt || conv.createdAt);
            return (
              <GroupCard
                key={conv.conversationId}
                clickable
                unread={isUnread}
                flash={!!conv._flash}
                style={{ margin: '0 0 8px' }}
                onClick={() => onSelect(conv)}
              >
                <GroupIcon>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </GroupIcon>

                <GroupInfo>
                  <GroupName bold={isUnread} title={primary}>{primary}</GroupName>
                  <GroupCount title={secondary}>{secondary}</GroupCount>
                </GroupInfo>

                <RowRight>
                  {timeStr && <RowTime unread={isUnread}>{timeStr}</RowTime>}
                  {isUnread && <UnreadDot />}
                </RowRight>
              </GroupCard>
            );
          })}
        </div>
      </ConvListWrap>
    </Sidebar>
  );
}
