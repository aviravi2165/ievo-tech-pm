import { useState } from 'react';
import DOMPurify from 'dompurify';
import { fileApi } from '../api/fileApi';

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function fmtTs(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString([], {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(mimeType = '') {
  if (mimeType.includes('pdf'))                                        return '📄';
  if (mimeType.includes('image'))                                      return '🖼';
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx'))  return '📊';
  if (mimeType.includes('word')        || mimeType.includes('docx'))  return '📝';
  return '📎';
}

// Single tick (sent) / double tick (seen) SVG
function TickIcon({ seen }) {
  return seen ? (
    // Double blue tick
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none"
      style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M1 5l3 3 5-7" stroke="#4A9EFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 5l3 3 5-7" stroke="#4A9EFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    // Single grey tick
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M1 5l3 3 5-7" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/**
 * Props:
 *   message          — full message object with readReceipts[]
 *   isMine           — bool
 *   isGroup          — bool (group conversation)
 *   currentUserId    — string (to exclude self from seen list)
 *   isLastSentByMe   — bool (only the last sent message gets the tick badge)
 *   onReply(message)
 *   onDelete(messageId)
 */
export default function MessageBubble({
  message,
  isMine,
  isGroup = false,
  currentUserId,
  isLastSentByMe = false,
  onReply,
  onDelete,
}) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [showAllSeen,   setShowAllSeen]   = useState(false);

  const cleanHtml = DOMPurify.sanitize(message.bodyHtml || '', {
    ALLOWED_TAGS: ['b','i','u','strong','em','p','br','ul','ol','li','a','table','thead','tbody','tr','th','td','span'],
    ALLOWED_ATTR: ['href','target','rel','style'],
  });

  const handleDownload = async (att) => {
    if (downloadingId === att.attachmentId) return;
    setDownloadError('');
    setDownloadingId(att.attachmentId);
    try {
      await fileApi.download(att.attachmentId, att.originalName);
    } catch (err) {
      setDownloadError(`Download failed: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Who has seen this message (excluding the sender)
  const seenBy = (message.readReceipts || []).filter(
    r => String(r.userId) !== String(currentUserId)
  );
  const isSeen = seenBy.length > 0;

  // ── Read receipt badge logic ──────────────────────────────────────────────
  // Only show on own messages AND only on the last sent message
  const showReceiptBadge = isMine && isLastSentByMe;

  const renderReceiptBadge = () => {
    if (!showReceiptBadge) return null;

    if (!isGroup) {
      // 1-on-1: "Sent" or "Seen"
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <TickIcon seen={isSeen} />
          <span style={{ fontSize: 11, color: isSeen ? '#4A9EFF' : 'var(--muted)' }}>
            {isSeen ? 'Seen' : 'Sent'}
          </span>
        </div>
      );
    }

    // Group: "Sent" or "Seen by X, Y [+N more]"
    if (!isSeen) {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <TickIcon seen={false} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sent</span>
        </div>
      );
    }

    const MAX_INLINE = 2;
    const shown  = showAllSeen ? seenBy : seenBy.slice(0, MAX_INLINE);
    const extra  = seenBy.length - MAX_INLINE;

    return (
      <div style={{ marginTop: 4, textAlign: 'right' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <TickIcon seen={true} />
          <span style={{ fontSize: 11, color: '#4A9EFF' }}>
            Seen by {shown.map(r => r.userName || 'someone').join(', ')}
            {!showAllSeen && extra > 0 && (
              <button
                onClick={() => setShowAllSeen(true)}
                style={{
                  background: 'none', border: 'none', color: '#4A9EFF',
                  cursor: 'pointer', fontSize: 11, marginLeft: 4, padding: 0,
                }}
              >
                +{extra} more
              </button>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={`message-bubble ${isMine ? 'msg-own' : ''}`}>
      {!isMine && (
        <div className="msg-avatar">{initials(message.senderName)}</div>
      )}

      <div className="msg-content">
        <div className="msg-meta">
          {!isMine && (
            <span className="msg-sender">{message.senderName}</span>
          )}
          <span className="msg-timestamp">{fmtTs(message.sentAt)}</span>
          {isMine && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button
                className="icon-btn danger"
                title="Delete message"
                onClick={() => onDelete?.(message.messageId)}
                style={{ width: 24, height: 24 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Reply context */}
        {message.parentMessage && (
          <div className="msg-reply-strip">
            ↩ Replying to <strong>{message.parentMessage.senderName}</strong>:{' '}
            <span dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                (message.parentMessage.bodyHtml || '').replace(/<[^>]+>/g, '').slice(0, 80) + '…'
              ),
            }} />
          </div>
        )}

        {/* Body */}
        <div className="msg-body" dangerouslySetInnerHTML={{ __html: cleanHtml }} />

        {/* Attachments */}
        {message.attachments?.length > 0 && (
          <div className="msg-attachments">
            {downloadError && (
              <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 4 }}>{downloadError}</div>
            )}
            {message.attachments.map(att => (
              <button
                key={att.attachmentId}
                className="attach-chip"
                onClick={() => handleDownload(att)}
                title={`Download ${att.originalName}`}
                disabled={downloadingId === att.attachmentId}
              >
                {downloadingId === att.attachmentId
                  ? <span style={{ fontSize: 11 }}>⏳</span>
                  : <span>{fileIcon(att.mimeType)}</span>
                }
                <span>{att.originalName}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  ({(att.fileSize / 1024).toFixed(0)} KB)
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Reply button */}
        {onReply && (
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              onClick={() => onReply(message)}
              style={{
                background: 'none', border: 'none', color: 'var(--muted)',
                fontSize: 12, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 4, padding: '2px 0', transition: 'color 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--gold)'}
              onMouseOut={e  => e.currentTarget.style.color = 'var(--muted)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 17 4 12 9 7"/>
                <path d="M20 18v-2a4 4 0 00-4-4H4"/>
              </svg>
              Reply
            </button>
          </div>
        )}

        {/* Sent / Seen receipt badge — only on last own message */}
        {renderReceiptBadge()}
      </div>

      {isMine && (
        <div className="msg-avatar">{initials(message.senderName)}</div>
      )}
    </div>
  );
}