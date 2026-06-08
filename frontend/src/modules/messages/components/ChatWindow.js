import { useEffect, useRef, useMemo, useState } from 'react';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import { useThread } from '../hooks/useThread';
import { messageApi } from '../api/messageApi';

export default function ChatWindow({ conversation, currentUserId, onArchive, onBack }) {
  const { messages, loading, error, markAllRead, sendReply, refetch } =
    useThread(conversation?.conversationId);
  const [replyingTo, setReplyingTo] = useState(null);
  const bottomRef     = useRef(null);
  // Track whether we've already called markAllRead for this conversation open
  const markedAllRef  = useRef(null);

  /**
   * isGroup: true when the conversation has more than 2 participants.
   *
   * FIX: The old code used conversation.participants.length but
   * conversation comes from the inbox list which does NOT include participants[].
   * Only getThread returns participants[]. So we now use participantCount
   * (a new scalar field returned by getInbox/getSent) as the primary signal,
   * falling back to participants[] length once the thread loads.
   */
  const isGroup = useMemo(() => {
    // participantCount from inbox row (available immediately)
    if (conversation?.participantCount != null) {
      return conversation.participantCount > 2;
    }
    // participants[] from thread load (available after fetch)
    return (conversation?.participants?.length ?? 0) > 2;
  }, [conversation?.participantCount, conversation?.participants?.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  /**
   * Mark all unread messages read exactly once when this conversation opens.
   * We guard with markedAllRef so:
   *   - We don't call it again when messages state updates (socket events etc.)
   *   - We reset when a different conversation is opened
   */
  useEffect(() => {
    if (!messages.length || !currentUserId) return;
    const convId = conversation?.conversationId;
    if (markedAllRef.current === convId) return; // already done for this conv
    markedAllRef.current = convId;
    markAllRead(currentUserId);
  }, [conversation?.conversationId, messages.length, currentUserId, markAllRead]);

  // The last message sent by the current user — only this one gets the tick badge
  const lastSentByMeId = useMemo(() => {
    const mine = messages.filter(m => String(m.senderId) === String(currentUserId));
    return mine.length ? mine[mine.length - 1].messageId : null;
  }, [messages, currentUserId]);

  const handleDelete = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await messageApi.deleteMessage(messageId);
      refetch();
    } catch { /* silent */ }
  };

  const handleSend = async (payload) => {
    await sendReply(payload);
    setReplyingTo(null);
  };

  if (!conversation) return null;

  const participantNames = (conversation.participants || [])
    .filter(p => String(p.userId) !== String(currentUserId))
    .map(p => `${p.firstName || ''} ${p.lastName || ''}`.trim())
    .join(', ') || conversation.participantNames || '';

  return (
    <>
      {/* Header */}
      <div className="thread-header">
        {onBack && (
          <button className="icon-btn" onClick={onBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
        <div className="thread-header-info">
          <div className="thread-subject">{conversation.subject}</div>
          <div className="thread-meta">
            {participantNames
              ? `With: ${participantNames}`
              : `${messages.length} message${messages.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="thread-actions">
          {!conversation.allowReply && (
            <span style={{
              fontSize: 11, color: 'var(--gold-dim)', padding: '3px 8px',
              border: '1px solid var(--gold-dim)', borderRadius: 'var(--radius)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>Broadcast</span>
          )}
          <button className="icon-btn" title="Archive" onClick={onArchive}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8"/>
              <rect x="1" y="3" width="22" height="5"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="thread-messages">
        {loading && <div className="loader-wrap"><div className="spinner" /></div>}
        {error && (
          <div style={{ color: 'var(--danger)', padding: 16, fontSize: 13 }}>
            Failed to load.{' '}
            <button onClick={refetch}
              style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Retry
            </button>
          </div>
        )}
        {!loading && messages.map(msg => (
          <MessageBubble
            key={msg.messageId}
            message={msg}
            isMine={String(msg.senderId) === String(currentUserId)}
            isGroup={isGroup}
            currentUserId={currentUserId}
            isLastSentByMe={msg.messageId === lastSentByMeId}
            onReply={conversation.allowReply ? setReplyingTo : null}
            onDelete={handleDelete}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <Composer
        allowReply={conversation.allowReply}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
      />
    </>
  );
}