import { useState, useEffect, useRef, useCallback } from 'react';
import MessageTabBar from '../components/MessageTabBar';
import InboxSidebar  from '../components/InboxSidebar';
import ChatWindow    from '../components/ChatWindow';
import ComposeModal  from '../components/ComposeModal';
import GroupManager  from '../components/GroupManager';
import { useMessaging }  from '../context/MessagingContext';
import { useGroups }     from '../hooks/useGroups';
import { useThreads }    from '../hooks/useThreads';
import { useSocket }     from '../context/SocketContext';
import { useAuth }       from '../../auth/AuthContext';
import { messageApi }    from '../api/messageApi';

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (msg, type = 'info', onClick) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type, onClick }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };
  return { toasts, toast: add };
}

export default function MessagingPage({ currentUser }) {
  // ── Context (replaces useInbox + useUnreadCount prop drilling) ─────────────
  const {
    unreadCount,
    decrement,
    conversations,
    inboxLoading,
    inboxError,
    fetchInbox,
    clearUnreadDot,
    archiveConversation,
    activeConversationId,
    setActiveConversationId,
    activeConvIdRef,
  } = useMessaging();

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [activeConv,   setActiveConv]   = useState(null);
  const [tab,          setTab]          = useState('inbox');
  const [sentConvs,    setSentConvs]    = useState([]);
  const [sentLoading,  setSentLoading]  = useState(false);
  const [sentError,    setSentError]    = useState(null);
  const [composeOpen,  setComposeOpen]  = useState(false);
  const [composeInitialRecipients, setComposeInitialRecipients] = useState([]);
  const [composeInitialMode,       setComposeInitialMode]       = useState('bcc');

  const isNarrow  = true;
  const layoutRef = useRef(null);
  const { toasts, toast } = useToast();
  const { socket } = useSocket();
  const { user }   = useAuth();

  const isSuperAdmin = Boolean(
    user?.isSuperAdmin || user?.is_super_admin || user?.isAdmin || user?.is_admin ||
    user?.user_type === 'admin' || user?.userType === 'admin' || user?.role === 'super_admin'
  );

  // ── Groups ─────────────────────────────────────────────────────────────────
  const {
    groups, loading: groupsLoading,
    createGroup, disableGroup, enableGroup, deleteGroup, hideGroup,
    refetch: refetchGroups,
  } = useGroups();

  useEffect(() => {
    const handler = () => refetchGroups();
    window.addEventListener('groups-updated', handler);
    return () => window.removeEventListener('groups-updated', handler);
  }, [refetchGroups]);

  // ── Super-admin thread governance ──────────────────────────────────────────
  const {
    threads: adminThreads, loading: adminThreadsLoading,
    disableThread, enableThread, deleteThread, hideThread,
    refetch: refetchAdminThreads,
  } = useThreads(isSuperAdmin);

  // ── Sent tab ───────────────────────────────────────────────────────────────
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

  // Redirect super admins away from inbox on initial load
  useEffect(() => {
    if (isSuperAdmin && (tab === 'inbox' || tab === 'sent')) setTab('threads');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // ── Socket: refresh sent when current user sends ───────────────────────────
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

  // ── Socket: cross-conversation toast ──────────────────────────────────────
  // MessagingContext already handles badge and inbox list updates.
  // This listener is only responsible for the cross-conversation corner toast
  // so the user can jump directly to a conversation that arrived while they
  // were reading a different one.
  useEffect(() => {
    if (!socket || isSuperAdmin) return;
    const handler = (payload) => {
      const isMine = payload.senderUserId && user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) return;

      const isOpen = activeConvIdRef.current != null &&
        String(activeConvIdRef.current) === String(payload.conversationId);
      if (isOpen) return;

      toast(
        payload.senderName ? `New message from ${payload.senderName}` : 'New message',
        'info',
        () => {
          setTab('inbox');
          const conv = { conversationId: payload.conversationId, subject: payload.subject };
          setActiveConv(conv);
          setActiveConversationId(payload.conversationId);
          decrement(payload.conversationId);
          clearUnreadDot(payload.conversationId);
        }
      );
    };
    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId, isSuperAdmin, toast, activeConvIdRef,
      setActiveConversationId, decrement, clearUnreadDot]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setActiveConv(null);
    setActiveConversationId(null);
  };

  // ── Select conversation ────────────────────────────────────────────────────
  const handleSelectConv = (conv) => {
    setActiveConv(conv);
    setActiveConversationId(conv.conversationId);
    decrement(conv.conversationId);
    clearUnreadDot(conv.conversationId);
  };

  // ── Open group conversation ────────────────────────────────────────────────
  const handleOpenGroupConversation = useCallback((conv) => {
    fetchInbox();
    setTab('inbox');
    setActiveConv(conv);
    setActiveConversationId(conv.conversationId);
    clearUnreadDot(conv.conversationId);
    if (conv.unreadCount > 0) decrement(conv.conversationId);
  }, [fetchInbox, setActiveConversationId, decrement, clearUnreadDot]);

  // ── Compose ────────────────────────────────────────────────────────────────
  const handleComposeToGroup = useCallback((group) => {
    setComposeInitialRecipients([{
      id: `g-${group.groupId}`, _groupId: group.groupId,
      label: group.groupName, type: 'group',
    }]);
    setComposeInitialMode('group_thread');
    setComposeOpen(true);
  }, []);

  const handleOpenCompose = useCallback(() => {
    setComposeInitialRecipients([]);
    setComposeInitialMode('bcc');
    setComposeOpen(true);
  }, []);

  const handleCloseCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeInitialRecipients([]);
    setComposeInitialMode('bcc');
  }, []);

  const handleSent = () => {
    fetchInbox();
    fetchSent();
    toast('Message sent.', 'success');
  };

  // ── Group actions ──────────────────────────────────────────────────────────
  const handleDisableGroup = useCallback(async (groupId) => {
    await disableGroup(groupId); fetchInbox(); fetchSent();
  }, [disableGroup, fetchInbox, fetchSent]);

  const handleEnableGroup = useCallback(async (groupId) => {
    await enableGroup(groupId); fetchInbox(); fetchSent();
  }, [enableGroup, fetchInbox, fetchSent]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    await deleteGroup(groupId); fetchInbox(); fetchSent();
  }, [deleteGroup, fetchInbox, fetchSent]);

  const handleHideGroup = useCallback(async (groupId) => {
    await hideGroup(groupId); fetchInbox(); fetchSent();
  }, [hideGroup, fetchInbox, fetchSent]);

  // ── Thread governance (super admin) ───────────────────────────────────────
  const handleDisableThread = useCallback(async (id) => {
    await disableThread(id); fetchInbox(); fetchSent();
  }, [disableThread, fetchInbox, fetchSent]);

  const handleEnableThread = useCallback(async (id) => {
    await enableThread(id); fetchInbox(); fetchSent();
  }, [enableThread, fetchInbox, fetchSent]);

  const handleDeleteThread = useCallback(async (id) => {
    await deleteThread(id); fetchInbox(); fetchSent();
  }, [deleteThread, fetchInbox, fetchSent]);

  const handleHideThread = useCallback(async (id) => {
    await hideThread(id); fetchInbox(); fetchSent();
  }, [hideThread, fetchInbox, fetchSent]);

  // ── Archive ────────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    if (!activeConv) return;
    try {
      await archiveConversation(activeConv.conversationId);
      setActiveConv(null);
      setActiveConversationId(null);
      toast('Conversation archived.', 'success');
    } catch {
      toast('Failed to archive.', 'error');
    }
  };

  // ── Derived display state ──────────────────────────────────────────────────
  const isMailTab        = tab === 'inbox' || tab === 'sent' || tab === 'threads';
  const displayedConvs   = tab === 'sent' ? sentConvs   : conversations;
  const displayedLoading = tab === 'sent' ? sentLoading  : inboxLoading;
  const listError        = tab === 'sent' ? sentError    : inboxError;

  const showList     = isMailTab && !activeConv && !isSuperAdmin;
  const showThread   = isMailTab && !!activeConv && !isSuperAdmin;
  const showGroups   = tab === 'groups' || (isSuperAdmin && tab === 'threads');
  const showEmptyHint = false;

  return (
    <div className="msg-module-screen">
      <MessageTabBar
        tab={tab}
        onTabChange={handleTabChange}
        isSuperAdmin={isSuperAdmin}
      />

      <div ref={layoutRef} className="msg-layout msg-layout--stacked">
        {showList && (
          <InboxSidebar
            hideTabs
            conversations={displayedConvs}
            loading={displayedLoading}
            error={listError}
            activeId={activeConv?.conversationId}
            onSelect={handleSelectConv}
            onCompose={handleOpenCompose}
            tab={tab}
            onTabChange={handleTabChange}
          />
        )}

        {showThread && (
          <main className="msg-main msg-main--full">
            <ChatWindow
              conversation={activeConv}
              currentUserId={currentUser?.userId}
              onBack={() => {
                setActiveConv(null);
                setActiveConversationId(null);
              }}
              onArchive={handleArchive}
              toast={toast}
              groups={groups}
            />
          </main>
        )}

        {showGroups && (
          <main className="msg-main msg-main--full">
            <GroupManager
              groups={groups}
              loading={groupsLoading}
              threads={isSuperAdmin ? adminThreads : undefined}
              threadsLoading={adminThreadsLoading}
              currentTab={tab}
              onCreate={createGroup}
              onDisable={handleDisableGroup}
              onEnable={handleEnableGroup}
              onDelete={handleDeleteGroup}
              onHide={handleHideGroup}
              onDisableThread={handleDisableThread}
              onEnableThread={handleEnableThread}
              onDeleteThread={handleDeleteThread}
              onHideThread={handleHideThread}
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
              <button type="button" className="msg-compose-btn"
                style={{ marginTop: 8 }} onClick={handleOpenCompose}>
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
            <div
              key={t.id}
              className={`toast ${t.type}${t.onClick ? ' toast-clickable' : ''}`}
              onClick={t.onClick}
            >
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}