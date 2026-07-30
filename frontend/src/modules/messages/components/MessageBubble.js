import { useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from '@emotion/react';
import { fileApi } from '../api/fileApi';
import { Toolbar, FmtBtn, FmtSep, ComposerArea } from '../styles/Composer.styles';
import {
  ThreadMessage, ThreadMessageHeader, ThreadSender, ThreadTime,
  ThreadReplyContext, ThreadReplyPreview, ThreadMessageBody,
  ThreadAttachments, AttachChip, AttachSize, AttachmentError,
  ThreadFooter, ThreadReplyBtn,
} from '../styles/MessageBubble.styles';

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

// Read-receipt sky blue — deliberately distinct from the espresso/copper
// accent used everywhere else in the app, matching the original "Seen"
// color (#4A9EFF) rather than the theme's primary accent, so read status
// stays visually recognizable as its own thing (a WhatsApp-style blue
// tick), not just another espresso-colored UI element.
const READ_RECEIPT_BLUE = '#4A9EFF';

// Single tick (sent) / double tick (seen) SVG
function TickIcon({ seen }) {
  const theme = useTheme();
  return seen ? (
    // Double blue tick
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none"
      style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M1 5l3 3 5-7" stroke={READ_RECEIPT_BLUE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 5l3 3 5-7" stroke={READ_RECEIPT_BLUE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    // Single grey tick
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M1 5l3 3 5-7" stroke={theme.colors.ash} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
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
  onEditStart,
  onEditCancel,
  onEditSave,
  editSaving = false,
  editError = '',
  editDeadlineMinutes = 10,
}) {
  const theme = useTheme();
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [showAllSeen,   setShowAllSeen]   = useState(false);
  const [systemExpanded, setSystemExpanded] = useState(false);
  const editRef = useRef(null);

  // ── System messages (e.g. "Group name changed from X to Y") ───────────────
  // Regular messages render as large white "email row" cards (ThreadMessage,
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
            color: theme.colors.warning,
            background: 'rgba(196,154,108,0.15)',
            border: `1px solid ${theme.colors.warning}`,
            borderRadius: systemExpanded ? 12 : 999,
            padding: '4px 12px',
            maxWidth: systemExpanded ? '90%' : '70%',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={
            systemExpanded
              // pre-line (not normal) so multi-line system messages (e.g.
              // Activity Insights reports) keep their line breaks instead of
              // collapsing into one run-on paragraph — a no-op for the
              // original one-line system messages (name/description
              // changes), which never contain a newline to begin with.
              ? { whiteSpace: 'pre-line', wordBreak: 'break-word' }
              : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }>
            {fullText}
          </span>
          <span style={{ color: theme.colors.warning, fontSize: 10, flexShrink: 0, alignSelf: systemExpanded ? 'flex-end' : 'center' }}>
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
          <span style={{ fontSize: 11, color: isSeen ? READ_RECEIPT_BLUE : theme.colors.ash }}>
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
          <span style={{ fontSize: 11, color: theme.colors.ash }}>Sent</span>
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
          <span style={{ fontSize: 11, color: READ_RECEIPT_BLUE }}>
            Seen by{' '}
            {!showAllSeen ? (
              <>
                {shown.map(r => r.userName || 'someone').join(', ')}
                {extra > 0 && (
                  <button
                    onClick={() => setShowAllSeen(true)}
                    style={{
                      background: 'none', border: 'none', color: READ_RECEIPT_BLUE,
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
                    background: 'none', border: 'none', color: READ_RECEIPT_BLUE,
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
  <ThreadMessage
    highlighted={isHighlighted}
    ref={node => registerRef?.(message.messageId, node)}
  >

    {/* Header */}
    <ThreadMessageHeader>

      <div>
        <ThreadSender>
          {message.senderName || 'Unknown User'}
        </ThreadSender>

        <ThreadTime>
          {fmtTs(message.sentAt)}
          {message.isEdited && (
            <span style={{ color: theme.colors.ash, fontStyle: 'italic', marginLeft: 5 }}>
              (edited)
            </span>
          )}
        </ThreadTime>
      </div>

    </ThreadMessageHeader>

    {/* Reply Reference */}
    {message.parentMessage && (
      <ThreadReplyContext
        role="button"
        tabIndex={0}
        onClick={() => onJumpToParent?.(message.parentMessage)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJumpToParent?.(message.parentMessage); } }}
      >
        {message.parentMessage.isDeleted ? (
          <span style={{ color: theme.colors.ashLight, fontStyle: 'italic' }}>
            Original message is unavailable
          </span>
        ) : (
          <>
            <strong>
              Replying to {message.parentMessage.senderName}
            </strong>

            <ThreadReplyPreview>
              {(message.parentMessage.bodyHtml || '')
                .replace(/<[^>]+>/g, '')
                .slice(0, 120)}
              ...
            </ThreadReplyPreview>
          </>
        )}
      </ThreadReplyContext>
    )}

    {/* Body */}
    {isEditing ? (
      <div style={{ padding: '4px 0' }}>
        {/* Same rich-text toolbar as compose/reply — editing previously
            dropped straight to a plain textarea (no bold/italic/lists, and
            any existing formatting got silently stripped the moment you
            opened it). Seeded once from cleanHtml (already-sanitized), read
            back via editRef on Save — uncontrolled, same pattern as the
            compose editor's bodyRef, so React never fights the cursor
            position by re-rendering innerHTML on every keystroke. */}
        <Toolbar style={{ marginBottom: 6 }}>
          <FmtBtn type="button" title="Bold"
            onMouseDown={e => { e.preventDefault(); editRef.current?.focus(); document.execCommand('bold'); }}>
            <strong>B</strong>
          </FmtBtn>
          <FmtBtn type="button" title="Italic" style={{ fontStyle: 'italic' }}
            onMouseDown={e => { e.preventDefault(); editRef.current?.focus(); document.execCommand('italic'); }}>I</FmtBtn>
          <FmtBtn type="button" title="Underline" style={{ textDecoration: 'underline' }}
            onMouseDown={e => { e.preventDefault(); editRef.current?.focus(); document.execCommand('underline'); }}>U</FmtBtn>
          <FmtSep/>
          <FmtBtn type="button" title="Bullet list"
            onMouseDown={e => { e.preventDefault(); editRef.current?.focus(); document.execCommand('insertUnorderedList'); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
            </svg>
          </FmtBtn>
          <FmtBtn type="button" title="Numbered list"
            onMouseDown={e => { e.preventDefault(); editRef.current?.focus(); document.execCommand('insertOrderedList'); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none">1.</text>
              <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2.</text>
              <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3.</text>
            </svg>
          </FmtBtn>
        </Toolbar>

        <ComposerArea
          ref={editRef}
          contentEditable={!editSaving}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
          style={{ minHeight: 60, border: `1px solid ${theme.colors.espresso}` }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onEditSave?.(editRef.current?.innerHTML); }
            if (e.key === 'Escape') onEditCancel?.();
          }}
        />
        {editError && (
          <div style={{ color: theme.colors.danger, fontSize: 11.5, marginTop: 4 }}>{editError}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onEditCancel}
            style={{ padding: '4px 12px', borderRadius: 7, border: `1px solid ${theme.colors.border}`, background: 'transparent', color: theme.colors.ash, cursor: 'pointer', fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            onClick={() => onEditSave?.(editRef.current?.innerHTML)}
            disabled={editSaving}
            style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: theme.colors.espresso, color: theme.colors.onAccent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {editSaving ? 'Saving…' : 'Save (ctrl+Enter)'}
          </button>
        </div>
      </div>
    ) : (
      <ThreadMessageBody dangerouslySetInnerHTML={{ __html: cleanHtml }} />
    )}

    {/* Attachments */}
    {message.attachments?.length > 0 && (
      <ThreadAttachments>

        {downloadError && <AttachmentError>{downloadError}</AttachmentError>}

        {message.attachments.map(att => (
          <AttachChip
            key={att.attachmentId}
            onClick={() => handleDownload(att)}
            disabled={downloadingId === att.attachmentId}
          >
            {downloadingId === att.attachmentId
              ? '⏳'
              : fileIcon(att.mimeType)}

            <span>{att.originalName}</span>

            <AttachSize>({(att.fileSize / 1024).toFixed(0)} KB)</AttachSize>
          </AttachChip>
        ))}
      </ThreadAttachments>
    )}

    {/* Footer Actions */}
    {!isEditing && (
      <ThreadFooter>

        {onReply && (
          <ThreadReplyBtn onClick={() => onReply(message)}>
            ↩ Reply
          </ThreadReplyBtn>
        )}

        {withinEditWindow && onEditStart && (
          <ThreadReplyBtn
            onClick={onEditStart}
            title={`Editable for ${editDeadlineMinutes} minutes after sending`}
          >
            ✎ Edit
          </ThreadReplyBtn>
        )}

        <div>
          {renderReceiptBadge()}
        </div>

      </ThreadFooter>
    )}

  </ThreadMessage>
);
}
