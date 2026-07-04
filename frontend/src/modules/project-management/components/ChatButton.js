import { useState } from 'react';
import { activityApi, taskApi } from '../api/projectApi';
import { useMessaging } from '../../messages/context/MessagingContext';

/**
 * ChatButton — drop this into TaskItem / ActivityRow (or anywhere else that
 * has a taskId or activityId available) to open that entity's auto-managed
 * chat thread in the Messages rail.
 *
 *   <ChatButton kind="task" id={task.taskId} />
 *   <ChatButton kind="activity" id={activity.activityId} />
 *
 * The thread is created on first use if it doesn't exist yet (e.g. an
 * Activity with no Manager assigned yet has nothing to seed a thread with,
 * so this can occasionally 404 — the button surfaces that inline rather
 * than failing silently).
 *
 * Requires <MessagingProvider> to be mounted above it in the tree, which it
 * already is (AppShell.js wraps the whole app). Opening the panel itself is
 * done via a window event (see AppShell.js) rather than prop-drilling
 * messagesOpen/setMessagesOpen down into this module — same pattern this
 * codebase already uses for 'groups-updated'.
 */
export default function ChatButton({ kind, id, label }) {
  const { setActiveConversationId } = useMessaging();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!id) return;
    setLoading(true); setError('');
    try {
      const { conversationId } = kind === 'activity'
        ? await activityApi.getChat(id)
        : await taskApi.getChat(id);
      setActiveConversationId(conversationId);
      window.dispatchEvent(new CustomEvent('open-messages-panel'));
    } catch (err) {
      setError(err?.response?.data?.error || 'Chat not available yet');
    } finally { setLoading(false); }
  };

  return (
    <button
      type="button"
      className="pm-btn pm-btn-ghost"
      onClick={handleClick}
      disabled={loading}
      title={error || (kind === 'activity' ? 'Open activity group chat' : 'Open task chat')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
      {label || (loading ? '…' : (kind === 'activity' ? 'Group Chat' : 'Chat'))}
      {error && <span style={{ color: '#aa1010', fontSize: 10 }}>!</span>}
    </button>
  );
}