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

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };
  return { toasts, toast: add };
}

export default function MessagingPage({ currentUser }) {
  const { conversations, loading, error: inboxError, refetch, archiveConversation, clearUnreadDot } = useInbox();
  const { count: unreadCount, decrement } = useUnreadCount();
  const { groups, loading: groupsLoading, createGroup, disableGroup, enableGroup, deleteGroup, hideGroup } = useGroups();
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [activeConv,  setActiveConv]  = useState(null);
  const [tab,         setTab]         = useState('inbox');
  const [sentConvs,   setSentConvs]   = useState([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError,   setSentError]   = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // FIX Bug 2: pre-filled recipients when opening compose from a group card
  const [composeInitialRecipients, setComposeInitialRecipients] = useState([]);

  // Always stacked: open conversation takes the full panel width with no
  // inbox list beside it, regardless of screen resolution. The list and
  // the thread are mutually exclusive — selecting a conversation hides
  // the list, and "back" returns to the list.
  const isNarrow = true;
  const layoutRef = useRef(null);
  const { toasts, toast } = useToast();

  // ── Load sent tab ─────────────────────────────────────────────────────────
  const fetchSent = useCallback(() => {
    setSentLoading(true);
    setSentError(null);
    messageApi.getSent()
      .then(data => setSentConvs(data.conversations || data || []))
      .catch(err  => setSentError(err.message || 'Failed to load sent mail'))
      .finally(() => setSentLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'sent') fetchSent();
  }, [tab, fetchSent]);

  // ── Socket: refresh sent when current user sends ──────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (payload) => {
      const isMine = payload.senderUserId && user?.userId &&
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
    if (conv.unreadCount > 0) {
      decrement(conv.conversationId);
      clearUnreadDot(conv.conversationId);
    }
  };

  // ── Open group conversation from Groups tab (existing thread found) ───────
  const handleOpenGroupConversation = useCallback((conv) => {
    refetch();
    setTab('inbox');
    setActiveConv(conv);
    if (conv.unreadCount > 0) decrement(conv.conversationId);
  }, [refetch, decrement]);

  // ── FIX Bug 2: group has no thread yet → open compose pre-filled ──────────
  const handleComposeToGroup = useCallback((group) => {
    // Build a recipient entry in the same shape RecipientPicker uses
    const groupRecipient = {
      id:    group.groupId,
      label: group.groupName,
      type:  'group',
    };
    setComposeInitialRecipients([groupRecipient]);
    setComposeOpen(true);
  }, []);

  // ── Open compose (blank) ──────────────────────────────────────────────────
  const handleOpenCompose = useCallback(() => {
    setComposeInitialRecipients([]);
    setComposeOpen(true);
  }, []);

  const handleCloseCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeInitialRecipients([]);
  }, []);

  // Disabling/enabling/hiding a group changes which conversations show up
  // in Inbox/Sent (frozen chats still show but read-only; hidden groups
  // disappear from the caller's own tabs), so refresh both after each.
  const handleDisableGroup = useCallback(async (groupId) => {
    await disableGroup(groupId);
    refetch();
    fetchSent();
  }, [disableGroup, refetch, fetchSent]);

  const handleEnableGroup = useCallback(async (groupId) => {
    await enableGroup(groupId);
    refetch();
    fetchSent();
  }, [enableGroup, refetch, fetchSent]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    await deleteGroup(groupId);
    refetch();
    fetchSent();
  }, [deleteGroup, refetch, fetchSent]);

  const handleHideGroup = useCallback(async (groupId) => {
    await hideGroup(groupId);
    refetch();
    fetchSent();
  }, [hideGroup, refetch, fetchSent]);

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

  // ── After sending ─────────────────────────────────────────────────────────
  const handleSent = () => {
    refetch();
    fetchSent();
    toast('Message sent.', 'success');
  };

  // ── Layout flags ──────────────────────────────────────────────────────────
  // Stacked layout only: show the list OR the open thread, never both —
  // an open thread always takes the full panel width.
  const showList      = isMailTab && !activeConv;
  const showThread     = isMailTab && !!activeConv;
  const showGroups     = tab === 'groups';
  // In stacked layout, the list already fills the panel when no conv is open,
  // so we never show the empty hint alongside it.
  const showEmptyHint  = false;

  return (
    <div className="msg-module-screen">
      <MessageTabBar
        tab={tab}
        onTabChange={handleTabChange}
        unreadCount={unreadCount}
      />

      <div
        ref={layoutRef}
        className="msg-layout msg-layout--stacked"
      >
        {showList && (
          <InboxSidebar
            hideTabs
            conversations={displayedConvs}
            loading={displayedLoading}
            error={listError}
            activeId={activeConv?.conversationId}
            onSelect={handleSelectConv}
            onCompose={handleOpenCompose}
            unreadCount={unreadCount}
            tab={tab}
            onTabChange={handleTabChange}
          />
        )}

        {showThread && (
          <main className="msg-main msg-main--full">
            <ChatWindow
              conversation={activeConv}
              currentUserId={currentUser?.userId}
              onArchive={handleArchive}
              onBack={() => setActiveConv(null)}
              toast={toast}
            />
          </main>
        )}

        {showGroups && (
          <main className="msg-main msg-main--full">
            <GroupManager
              groups={groups}
              loading={groupsLoading}
              onCreate={createGroup}
              onDisable={handleDisableGroup}
              onEnable={handleEnableGroup}
              onDelete={handleDeleteGroup}
              onHide={handleHideGroup}
              onOpenConversation={handleOpenGroupConversation}
              onComposeToGroup={handleComposeToGroup}
            />
          </main>
        )}

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
                onClick={handleOpenCompose}
              >
                New Message
              </button>
            </div>
          </main>
        )}
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={handleCloseCompose}
          onSent={handleSent}
          groups={groups}
          initialRecipients={composeInitialRecipients}
        />
      )}

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}