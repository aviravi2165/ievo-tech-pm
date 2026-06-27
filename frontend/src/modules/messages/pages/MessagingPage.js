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

  // Track whether the active conv was opened from the groups tab
  const [activeConvSource, setActiveConvSource] = useState(null); // 'inbox' | 'groups'

  const layoutRef = useRef(null);

  // ── Super-admin thread governance ──────────────────────────────────────────
  const {
    threads: adminThreads, loading: adminThreadsLoading,
    disableThread, enableThread, deleteThread, hideThread,
  } = useThreads(isSuperAdmin);

  // Redirect super admins away from inbox on initial load
  useEffect(() => {
    if (isSuperAdmin && (tab === 'inbox')) setTab('threads');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  // ── Cross-conversation new message toast ───────────────────────────────────
  useEffect(() => {
    if (!socket || isSuperAdmin) return;
    const handler = (payload) => {
      const isMine = payload.senderUserId && currentUserId &&
        String(payload.senderUserId) === String(currentUserId);
      if (isMine) return;

      const isOpen = activeConvIdRef.current != null &&
        String(activeConvIdRef.current) === String(payload.conversationId);
      if (isOpen) return;

      // Determine which tab this conv belongs to so toast navigates correctly
      const existingConv = conversations.find(c =>
        String(c.conversationId) === String(payload.conversationId)
      );
      const isGroupConv = existingConv?.convType === 'group_thread' || existingConv?.groupName;

      toast(
        payload.senderName ? `New message from ${payload.senderName}` : 'New message',
        'info',
        () => {
          const conv = { conversationId: payload.conversationId, subject: payload.subject };
          if (isGroupConv) {
            setTab('groups');
            setActiveConvSource('groups');
          } else {
            setTab('inbox');
            setActiveConvSource('inbox');
          }
          setActiveConv(conv);
          setActiveConversationId(payload.conversationId);
          decrement(payload.conversationId);
          clearUnreadDot(payload.conversationId);
        }
      );
    };
    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, currentUserId, isSuperAdmin, toast, activeConvIdRef, conversations,
      setActiveConversationId, decrement, clearUnreadDot]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setActiveConv(null);
    setActiveConvSource(null);
    setActiveConversationId(null);
  };

  const handleSelectConv = (conv) => {
    setActiveConv(conv);
    setActiveConvSource('inbox');
    setActiveConversationId(conv.conversationId);
    decrement(conv.conversationId);
    clearUnreadDot(conv.conversationId);
  };

  // Group conversation: always opens in groups tab, back returns to groups tab
  const handleOpenGroupConversation = useCallback((conv) => {
    setTab('groups');
    setActiveConvSource('groups');
    setActiveConv(conv);
    setActiveConversationId(conv.conversationId);
    clearUnreadDot(conv.conversationId);
    if (conv.unreadCount > 0) decrement(conv.conversationId);
  }, [setActiveConversationId, decrement, clearUnreadDot]);

  // ── Compose ────────────────────────────────────────────────────────────────
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
    toast('Message sent.', 'success');
  };

  // ── Group actions ──────────────────────────────────────────────────────────
  const handleDisableGroup = useCallback(async (groupId) => {
    await disableGroup(groupId);
  }, [disableGroup]);

  const handleEnableGroup = useCallback(async (groupId) => {
    await enableGroup(groupId);
  }, [enableGroup]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    await deleteGroup(groupId);
    fetchInbox();
  }, [deleteGroup, fetchInbox]);

  const handleHideGroup = useCallback(async (groupId) => {
    await hideGroup(groupId);
    fetchInbox();
  }, [hideGroup, fetchInbox]);

  // ── Thread governance (super admin) ───────────────────────────────────────
  const handleDisableThread = useCallback(async (id) => {
    await disableThread(id);
  }, [disableThread]);

  const handleEnableThread = useCallback(async (id) => {
    await enableThread(id);
  }, [enableThread]);

  const handleDeleteThread = useCallback(async (id) => {
    await deleteThread(id);
    fetchInbox();
  }, [deleteThread, fetchInbox]);

  const handleHideThread = useCallback(async (id) => {
    await hideThread(id);
    fetchInbox();
  }, [hideThread, fetchInbox]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isMailTab        = tab === 'inbox' || tab === 'threads';
  // Inbox only shows non-group conversations
  const displayedConvs   = conversations.filter(c => c.convType !== 'group_thread' && !c.groupName);
  const displayedLoading = inboxLoading;
  const listError        = inboxError;
  const showList         = isMailTab && !activeConv && !isSuperAdmin;
  const showThread       = (isMailTab || tab === 'groups') && !!activeConv && !isSuperAdmin;
  const showGroups       = (tab === 'groups' || (isSuperAdmin && tab === 'threads')) && !activeConv;

  const handleBack = () => {
    setActiveConv(null);
    setActiveConvSource(null);
    setActiveConversationId(null);
    // Return to the tab that spawned the conversation
    if (activeConvSource === 'groups') {
      setTab('groups');
    }
    // If opened from inbox, tab is already 'inbox' — nothing to change
  };

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
              onBack={handleBack}
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