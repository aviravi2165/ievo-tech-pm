import { useState, useRef } from 'react';
import { fileApi } from '../api/fileApi';

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'text/plain',
];
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Composer
 * Props:
 *   allowReply   — bool (false = read-only / broadcast)
 *   replyingTo   — message object being replied to (or null)
 *   onCancelReply()
 *   onSend({ bodyHtml, attachmentIds, parentMessageId })
 *   disabled     — bool
 */
export default function Composer({ allowReply = true, replyingTo, onCancelReply, onSend, disabled, participants = [] }) {
  const editorRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]); // { id, name, size, uploading, progress }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // ── @mention state ──────────────────────────────────────────────────────
  const [mentionQuery, setMentionQuery]   = useState(null); // null = closed
  const [mentionActive, setMentionActive] = useState(0);
  const [mentionPos, setMentionPos]       = useState({ anchor: 'top', value: 0, left: 0 });

  if (!allowReply) {
    return (
      <div className="no-reply-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        Replies are disabled for this conversation.
      </div>
    );
  }

  const mentionName = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unknown';

  const mentionMatches = mentionQuery === null
    ? []
    : participants.filter(p =>
        mentionName(p).toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 8);

  // Detect "@query" immediately before the caret and open/update/close the dropdown
  const DROPDOWN_HEIGHT = 200;
  const DROPDOWN_WIDTH  = 220;

  const detectMention = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMentionQuery(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); return; }

    const textBefore = node.textContent.slice(0, range.startOffset);
    const match = textBefore.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) { setMentionQuery(null); return; }

    setMentionQuery(match[1]);
    setMentionActive(0);

    const rect = range.getClientRects()[0] || editorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - 8);

    // Prefer opening right below the caret line (where the person is
    // actually looking). Only flip above if there truly isn't room below,
    // so it never has to fight with the toolbar or footer for space.
    if (spaceBelow >= DROPDOWN_HEIGHT + 8) {
      setMentionPos({ anchor: 'top', value: rect.bottom + 6, left });
    } else {
      setMentionPos({ anchor: 'bottom', value: window.innerHeight - rect.top + 6, left });
    }
  };

  // Replace the "@query" text immediately before the caret with the chosen mention
  const insertMention = (person) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); return; }

    const text = node.textContent;
    const caret = range.startOffset;
    const atIndex = text.lastIndexOf('@', caret - 1);
    if (atIndex === -1) { setMentionQuery(null); return; }

    const name = mentionName(person);
    const newText = `${text.slice(0, atIndex)}@${name} ${text.slice(caret)}`;
    node.textContent = newText;

    const newCaretPos = atIndex + name.length + 2; // "@" + name + " "
    const newRange = document.createRange();
    newRange.setStart(node, newCaretPos);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMentionQuery(null);
    editorRef.current?.focus();
  };

  const execCmd = (cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type)) {
        setError(`File type not allowed: ${file.name}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`File exceeds 25 MB limit: ${file.name}`);
        continue;
      }
      setError('');

      const tempId = `tmp_${Date.now()}_${file.name}`;
      setAttachments(prev => [...prev, { tempId, name: file.name, size: file.size, uploading: true, progress: 0 }]);

      try {
        const result = await fileApi.upload(file, (pct) => {
          setAttachments(prev =>
            prev.map(a => a.tempId === tempId ? { ...a, progress: pct } : a)
          );
        });
        setAttachments(prev =>
          prev.map(a => a.tempId === tempId
            ? { ...a, uploading: false, attachmentId: result.attachmentId }
            : a
          )
        );
      } catch {
        setError(`Upload failed: ${file.name}`);
        setAttachments(prev => prev.filter(a => a.tempId !== tempId));
      }
    }
  };

  const removeAttachment = (tempId) => {
    setAttachments(prev => prev.filter(a => a.tempId !== tempId));
  };

  const handleSend = async () => {
    const html = editorRef.current?.innerHTML?.trim();
    if (!html || html === '<br>') { setError('Message body cannot be empty.'); return; }
    const still_uploading = attachments.some(a => a.uploading);
    if (still_uploading) { setError('Please wait for uploads to finish.'); return; }

    setError('');
    setSending(true);
    try {
      await onSend({
        bodyHtml: html,
        attachmentIds: attachments.filter(a => a.attachmentId).map(a => a.attachmentId),
        parentMessageId: replyingTo?.messageId || null,
      });
      if (editorRef.current) editorRef.current.innerHTML = '';
      setAttachments([]);
      onCancelReply?.();
    } catch (err) {
      setError(err?.response?.data?.message || 'Send failed. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="composer" ref={composerRef}>
      {/* Reply context */}
      {replyingTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="msg-reply-strip" style={{ flex: 1 }}>
            ↩ Replying to <strong>{replyingTo.senderName}</strong>
          </div>
          <button className="icon-btn" onClick={onCancelReply} title="Cancel reply">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Formatting toolbar */}
      <div className="composer-toolbar">
        <button className="fmt-btn" title="Bold" onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}>B</button>
        <button className="fmt-btn" title="Italic" style={{ fontStyle: 'italic' }} onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}>I</button>
        <button className="fmt-btn" title="Underline" style={{ textDecoration: 'underline' }} onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}>U</button>
        <div className="fmt-sep" />
        <button className="fmt-btn" title="Bullet list" onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
          </svg>
        </button>
        <button className="fmt-btn" title="Numbered list" onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList'); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
            <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none">1.</text>
            <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2.</text>
            <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3.</text>
          </svg>
        </button>
        <div className="fmt-sep" />
        <button
          className="fmt-btn"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.txt"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        className="composer-area"
        contentEditable={!disabled && !sending}
        suppressContentEditableWarning
        data-placeholder="Write your message…"
        onInput={detectMention}
        onBlur={() => setTimeout(() => setMentionQuery(null), 120)}
        onKeyDown={e => {
          if (mentionQuery !== null && mentionMatches.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMentionActive(i => (i + 1) % mentionMatches.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMentionActive(i => (i - 1 + mentionMatches.length) % mentionMatches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertMention(mentionMatches[mentionActive]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setMentionQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
            return;
          }
          // FIX (manual formatting not sending as typed): plain Enter in a
          // contentEditable div normally splits into a new <div>, which
          // collapses visually/semantically compared to pasted HTML that
          // already contains <br>/<p> tags. Force a real <br> insertion so
          // manually typed line breaks are preserved the same way pasted
          // content is.
          if (e.key === 'Enter' && !e.shiftKey) {
  const sel = window.getSelection();

  let node = sel?.anchorNode;

  while (node) {
    if (
      node.nodeType === 1 &&
      ['LI', 'UL', 'OL'].includes(node.nodeName)
    ) {
      return; // allow native list behavior
    }
    node = node.parentNode;
  }

  e.preventDefault();
  document.execCommand('insertLineBreak');
}
        }}
      />

      {/* @mention dropdown */}
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div
          style={{
            position: 'fixed',
            [mentionPos.anchor]: mentionPos.value,
            left: mentionPos.left,
            zIndex: 1000,
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            width: DROPDOWN_WIDTH,
            maxHeight: DROPDOWN_HEIGHT,
            overflowY: 'auto',
          }}
        >
          {mentionMatches.map((p, i) => (
            <div
              key={p.userId}
              onMouseDown={e => { e.preventDefault(); insertMention(p); }}
              onMouseEnter={() => setMentionActive(i)}
              style={{
                padding: '8px 14px',
                fontSize: 13.5,
                color: '#1f2430',
                cursor: 'pointer',
                background: i === mentionActive ? '#fdecea' : '#ffffff',
                borderBottom: '1px solid #f1f2f4',
              }}
            >
              {mentionName(p)}
            </div>
          ))}
        </div>
      )}

      {/* Pending attachments */}
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map(att => (
            <div key={att.tempId} className="composer-attach-chip">
              {att.uploading
                ? <span style={{ color: 'var(--gold)', fontSize: 11 }}>{att.progress}%</span>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              }
              <span>{att.name}</span>
              <button className="composer-attach-remove" onClick={() => removeAttachment(att.tempId)}>×</button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>
      )}

      <div className="composer-footer">
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Ctrl+Enter to send &nbsp;·&nbsp; Max 25 MB per file
        </span>
        <button className="btn-send" onClick={handleSend} disabled={disabled || sending}>
          {sending
            ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Sending…</>
            : <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Send
              </>
          }
        </button>
      </div>
    </div>
  );
}