import { useState, useEffect, useRef, useCallback } from 'react';
import MessageTabBar from '../components/MessageTabBar';
import InboxSidebar  from '../components/InboxSidebar';
import ChatWindow    from '../components/ChatWindow';
import ComposeModal  from '../components/ComposeModal';
import GroupManager  from '../components/GroupManager';
import { useMessaging } from '../context/MessagingContext';
import { useThreads }   from '../hooks/useThreads';
import { useSocket }    from '../context/SocketContext';

export default function MessagingPage({ currentUser }) {
  const {
    // Identity
    currentUserId, isSuperAdmin,
    // Toast
    toast, toasts,
    // Groups
    groups, groupsLoading, createGroup,
    disableGroup, enableGroup, deleteGroup, hideGroup,
    // Inbox
    conversations, inboxLoading, inboxError, fetchInbox, clearUnreadDot,
    // Sent
    sentConvs, sentLoading, sentError, fetchSent,
    // Badge
    unreadCount, decrement,
    // Active conv
    setActiveConversationId, activeConvIdRef,
  } = useMessaging();

  const { socket } = useSocket();

  const [activeConv,  setActiveConv]  = useState(null);
  const [tab,         setTab]         = useState('inbox');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitialRecipients, setComposeInitialRecipients] = useState([]);
  const [composeInitialMode,       setComposeInitialMode]       = useState('bcc');

  const layoutRef = useRef(null);

  // ── Super-admin thread governance ──────────────────────────────────────────
  const {
    threads: adminThreads, loading: adminThreadsLoading,
    disableThread, enableThread, deleteThread, hideThread,
  } = useThreads(isSuperAdmin);

  // Redirect super admins away from inbox on initial load
  useEffect(() => {
    if (isSuperAdmin && (tab === 'inbox' || tab === 'sent')) setTab('threads');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // Load sent tab on demand
  useEffect(() => {
    if (tab === 'sent') fetchSent();
  }, [tab, fetchSent]);

  // ── Cross-conversation new message toast ───────────────────────────────────
  // MessagingContext handles badge + inbox row updates.
  // This is ONLY for the corner toast so user can jump to the conversation.
  useEffect(() => {
    if (!socket || isSuperAdmin) return;
    const handler = (payload) => {
      const isMine = payload.senderUserId && currentUserId &&
        String(payload.senderUserId) === String(currentUserId);
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
  }, [socket, currentUserId, isSuperAdmin, toast, activeConvIdRef,
      setActiveConversationId, decrement, clearUnreadDot]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setActiveConv(null);
    setActiveConversationId(null);
  };

  const handleSelectConv = (conv) => {
    setActiveConv(conv);
    setActiveConversationId(conv.conversationId);
    decrement(conv.conversationId);
    clearUnreadDot(conv.conversationId);
  };

  const handleOpenGroupConversation = useCallback((conv) => {
    // Group conversation may not be in the inbox list yet if user
    // opens it from the Groups tab for the first time — fetch once.
    if (!conversations.find(c => String(c.conversationId) === String(conv.conversationId))) {
      fetchInbox();
    }
    setTab('inbox');
    setActiveConv(conv);
    setActiveConversationId(conv.conversationId);
    clearUnreadDot(conv.conversationId);
    if (conv.unreadCount > 0) decrement(conv.conversationId);
  }, [conversations, fetchInbox, setActiveConversationId, decrement, clearUnreadDot]);

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

  // After sending: context's NEW_MESSAGE handler updates inbox for brand-new
  // convs; fetchSent() still needed since sent tab has its own list.
  const handleSent = () => {
    fetchSent();
    toast('Message sent.', 'success');
  };

  // ── Group actions ──────────────────────────────────────────────────────────
  // disable/enable — don't change inbox/sent display, no fetch needed
  const handleDisableGroup = useCallback(async (groupId) => {
    await disableGroup(groupId);
  }, [disableGroup]);

  const handleEnableGroup = useCallback(async (groupId) => {
    await enableGroup(groupId);
  }, [enableGroup]);

  // delete/hide — conversations disappear from view, must refetch
  const handleDeleteGroup = useCallback(async (groupId) => {
    await deleteGroup(groupId);
    fetchInbox(); fetchSent();
  }, [deleteGroup, fetchInbox, fetchSent]);

  const handleHideGroup = useCallback(async (groupId) => {
    await hideGroup(groupId);
    fetchInbox(); fetchSent();
  }, [hideGroup, fetchInbox, fetchSent]);

  // ── Thread governance (super admin) ───────────────────────────────────────
  // disable/enable — don't remove conversations from inbox/sent
  const handleDisableThread = useCallback(async (id) => {
    await disableThread(id);
  }, [disableThread]);

  const handleEnableThread = useCallback(async (id) => {
    await enableThread(id);
  }, [enableThread]);

  // delete/hide — remove from view, must refetch
  const handleDeleteThread = useCallback(async (id) => {
    await deleteThread(id);
    fetchInbox(); fetchSent();
  }, [deleteThread, fetchInbox, fetchSent]);

  const handleHideThread = useCallback(async (id) => {
    await hideThread(id);
    fetchInbox(); fetchSent();
  }, [hideThread, fetchInbox, fetchSent]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isMailTab        = tab === 'inbox' || tab === 'sent' || tab === 'threads';
  const displayedConvs   = tab === 'sent' ? sentConvs   : conversations;
  const displayedLoading = tab === 'sent' ? sentLoading  : inboxLoading;
  const listError        = tab === 'sent' ? sentError    : inboxError;
  const showList         = isMailTab && !activeConv && !isSuperAdmin;
  const showThread       = isMailTab && !!activeConv  && !isSuperAdmin;
  const showGroups       = tab === 'groups' || (isSuperAdmin && tab === 'threads');

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
              onBack={() => {
                setActiveConv(null);
                setActiveConversationId(null);
              }}
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
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={handleCloseCompose}
          onSent={handleSent}
          initialRecipients={composeInitialRecipients}
          initialMode={composeInitialMode}
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