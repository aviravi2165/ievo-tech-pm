import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { Paperclip, Send, FileText, Download, X } from 'lucide-react';
import { useThread } from '../../messages/hooks/useThread';
import { useMessaging } from '../../messages/context/MessagingContext';
import { fileApi } from '../../messages/api/fileApi';

/**
 * ChatBox — a clean, messenger-style chat (bubbles + bottom composer),
 * built on the messaging data layer (useThread: live messages, send, sockets)
 * and fileApi for attachments. Presentation only — no email-thread chrome.
 */
function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function escapeHtml(s = '') { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtTime(iso) { try { return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }

export default function ChatBox({ conversationId }) {
  const theme = useTheme();
  const { currentUserId } = useMessaging();
  const { messages, loading, ready, error, sendReply, markAllRead } = useThread(conversationId);
  const [text, setText]       = useState('');
  const [files, setFiles]     = useState([]);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const scrollRef = useRef(null);
  const fileRef   = useRef(null);

  // Keep pinned to the latest message.
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);
  useEffect(() => { if (ready && currentUserId) markAllRead(currentUserId); }, [ready, currentUserId, messages.length, markAllRead]);

  const handleFiles = async (e) => {
    const list = Array.from(e.target.files || []); e.target.value = '';
    for (const file of list) {
      const tempId = `t_${Date.now()}_${file.name}`;
      setFiles(prev => [...prev, { tempId, name: file.name, uploading: true, progress: 0 }]);
      try {
        const res = await fileApi.upload(file, pct => setFiles(prev => prev.map(f => f.tempId === tempId ? { ...f, progress: pct } : f)));
        setFiles(prev => prev.map(f => f.tempId === tempId ? { ...f, uploading: false, attachmentId: res.attachmentId } : f));
      } catch { setFiles(prev => prev.filter(f => f.tempId !== tempId)); setSendErr(`Upload failed: ${file.name}`); }
    }
  };

  const send = async () => {
    const body = text.trim();
    const attachmentIds = files.filter(f => f.attachmentId).map(f => f.attachmentId);
    if (!body && !attachmentIds.length) return;
    if (files.some(f => f.uploading)) { setSendErr('Wait for uploads to finish.'); return; }
    setSending(true); setSendErr('');
    try {
      await sendReply({ bodyHtml: body ? escapeHtml(body).replace(/\n/g, '<br>') : '&nbsp;', attachmentIds });
      setText(''); setFiles([]);
    } catch (err) { setSendErr(err?.response?.data?.error || 'Failed to send.'); }
    finally { setSending(false); }
  };

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: theme.colors.greige }}>
      {/* ── Messages (full width — own messages hug the right edge) ── */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
       <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && !ready && <div style={{ color: theme.colors.ash, fontSize: 12, textAlign: 'center' }}>Loading…</div>}
        {error && <div style={{ color: theme.colors.danger, fontSize: 12, textAlign: 'center' }}>{error}</div>}
        {ready && messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: theme.colors.ashLight, fontSize: 13 }}>
            No messages yet.<br />Share an update or a document to get started.
          </div>
        )}
        {messages.map(m => {
          const mine = String(m.senderId) === String(currentUserId);
          if (m.isSystem) {
            return (
              <div key={m.messageId} style={{ alignSelf: 'center', maxWidth: '80%', textAlign: 'center', fontSize: 11, color: theme.colors.ash, background: `${theme.colors.espresso}0d`, borderRadius: 10, padding: '5px 12px' }}
                dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
            );
          }
          return (
            <div key={m.messageId} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
              {!mine && <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.colors.espresso, marginLeft: 8 }}>{m.senderName || 'Someone'}</span>}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '78%', flexDirection: mine ? 'row-reverse' : 'row' }}>
                {!mine && (
                  <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx }}>{initials(m.senderName)}</span>
                )}
                <div style={{
                  background: mine ? theme.colors.espresso : theme.colors.white,
                  color: mine ? '#fff' : theme.colors.onyx,
                  border: mine ? 'none' : `1px solid ${theme.colors.border}`,
                  borderRadius: 14, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                  padding: '8px 12px', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}>
                  <div dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
                  {(m.attachments || []).map(a => {
                    const nm = a.originalName || a.fileName || a.name || 'attachment';
                    return (
                      <button key={a.attachmentId} type="button" onClick={() => fileApi.download(a.attachmentId, nm)}
                        style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', cursor: 'pointer',
                          background: mine ? 'rgba(255,255,255,0.15)' : theme.colors.greige, border: `1px solid ${mine ? 'rgba(255,255,255,0.25)' : theme.colors.border}`,
                          borderRadius: 8, padding: '6px 8px', color: mine ? '#fff' : theme.colors.onyx, fontFamily: 'inherit', fontSize: 12 }}>
                        <FileText size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</span>
                        <Download size={13} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.8 }} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <span style={{ fontSize: 9.5, color: theme.colors.ashLight, margin: mine ? '0 8px 0 0' : '0 0 0 40px' }}>{fmtTime(m.sentAt)}{m.isEdited ? ' · edited' : ''}</span>
            </div>
          );
        })}
       </div>
      </div>

      {/* ── Composer (full width to match the messages above) ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${theme.colors.border}`, background: theme.colors.white, padding: '12px 24px' }}>
       <div style={{ width: '100%' }}>
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {files.map(f => (
              <span key={f.tempId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: 8, padding: '4px 8px' }}>
                {f.uploading ? <span style={{ color: theme.colors.copper }}>{f.progress}%</span> : <FileText size={12} strokeWidth={2} />}
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <button type="button" onClick={() => setFiles(prev => prev.filter(x => x.tempId !== f.tempId))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, padding: 0, display: 'flex' }}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {sendErr && <div style={{ color: theme.colors.danger, fontSize: 11, marginBottom: 6 }}>{sendErr}</div>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <button type="button" title="Attach file" onClick={() => fileRef.current?.click()}
            style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: `1px solid ${theme.colors.border}`, background: theme.colors.greige, color: theme.colors.ash, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Paperclip size={16} strokeWidth={2} />
          </button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFiles} />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Write an update…  (Enter to send, Shift+Enter for a new line)"
            rows={1}
            style={{ flex: 1, resize: 'none', maxHeight: 120, minHeight: 36, background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '9px 12px', fontSize: 13, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
          />
          <button type="button" onClick={send} disabled={sending} title="Send"
            style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none', background: theme.colors.espresso, color: '#fff', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
       </div>
      </div>
    </div>
  );
}
