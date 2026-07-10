import { useState, useEffect, useRef, useCallback } from 'react';
import MessageTabBar from '../components/MessageTabBar';
import InboxSidebar  from '../components/InboxSidebar';
import ChatWindow    from '../components/ChatWindow';
import ComposeModal  from '../components/ComposeModal';
import GroupManager  from '../components/GroupManager';
import { useMessaging } from '../context/MessagingContext';
import { useThreads }   from '../hooks/useThreads';
import { useSocket }    from '../context/SocketContext';
import { ModuleScreen, Layout, Main } from '../styles/MessagingPage.styles';
import { ToastContainer, ToastItem } from '../styles/shared.styles';

export default function MessagingPage({ currentUser }) {
  const {
    currentUserId, isSuperAdmin,
    toast, toasts,
    groups, groupsLoading, createGroup,
    disableGroup, enableGroup, deleteGroup, hideGroup,
    conversations, groupConversations, groupConvsLoading,
    inboxLoading, inboxError, fetchInbox, clearUnreadDot,
    unreadCount, inboxUnreadCount, groupUnreadCount, decrement,
    setActiveConversationId, activeConvIdRef,
    pendingOpenConv, setPendingOpenConv,
    pendingOpenGroup, setPendingOpenGroup,
    pendingManageGroup, setPendingManageGroup,
    pendingManageThread, setPendingManageThread,
  } = useMessaging();

  const { socket } = useSocket();

  const [activeConv,       setActiveConv]       = useState(null);
  const [tab,              setTab]              = useState('inbox');
  const [composeOpen,      setComposeOpen]      = useState(false);
  const [composeInitialRecipients, setComposeInitialRecipients] = useState([]);
  const [composeInitialMode,       setComposeInitialMode]       = useState('bcc');
  const [activeConvSource, setActiveConvSource] = useState(null);
  const [autoManageGroupId,  setAutoManageGroupId]  = useState(null);
  const [autoManageThreadId, setAutoManageThreadId] = useState(null);

  const layoutRef = useRef(null);

  // ── Handle cross-module open-conversation requests (from ChatButton) ────────
  useEffect(() => {
    if (!pendingOpenConv) return;
    const { conversationId, subject, convType } = pendingOpenConv;
    const conv = { conversationId, subject: subject || '', convType: convType || 'cc' };
    // All PM-linked threads (task+activity) are 'cc', so they live in inbox
    setTab('inbox');
    setActiveConvSource('inbox');
    setActiveConv(conv);
    setActiveConversationId(conversationId);
    clearUnreadDot(conversationId);
    setPendingOpenConv(null);
  }, [pendingOpenConv, setPendingOpenConv, setActiveConversationId, clearUnreadDot]);

  // ── Handle cross-module open-group requests (from ChatButton for activities) ─
  useEffect(() => {
    if (!pendingOpenGroup) return;
    const { conversationId, subject } = pendingOpenGroup;
    const conv = { conversationId, subject: subject || '', convType: 'group_thread' };
    setTab('groups');
    setActiveConvSource('groups');
    setActiveConv(conv);
    setActiveConversationId(conversationId);
    clearUnreadDot(conversationId);
    setPendingOpenGroup(null);
  }, [pendingOpenGroup, setPendingOpenGroup, setActiveConversationId, clearUnreadDot]);

  // ── Handle cross-module MANAGE requests (from ChatButton, admin only) ──────
  // No activeConv is set here — admins get zero content access anywhere in
  // this module (showThread is unconditionally false for isSuperAdmin), so
  // setting one would just render blank. Route into the groups/threads list
  // view instead and hand GroupManager the id to auto-open into management.
  useEffect(() => {
    if (!pendingManageGroup) return;
    setTab('groups');
    setActiveConvSource('groups');
    setAutoManageGroupId(pendingManageGroup.groupId || pendingManageGroup.conversationId);
    setPendingManageGroup(null);
  }, [pendingManageGroup, setPendingManageGroup]);

  useEffect(() => {
    if (!pendingManageThread) return;
    setTab('threads');
    setActiveConvSource('threads');
    setAutoManageThreadId(pendingManageThread.conversationId);
    setPendingManageThread(null);
  }, [pendingManageThread, setPendingManageThread]);

  const {
    threads: adminThreads, loading: adminThreadsLoading,
    disableThread, enableThread, deleteThread, hideThread,
  } = useThreads(isSuperAdmin);

  useEffect(() => {
    if (isSuperAdmin && tab === 'inbox') setTab('threads');
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

      // Find the conversation to get group name
      const allConvs = [...conversations, ...groupConversations];
      const existing = allConvs.find(c =>
        String(c.conversationId) === String(payload.conversationId)
      );
      const isGroupConv = payload.convType === 'group_thread' ||
        !!payload.groupId || !!existing?.groupName;

      // For group messages show group name; for inbox show sender name
      let toastMsg;
      if (isGroupConv) {
        const groupName = existing?.groupName || payload.groupName || 'Group';
        toastMsg = `New message in ${groupName}`;
      } else {
        toastMsg = payload.senderName ? `New message from ${payload.senderName}` : 'New message';
      }

      toast(toastMsg, 'info', () => {
        const conv = {
          conversationId: payload.conversationId,
          subject: payload.subject,
          groupName: existing?.groupName || payload.groupName,
        };
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
      });
    };
    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, currentUserId, isSuperAdmin, toast, activeConvIdRef,
      conversations, groupConversations,
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

  const handleOpenGroupConversation = useCallback((conv) => {
    setTab('groups');
    setActiveConvSource('groups');
    setActiveConv(conv);
    setActiveConversationId(conv.conversationId);
    clearUnreadDot(conv.conversationId);
    if (conv.unreadCount > 0) decrement(conv.conversationId);
  }, [setActiveConversationId, decrement, clearUnreadDot]);

  const handleBack = () => {
    setActiveConv(null);
    setActiveConvSource(null);
    setActiveConversationId(null);
    if (activeConvSource === 'groups') setTab('groups');
  };

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

  const handleSent = () => toast('Message sent.', 'success');

  // ── Group actions ──────────────────────────────────────────────────────────
  const handleDisableGroup = useCallback(async (groupId) => { await disableGroup(groupId); }, [disableGroup]);
  const handleEnableGroup  = useCallback(async (groupId) => { await enableGroup(groupId); },  [enableGroup]);
  const handleDeleteGroup  = useCallback(async (groupId) => { await deleteGroup(groupId); fetchInbox(); }, [deleteGroup, fetchInbox]);
  const handleHideGroup    = useCallback(async (groupId) => { await hideGroup(groupId);   fetchInbox(); }, [hideGroup,   fetchInbox]);

  // ── Thread governance ──────────────────────────────────────────────────────
  const handleDisableThread = useCallback(async (id) => { await disableThread(id); },               [disableThread]);
  const handleEnableThread  = useCallback(async (id) => { await enableThread(id); },                [enableThread]);
  const handleDeleteThread  = useCallback(async (id) => { await deleteThread(id); fetchInbox(); }, [deleteThread, fetchInbox]);
  const handleHideThread    = useCallback(async (id) => { await hideThread(id);   fetchInbox(); }, [hideThread,   fetchInbox]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isMailTab  = tab === 'inbox' || tab === 'threads';
  const showList   = isMailTab && !activeConv && !isSuperAdmin;
  const showThread = (isMailTab || tab === 'groups') && !!activeConv && !isSuperAdmin;
  const showGroups = (tab === 'groups' || (isSuperAdmin && tab === 'threads')) && !activeConv;

  return (
    <ModuleScreen>
      <MessageTabBar tab={tab} onTabChange={handleTabChange} isSuperAdmin={isSuperAdmin} />

      <Layout ref={layoutRef} stacked>
        {showList && (
          <InboxSidebar
            hideTabs
            conversations={conversations}
            loading={inboxLoading}
            error={inboxError}
            activeId={activeConv?.conversationId}
            onSelect={handleSelectConv}
            onCompose={handleOpenCompose}
            tab={tab}
            onTabChange={handleTabChange}
          />
        )}

        {showThread && (
          <Main full data-msg-main>
            <ChatWindow
              conversation={activeConv}
              onBack={handleBack}
              onDisableGroup={handleDisableGroup}
              onEnableGroup={handleEnableGroup}
              onDeleteGroup={handleDeleteGroup}
              onHideGroup={handleHideGroup}
            />
          </Main>
        )}

        {showGroups && (
            <GroupManager
              groups={groups}
              loading={groupsLoading}
              groupConversations={groupConversations}
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
              autoManageGroupId={autoManageGroupId}
              onAutoManageGroupHandled={() => setAutoManageGroupId(null)}
              autoManageThreadId={autoManageThreadId}
              onAutoManageThreadHandled={() => setAutoManageThreadId(null)}
            />
        )}
      </Layout>

      {composeOpen && (
        <ComposeModal
          onClose={handleCloseCompose}
          onSent={handleSent}
          initialRecipients={composeInitialRecipients}
          initialMode={composeInitialMode}
        />
      )}

      {toasts.length > 0 && (
        <ToastContainer>
          {toasts.map(t => (
            <ToastItem key={t.id} kind={t.type} clickable={!!t.onClick} onClick={t.onClick}>
              {t.msg}
            </ToastItem>
          ))}
        </ToastContainer>
      )}
    </ModuleScreen>
  );
}