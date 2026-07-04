import { useState } from 'react';
import { activityApi, taskApi } from '../api/projectApi';
import { useMessaging } from '../../messages/context/MessagingContext';

export default function ChatButton({ kind, id, label }) {
  const { requestOpenConversation } = useMessaging();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!id) return;
    setLoading(true); setError('');
    try {
      const data = kind === 'activity'
        ? await activityApi.getChat(id)
        : await taskApi.getChat(id);
      // Pass full conversation info so MessagingPage can open ChatWindow correctly
      requestOpenConversation({
        conversationId: data.conversationId,
        subject:        data.subject || '',
        convType:       data.convType || 'cc',
      });
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
      title={error || (kind === 'activity' ? 'Open activity chat' : 'Open task chat')}
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