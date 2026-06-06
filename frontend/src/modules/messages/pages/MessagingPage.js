/**
 * MessagingPage.js
 *
 * FIX: Wires the new onOpenConversation prop for GroupManager.
 * When a user clicks the "Open group chat" button on a group card,
 * GroupManager calls onOpenConversation(conv).  This handler:
 *   1. Switches the active tab to 'inbox'.
 *   2. Sets the conversation as the active (selected) thread.
 *   3. Decrements the unread badge if the conversation has unread messages.
 *
 * This means the user lands directly in the chat thread for that group
 * without having to hunt through the inbox list.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import MessageTabBar   from '../components/MessageTabBar';
import InboxSidebar    from '../components/InboxSidebar';
import ChatWindow      from '../components/ChatWindow';
import ComposeModal    from '../components/ComposeModal';
import GroupManager    from '../components/GroupManager';
import { useInbox }       from '../hooks/useInbox';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { useGroups }      from '../hooks/useGroups';
import { useSocket }      from '../context/SocketContext';
import { useAuth }        from '../../auth/AuthContext';
import { messageApi }     from '../api/messageApi';

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (msg, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };
  return { toasts, toast: add };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MessagingPage({ currentUser }) {
  const { conversations, loading, error: inboxError, refetch, archiveConversation } = useInbox();
  const { count: unreadCount, decrement } = useUnreadCount();
  const { groups, loading: groupsLoading, createGroup, deleteGroup } = useGroups();
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [activeConv,   setActiveConv]   = useState(null);
  const [tab,          setTab]          = useState('inbox');
  const [sentConvs,    setSentConvs]    = useState([]);
  const [sentLoading,  setSentLoading]  = useState(false);
  const [sentError,    setSentError]    = useState(null);
  const [composeOpen,  setComposeOpen]  = useState(false);
  const [isNarrow,     setIsNarrow]     = useState(true);
  const layoutRef = useRef(null);
  const { toasts, toast } = useToast();

  // ── Responsive layout ────────────────────────────────────────────────────
  useEffect(() => {
    const el = layoutRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < 640);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Load sent tab ─────────────────────────────────────────────────────────
  const fetchSent = useCallback(() => {
    setSentLoading(true);
    setSentError(null);
    messageApi
      .getSent()
      .then((data) => setSentConvs(data.conversations || data || []))
      .catch((err)  => setSentError(err.message || 'Failed to load sent mail'))
      .finally(()   => setSentLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'sent') fetchSent();
  }, [tab, fetchSent]);

  // ── Socket: keep sent list fresh when current user sends ─────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (payload) => {
      const isMine =
        payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) fetchSent();
    };
    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId, fetchSent]);

  // ── Tab change ────────────────────────────────────────────────────────────
  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setActiveConv(null);
  };

  // ── Derived display state ─────────────────────────────────────────────────
  const isMailTab        = tab === 'inbox' || tab === 'sent';
  const displayedConvs   = tab === 'sent' ? sentConvs   : conversations;
  const displayedLoading = tab === 'sent' ? sentLoading  : loading;
  const listError        = tab === 'sent' ? sentError    : inboxError;

  // ── Select conversation ───────────────────────────────────────────────────
  const handleSelectConv = (conv) => {
    setActiveConv(conv);
    if (conv.unreadCount > 0) decrement(conv.unreadCount);
  };

  // ── FIX: Open group thread from GroupManager ──────────────────────────────
  // GroupManager calls this when the user clicks the chat-bubble icon on a
  // group card.  We switch to inbox and highlight the conversation.
  const handleOpenConversation = useCallback((conv) => {
    // Ensure inbox is loaded and switch to it
    setTab('inbox');
    setActiveConv(conv);
    if (conv.unreadCount > 0) decrement(conv.unreadCount);
    // Refresh inbox so the conversation appears in the list if not already there
    refetch();
  }, [decrement, refetch]);

  // ── Archive ───────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    if (!activeConv) return;
    try {
      await archiveConversation(activeConv.conversationId);
      setActiveConv(null);
      toast('Conversation archived.', 'success');
    } catch {
      toast('Failed to archive.', 'error');
    }
  };

  // ── After sending a new message ───────────────────────────────────────────
  const handleSent = () => {
    refetch();
    if (tab === 'sent') fetchSent();
    toast('Message sent.', 'success');
  };

  // ── Layout flags ──────────────────────────────────────────────────────────
  const showList      = isMailTab && (!activeConv || !isNarrow);
  const showThread    = isMailTab && !!activeConv;
  const showGroups    = tab === 'groups';
  const showEmptyHint = !isNarrow && isMailTab && !activeConv;

  return (
    <div className="msg-module-screen">
      <MessageTabBar
        tab={tab}
        onTabChange={handleTabChange}
        unreadCount={unreadCount}
      />

      <div
        ref={layoutRef}
        className={`msg-layout ${isNarrow ? 'msg-layout--stacked' : 'msg-layout--split'}`}
      >
        {/* Conversation list — inbox or sent */}
        {showList && (
          <InboxSidebar
            hideTabs
            conversations={displayedConvs}
            loading={displayedLoading}
            error={listError}
            activeId={activeConv?.conversationId}
            onSelect={handleSelectConv}
            onCompose={() => setComposeOpen(true)}
            unreadCount={unreadCount}
            tab={tab}
            onTabChange={handleTabChange}
          />
        )}

        {/* Active thread */}
        {showThread && (
          <main className="msg-main msg-main--full">
            <ChatWindow
              conversation={activeConv}
              currentUserId={currentUser?.userId}
              onArchive={handleArchive}
              onBack={() => setActiveConv(null)}
            />
          </main>
        )}

        {/* Groups panel */}
        {showGroups && (
          <main className="msg-main msg-main--full">
            <GroupManager
              groups={groups}
              loading={groupsLoading}
              onCreate={createGroup}
              onDelete={deleteGroup}
              onOpenConversation={handleOpenConversation}  
            />
          </main>
        )}

        {/* Empty state */}
        {showEmptyHint && (
          <main className="msg-main">
            <div className="msg-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <h3>Select a conversation</h3>
              <p>Choose from the list or compose a new message.</p>
              <button
                type="button"
                className="msg-compose-btn"
                style={{ marginTop: 8 }}
                onClick={() => setComposeOpen(true)}
              >
                New Message
              </button>
            </div>
          </main>
        )}
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={handleSent}
          groups={groups}
        />
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}