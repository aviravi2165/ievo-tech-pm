import { useState, useEffect, useRef } from 'react';
import MessageTabBar from '../components/MessageTabBar';
import InboxSidebar from '../components/InboxSidebar';
import ChatWindow from '../components/ChatWindow';
import ComposeModal from '../components/ComposeModal';
import GroupManager from '../components/GroupManager';
import { useInbox } from '../hooks/useInbox';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { useGroups } from '../hooks/useGroups';
import { messageApi } from '../api/messageApi';

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
  const { conversations, loading, error: inboxError, refetch, archiveConversation } = useInbox();
  const { count: unreadCount, decrement } = useUnreadCount();
  const { groups, loading: groupsLoading, createGroup, deleteGroup } = useGroups();

  const [activeConv, setActiveConv] = useState(null);
  const [tab, setTab] = useState('inbox');
  const [sentConvs, setSentConvs] = useState([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(true);
  const layoutRef = useRef(null);

  const { toasts, toast } = useToast();

  useEffect(() => {
    const el = layoutRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < 640);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (tab !== 'sent') return;
    setSentLoading(true);
    setSentError(null);
    messageApi.getSent()
      .then(data => setSentConvs(data.conversations || data || []))
      .catch((err) => setSentError(err.message || 'Failed to load sent mail'))
      .finally(() => setSentLoading(false));
  }, [tab]);

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setActiveConv(null);
  };

  const isMailTab = tab === 'inbox' || tab === 'sent';
  const displayedConvs = tab === 'sent' ? sentConvs : conversations;
  const displayedLoading = tab === 'sent' ? sentLoading : loading;
  const listError = tab === 'sent' ? sentError : inboxError;

  const handleSelectConv = (conv) => {
    setActiveConv(conv);
    if (conv.unreadCount > 0) decrement(conv.unreadCount);
  };

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

  const handleSent = () => {
    refetch();
    toast('Message sent.', 'success');
  };

  const showList = isMailTab && !activeConv;
  const showThread = isMailTab && !!activeConv;
  const showGroups = tab === 'groups';
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

        {showGroups && (
          <main className="msg-main msg-main--full">
            <GroupManager
              groups={groups}
              loading={groupsLoading}
              onCreate={createGroup}
              onDelete={deleteGroup}
            />
          </main>
        )}

        {showEmptyHint && (
          <main className="msg-main">
            <div className="msg-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
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

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={handleSent}
          groups={groups}
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
