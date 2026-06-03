import DOMPurify from 'dompurify';
import { fileApi } from '../api/fileApi';

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function fmtTs(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString([], {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(mimeType = '') {
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('image')) return '🖼';
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('docx')) return '📝';
  return '📎';
}

/**
 * MessageBubble
 * Props:
 *   message  — { messageId, senderName, bodyHtml, sentAt, attachments[], readReceipts[], parentMessage }
 *   isMine   — bool (own message)
 *   onReply(message) — callback
 *   onDelete(messageId) — callback
 */
export default function MessageBubble({ message, isMine, onReply, onDelete }) {
  const cleanHtml = DOMPurify.sanitize(message.bodyHtml || '', {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
  });

  const handleDownload = (att) => {
    const url = fileApi.getDownloadUrl(att.attachmentId);
    const token = localStorage.getItem('erp_token');
    // Open via anchor with bearer token workaround
    const a = document.createElement('a');
    a.href = url;
    a.download = att.originalName;
    // For authenticated downloads, open in new tab (server will validate JWT via query or cookie)
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div className={`message-bubble ${isMine ? 'msg-own' : ''}`}>
      {!isMine && (
        <div className="msg-avatar">{initials(message.senderName)}</div>
      )}

      <div className="msg-content">
        <div className="msg-meta">
          {!isMine && <span className="msg-sender">{message.senderName}</span>}
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
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
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
                message.parentMessage.bodyHtml?.replace(/<[^>]+>/g, '').slice(0, 80) + '…'
              )
            }} />
          </div>
        )}

        {/* Body */}
        <div
          className="msg-body"
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />

        {/* Attachments */}
        {message.attachments?.length > 0 && (
          <div className="msg-attachments">
            {message.attachments.map(att => (
              <button
                key={att.attachmentId}
                className="attach-chip"
                onClick={() => handleDownload(att)}
                title={`Download ${att.originalName}`}
              >
                <span>{fileIcon(att.mimeType)}</span>
                <span>{att.originalName}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  ({(att.fileSize / 1024).toFixed(0)}KB)
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {onReply && (
            <button
              onClick={() => onReply(message)}
              style={{
                background: 'none', border: 'none', color: 'var(--muted)',
                fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 0', transition: 'color 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--gold)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/>
              </svg>
              Reply
            </button>
          )}
        </div>

        {/* Read receipts */}
        {isMine && message.readReceipts?.length > 0 && (
          <div className="msg-receipts">
            {message.readReceipts.slice(0, 3).map(r => (
              <span key={r.userId} className="receipt-chip">
                ✓ {r.userName || r.userId}
              </span>
            ))}
            {message.readReceipts.length > 3 && (
              <span className="receipt-chip">+{message.readReceipts.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      {isMine && (
        <div className="msg-avatar">{initials(message.senderName)}</div>
      )}
    </div>
  );
}