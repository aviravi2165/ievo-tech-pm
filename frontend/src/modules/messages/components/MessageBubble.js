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
 */
export default function MessageBubble({
  message,
  isMine,
  isGroup = false,
  currentUserId,
  isLastSentByMe = false,
  onReply,
  onJumpToParent,
  isHighlighted = false,
  registerRef,
  isEditing = false,
  editBody = '',
  onEditBodyChange,
  onEditStart,
  onEditCancel,
  onEditSave,
  editSaving = false,
  editError = '',
  editDeadlineMinutes = 10,
}) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [showAllSeen,   setShowAllSeen]   = useState(false);
  const [systemExpanded, setSystemExpanded] = useState(false);

  // ── System messages (e.g. "Group name changed from X to Y") ───────────────
  // Regular messages render as large white "email row" cards (.thread-message,
  // ~24px/32px padding, sender header, divider line). System messages must
  // look nothing like that: a small, centered, single-line gold-tinted chip
  // with no card chrome, no sender name ("Unknown" never shows since there's
  // no header row at all), no border-matching-message style, no footer.
  // Persisted as real rows with is_system=1, so they survive a refresh.
  //
  // Long change text (e.g. two long values quoted) gets clipped at maxWidth.
  // Click the chip to expand it to full wrapped text; click again to
  // collapse back to the truncated single-line pill.
  if (message.isSystem) {
    const fullText = (message.bodyHtml || '').replace(/<[^>]+>/g, '');
    return (
      <div
        ref={node => registerRef?.(message.messageId, node)}
        style={{
          display: 'flex', justifyContent: 'center',
          margin: '6px 20px',
        }}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={() => setSystemExpanded(v => !v)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSystemExpanded(v => !v); } }}
          title={systemExpanded ? 'Click to collapse' : 'Click to expand'}
          style={{
            display: 'inline-flex',
            alignItems: systemExpanded ? 'flex-start' : 'center',
            flexDirection: systemExpanded ? 'column' : 'row',
            gap: systemExpanded ? 2 : 6,
            fontSize: 11, lineHeight: 1.4,
            color: '#9a6b00',
            background: '#fff6e0',
            border: '1px solid #f3dca0',
            borderRadius: systemExpanded ? 12 : 999,
            padding: '4px 12px',
            maxWidth: systemExpanded ? '90%' : '70%',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={
            systemExpanded
              ? { whiteSpace: 'normal', wordBreak: 'break-word' }
              : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }>
            {fullText}
          </span>
          <span style={{ color: '#b8924a', fontSize: 10, flexShrink: 0, alignSelf: systemExpanded ? 'flex-end' : 'center' }}>
            {fmtTs(message.sentAt)}
          </span>
        </span>
      </div>
    );
  }

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

  // Who has seen this message (excluding the sender themselves)
  const seenBy = (message.readReceipts || []).filter(
    r => String(r.userId) !== String(message.senderId)
  );
  const isSeen = seenBy.length > 0;

  // Can this message still be edited? Only the sender, only within the deadline.
  const withinEditWindow = (() => {
    if (!isMine || !message.sentAt) return false;
    const sentMs = new Date(message.sentAt).getTime();
    const elapsedMin = (Date.now() - sentMs) / 60000;
    return elapsedMin <= editDeadlineMinutes;
  })();

  // ── Read receipt badge logic ──────────────────────────────────────────────
  // Only show on own messages AND only on the last sent message
  // 1-on-1: only show on last sent message to avoid clutter
  // Group: show on any message that has receipts (so sender sees who read each)
  const showReceiptBadge = isMine && (isLastSentByMe || (isGroup && isSeen));

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
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          <TickIcon seen={true} />
          <span style={{ fontSize: 11, color: '#4A9EFF' }}>
            Seen by{' '}
            {!showAllSeen ? (
              <>
                {shown.map(r => r.userName || 'someone').join(', ')}
                {extra > 0 && (
                  <button
                    onClick={() => setShowAllSeen(true)}
                    style={{
                      background: 'none', border: 'none', color: '#4A9EFF',
                      cursor: 'pointer', fontSize: 11, marginLeft: 4, padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    +{extra} more
                  </button>
                )}
              </>
            ) : (
              <span
                style={{
                  display: 'inline-block', maxHeight: 56, overflowY: 'auto',
                  verticalAlign: 'top', maxWidth: 220,
                  wordBreak: 'break-word', textAlign: 'right',
                }}
              >
                {seenBy.map(r => r.userName || 'someone').join(', ')}
                <button
                  onClick={() => setShowAllSeen(false)}
                  style={{
                    background: 'none', border: 'none', color: '#4A9EFF',
                    cursor: 'pointer', fontSize: 11, marginLeft: 4, padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  show less
                </button>
              </span>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
  <div
    className={`thread-message${isHighlighted ? ' thread-message--highlighted' : ''}`}
    ref={node => registerRef?.(message.messageId, node)}
  >

    {/* Header */}
    <div className="thread-message-header">

      <div className="thread-message-user">
        <div className="thread-sender">
          {message.senderName || 'Unknown User'}
        </div>

        <div className="thread-time">
          {fmtTs(message.sentAt)}
          {message.isEdited && (
            <span style={{ color: 'var(--muted)', fontStyle: 'italic', marginLeft: 5 }}>
              (edited)
            </span>
          )}
        </div>
      </div>



    </div>

    {/* Reply Reference */}
    {message.parentMessage && (
      <div
        className="thread-reply-context"
        role="button"
        tabIndex={0}
        onClick={() => onJumpToParent?.(message.parentMessage)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJumpToParent?.(message.parentMessage); } }}
      >
        {message.parentMessage.isDeleted ? (
          <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
            Original message is unavailable
          </span>
        ) : (
          <>
            <strong>
              Replying to {message.parentMessage.senderName}
            </strong>

            <div className="thread-reply-preview">
              {(message.parentMessage.bodyHtml || '')
                .replace(/<[^>]+>/g, '')
                .slice(0, 120)}
              ...
            </div>
          </>
        )}
      </div>
    )}

    {/* Body */}
    {isEditing ? (
      <div style={{ padding: '4px 0' }}>
        <textarea
          autoFocus
          value={editBody}
          onChange={e => onEditBodyChange?.(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onEditSave?.(); }
            if (e.key === 'Escape') onEditCancel?.();
          }}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--accent)',
            background: 'var(--mid)', color: 'var(--light)', fontSize: 13.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        {editError && (
          <div style={{ color: 'var(--danger)', fontSize: 11.5, marginTop: 4 }}>{editError}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onEditCancel}
            style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            onClick={onEditSave}
            disabled={editSaving}
            style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {editSaving ? 'Saving…' : 'Save (⌘+Enter)'}
          </button>
        </div>
      </div>
    ) : (
      <div
        className="thread-message-body"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    )}

    {/* Attachments */}
    {message.attachments?.length > 0 && (
      <div className="thread-attachments">

        {downloadError && (
          <div className="attachment-error">
            {downloadError}
          </div>
        )}

        {message.attachments.map(att => (
          <button
            key={att.attachmentId}
            className="attach-chip"
            onClick={() => handleDownload(att)}
            disabled={downloadingId === att.attachmentId}
          >
            {downloadingId === att.attachmentId
              ? '⏳'
              : fileIcon(att.mimeType)}

            <span>{att.originalName}</span>

            <span className="attach-size">
              ({(att.fileSize / 1024).toFixed(0)} KB)
            </span>
          </button>
        ))}
      </div>
    )}

    {/* Footer Actions */}
    {!isEditing && (
      <div className="thread-footer">

        {onReply && (
          <button
            className="thread-reply-btn"
            onClick={() => onReply(message)}
          >
            ↩ Reply
          </button>
        )}

        {withinEditWindow && onEditStart && (
          <button
            className="thread-reply-btn"
            onClick={onEditStart}
            title={`Editable for ${editDeadlineMinutes} minutes after sending`}
          >
            ✎ Edit
          </button>
        )}

        <div className="thread-receipt">
          {renderReceiptBadge()}
        </div>

      </div>
    )}

  </div>
);
}