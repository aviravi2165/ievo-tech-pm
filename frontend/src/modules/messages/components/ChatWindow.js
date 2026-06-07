import { useEffect, useRef, useMemo } from 'react';
import { useState } from 'react';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import { useThread } from '../hooks/useThread';
import { messageApi } from '../api/messageApi';

export default function ChatWindow({ conversation, currentUserId, onArchive, onBack }) {
  const { messages, loading, error, markAllRead, sendReply, refetch } =
    useThread(conversation?.conversationId);
  const [replyingTo, setReplyingTo] = useState(null);
  const bottomRef = useRef(null);

  // Is this a group conversation? (more than 2 participants)
  const isGroup = (conversation?.participants?.length ?? 0) > 2;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mark all unread messages read when conversation opens
  useEffect(() => {
    if (!messages.length || !currentUserId) return;
    markAllRead(currentUserId);
  }, [messages, currentUserId, markAllRead]);

  /**
   * Find the ID of the last message sent by me.
   * Only that message shows the Sent/Seen receipt badge.
   * If a new message arrives after the last read point the badge
   * naturally moves to the new last-sent message.
   */
  const lastSentByMeId = useMemo(() => {
    const mine = messages.filter(m => String(m.senderId) === String(currentUserId));
    return mine.length ? mine[mine.length - 1].messageId : null;
  }, [messages, currentUserId]);

  const handleDelete = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await messageApi.deleteMessage(messageId);
      refetch();
    } catch { /* handled globally */ }
  };

  const handleSend = async (payload) => {
    await sendReply(payload);
    setReplyingTo(null);
  };

  if (!conversation) return null;

  const participantNames = conversation.participants
    ?.filter(p => String(p.userId) !== String(currentUserId))
    .map(p => `${p.firstName} ${p.lastName}`.trim())
    .join(', ') || '';

  return (
    <>
      {/* Header */}
      <div className="thread-header">
        {onBack && (
          <button className="icon-btn" onClick={onBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
        <div className="thread-header-info">
          <div className="thread-subject">{conversation.subject}</div>
          <div className="thread-meta">
            {participantNames ? `With: ${participantNames}` : `${messages.length} message${messages.length !== 1 ? 's' : ''}`}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
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
            Failed to load messages.{' '}
            <button onClick={refetch} style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>
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