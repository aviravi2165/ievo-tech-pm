import { useEffect, useRef, useMemo, useState } from 'react';
import MessageBubble from './MessageBubble';
import Composer      from './Composer';
import { useThread } from '../hooks/useThread';
import { messageApi } from '../api/messageApi';

const CONV_TYPE_LABEL = {
  bcc:          { label: 'Private',    color: 'var(--muted)' },
  cc:           { label: 'Shared',     color: '#4A9EFF' },
  group_thread: { label: 'Group Chat', color: 'var(--gold)' },
};

export default function ChatWindow({ conversation, currentUserId, onArchive, onBack, toast }) {
  const { messages, conversation: threadConv, loading, error, markAllRead, sendReply, refetch } =
    useThread(conversation?.conversationId);

  const [replyingTo,       setReplyingTo]       = useState(null);
  const [showParticipants, setShowParticipants]  = useState(false);
  const [removing,         setRemoving]          = useState(null); // userId being removed
  const [removeError,      setRemoveError]       = useState('');
  const [highlightedId,    setHighlightedId]     = useState(null);
  const markedAllRef = useRef(null);
  const bottomRef    = useRef(null);
  const messageNodesRef = useRef({}); // messageId -> DOM node

  const registerMessageRef = (messageId, node) => {
    if (node) messageNodesRef.current[messageId] = node;
    else delete messageNodesRef.current[messageId];
  };

  // Jump to (and highlight) the original message a reply references.
  // Works for any participant's reply, since the lookup is purely by
  // messageId against whatever is currently rendered in this thread.
  const handleJumpToParent = (parentMessage) => {
    if (!parentMessage || parentMessage.isDeleted) {
      toast?.('Message unavailable', 'error');
      return;
    }
    const node = messageNodesRef.current[parentMessage.messageId];
    if (!node) {
      toast?.('Message unavailable', 'error');
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(parentMessage.messageId);
  };

  // Clicking anywhere else clears the highlight and returns to normal scrolling.
  useEffect(() => {
    if (highlightedId == null) return;
    const clear = () => setHighlightedId(null);
    // Defer attaching so the click that triggered the jump doesn't immediately clear it.
    const id = setTimeout(() => document.addEventListener('click', clear), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', clear);
    };
  }, [highlightedId]);
 

  // Merge inbox-row data with thread-loaded data (thread data wins for convType/createdBy)
  const conv = useMemo(() => ({
    ...conversation,
    ...(threadConv || {}),
    // participants come from thread load
    participants: threadConv?.participants || conversation?.participants || [],
  }), [conversation, threadConv]);

  const convType   = conv.convType   || 'bcc';
  const createdBy  = conv.createdBy  || conv.created_by;
  const isCcThread = convType === 'cc';
  const isGroupThread = convType === 'group_thread';
  const isSender   = String(createdBy) === String(currentUserId);
  const canReply   = conv.userCanReply ?? conv.allowReply;
  const isGroupDisabled = isGroupThread && Boolean(conv.isGroupDisabled);

  const isGroup = useMemo(() => {
    if (conv.participantCount != null) return conv.participantCount > 2;
    return (conv.participants?.length ?? 0) > 2;
  }, [conv.participantCount, conv.participants?.length]);

  // Scroll to bottom on new messages
const firstLoadRef = useRef(true);

useEffect(() => {
  firstLoadRef.current = true;
}, [conversation?.conversationId]);

useEffect(() => {
  if (
    firstLoadRef.current &&
    messages.length > 0
  ) {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'end',
      });
    }, 50);

    firstLoadRef.current = false;
  }
}, [messages.length]);

useEffect(() => {
  const container = document.querySelector('.gmail-thread-view');

  if (!container) return;

  const distanceFromBottom =
    container.scrollHeight -
    container.scrollTop -
    container.clientHeight;

  if (distanceFromBottom < 120) {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }
}, [messages.length]);
  // Mark all unread once on open
  useEffect(() => {
    if (!messages.length || !currentUserId) return;
    const cid = conversation?.conversationId;
    if (markedAllRef.current === cid) return;
    markedAllRef.current = cid;
    markAllRead(currentUserId);
  }, [conversation?.conversationId, messages.length, currentUserId, markAllRead]);

  const lastSentByMeId = useMemo(() => {
    const mine = messages.filter(m => String(m.senderId) === String(currentUserId));
    return mine.length ? mine[mine.length - 1].messageId : null;
  }, [messages, currentUserId]);

  const handleDelete = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;
    try { await messageApi.deleteMessage(messageId); refetch(); } catch { /* silent */ }
  };

  const handleSend = async (payload) => {
    await sendReply(payload);
    setReplyingTo(null);
  };

  // ── Remove participant (CC only, sender only) ──────────────────────────────
  const handleRemoveParticipant = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this shared thread?`)) return;
    setRemoving(userId); setRemoveError('');
    try {
      await messageApi.removeParticipant(conv.conversationId, userId);
      await refetch();  // reload thread to update participant list
    } catch (err) {
      setRemoveError(err?.response?.data?.error || 'Failed to remove participant.');
    } finally {
      setRemoving(null);
    }
  };

  if (!conversation) return null;

  // Participants to display (others only, for header subtitle)
  const others = conv.participants
    .filter(p => String(p.userId) !== String(currentUserId))
    .map(p => `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email);

  // Mentionable participants (everyone except me) — passed to Composer for @-tagging
  const mentionableParticipants = conv.participants.filter(
    p => String(p.userId) !== String(currentUserId)
  );

  const participantNames = others.join(', ') || conv.participantNames || '';
  const typeInfo = CONV_TYPE_LABEL[convType] || CONV_TYPE_LABEL.bcc;

  return (
    <>
      {/* ── Thread header ── */}
      <div className="thread-header">
        {onBack && (
          <button className="icon-btn" onClick={onBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}

       <div className="thread-header-info" style={{ flex: 1, minWidth: 0 }}>
  <div className="thread-subject">
    {conv.subject}
  </div>

  <div className="thread-count">
    {messages.length} message{messages.length !== 1 ? 's' : ''}
  </div>
          <div className="thread-meta" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Conv type badge */}
            <span style={{
              fontSize: 10, fontWeight: 700, color: typeInfo.color,
              textTransform: 'uppercase', letterSpacing: '.06em',
              border: `1px solid ${typeInfo.color}`,
              borderRadius: 8, padding: '1px 7px', opacity: .85,
            }}>
              {typeInfo.label}
            </span>
            {participantNames && (
              <span style={{ color: 'var(--muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isCcThread ? `With: ${participantNames}` : participantNames}
              </span>
            )}
          </div>
        </div>

        <div className="thread-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {!canReply && (
            <span style={{
              fontSize: 10, color: 'var(--gold-dim)', padding: '2px 8px',
              border: '1px solid var(--gold-dim)', borderRadius: 8,
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>
              {isGroupDisabled ? 'Group Disabled' : conv.allowReply ? 'Read only' : 'Broadcast'}
            </span>
          )}

          {/* Participants panel toggle — CC and group threads */}
          {(isCcThread || isGroupThread) && (
            <button
              className={`icon-btn ${showParticipants ? 'active' : ''}`}
              title="Participants"
              onClick={() => setShowParticipants(v => !v)}
              style={{ width: 30, height: 30 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </button>
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

      {/* ── Participants panel (CC: removable by sender; group threads: view only) ── */}
      {showParticipants && (isCcThread || isGroupThread) && (
        <div style={{
          padding: '10px 16px 12px',
          borderBottom: '1px solid var(--divider)',
          background: 'var(--charcoal)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 11, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8, fontWeight: 600,
          }}>
            Participants ({conv.participants.length})
            {isCcThread && isSender && (
              <span style={{ marginLeft: 6, color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                · You can remove others
              </span>
            )}
            {isGroupThread && (
              <span style={{ marginLeft: 6, color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                · Managed by the group admin from the Groups tab
              </span>
            )}
          </div>
          {removeError && (
            <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 6 }}>{removeError}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {conv.participants.map(p => {
              const isMe    = String(p.userId) === String(currentUserId);
              const pName   = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unknown';
              const isRemoving = removing === p.userId;
              return (
                <span key={p.userId} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px 3px 10px',
                  background: isMe ? 'rgba(237,28,36,0.06)' : 'var(--mid)',
                  border: `1px solid ${isMe ? 'rgba(237,28,36,0.25)' : 'var(--divider)'}`,
                  borderRadius: 20, fontSize: 12, color: 'var(--light)',
                }}>
                  {pName}
                  {isMe && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>you</span>
                  )}
                  {/* Remove button — CC threads only, sender only, never on others in a group thread */}
                  {isCcThread && isSender && !isMe && (
                    <button
                      title={`Remove ${pName}`}
                      onClick={() => handleRemoveParticipant(p.userId, pName)}
                      disabled={!!isRemoving}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--muted)', fontSize: 14, lineHeight: 1,
                        padding: '0 0 0 2px', transition: 'color 0.12s',
                        display: 'flex', alignItems: 'center',
                      }}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseOut={e  => e.currentTarget.style.color = 'var(--muted)'}
                    >
                      {isRemoving
                        ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }}/>
                        : '×'}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="gmail-thread-view">
        {loading && <div className="loader-wrap"><div className="spinner"/></div>}
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
            onReply={canReply ? setReplyingTo : null}
            onDelete={handleDelete}
            onJumpToParent={handleJumpToParent}
            isHighlighted={msg.messageId === highlightedId}
            registerRef={registerMessageRef}
          />
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* ── Composer (or read-only banner when the group has been disabled) ── */}
      {isGroupDisabled ? (
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--divider)',
          background: 'var(--charcoal)',
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--muted)', fontSize: 13,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          This group has been disabled by its admin — you can still read past messages, but no one can send new ones.
        </div>
      ) : (
        <Composer
          allowReply={canReply}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSend={handleSend}
          participants={mentionableParticipants}
        />
      )}
    </>
  );
}