import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { useTheme } from '@emotion/react';
import { Paperclip, Send, FileText, Download, X } from 'lucide-react';
import { useThread } from '../../messages/hooks/useThread';
import { useMessaging } from '../../messages/context/MessagingContext';
import { fileApi } from '../../messages/api/fileApi';

/**
 * ChatBox — a clean, messenger-style chat (bubbles + bottom composer),
 * built on the messaging data layer (useThread: live messages, send, sockets)
 * and fileApi for attachments. Presentation only — no email-thread chrome.
 *
 * @mentions: typing "@" opens an autocomplete of the conversation's other
 * participants; picking one inserts "@Full Name" into the composer. At send
 * time we just check which of those names are still literally present in
 * the text and send their ids as `mentionedUserIds` — the server validates
 * them against active participants, records them, and pings the mentioned
 * users live (see messageService.insertMentions / socketHandler's
 * MENTIONED event). Rendering highlights "@Name" wherever it appears in a
 * message's bodyHtml — walking only its TEXT nodes (see highlightMentions
 * below), never touching markup, so this is safe even though this same
 * group_thread conversation can also be replied to from the general
 * Messaging module's richer editor (ChatWindow), not just this composer.
 */
function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function escapeHtml(s = '') { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtTime(iso) { try { return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }

// Wraps every literal "@Name" occurrence (for a known participant name) in a
// message's bodyHtml with a highlighted span — but only inside text nodes,
// so arbitrary HTML from the richer Messaging composer (links, bold, tables)
// never gets its markup split or corrupted.
function highlightMentions(html, names, spanStyle) {
  if (!html || !names?.length || typeof document === 'undefined') return html;
  if (!names.some(n => html.includes(`@${n}`))) return html; // fast path, no DOM work needed
  const container = document.createElement('div');
  container.innerHTML = html;
  const sorted = [...names].sort((a, b) => b.length - a.length); // longest first — avoids a short name matching inside a longer one
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n; while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    const text = node.nodeValue;
    if (!text.includes('@')) continue;
    let rest = text;
    const frag = document.createDocumentFragment();
    let guard = 0;
    while (rest.length && guard++ < 200) {
      let bestIdx = -1, bestName = null;
      for (const name of sorted) {
        const i = rest.indexOf(`@${name}`);
        if (i !== -1 && (bestIdx === -1 || i < bestIdx)) { bestIdx = i; bestName = name; }
      }
      if (bestIdx === -1) { frag.appendChild(document.createTextNode(rest)); rest = ''; break; }
      if (bestIdx > 0) frag.appendChild(document.createTextNode(rest.slice(0, bestIdx)));
      const span = document.createElement('span');
      span.setAttribute('style', spanStyle);
      span.textContent = `@${bestName}`;
      frag.appendChild(span);
      rest = rest.slice(bestIdx + 1 + bestName.length);
    }
    node.parentNode.replaceChild(frag, node);
  }
  return container.innerHTML;
}

const Bubble = memo(function Bubble({ m, mine, theme, mentionNames }) {
  // On the sender's own (solid espresso) bubble, an espresso-on-espresso
  // highlight would be unreadable — use a translucent white pill there,
  // matching how the attachment chips already handle `mine` differently.
  const spanStyle = mine
    ? 'background:rgba(255,255,255,0.25);color:#fff;font-weight:700;border-radius:4px;padding:0 3px;'
    : `background:${theme.colors.espresso}26;color:${theme.colors.espresso};font-weight:700;border-radius:4px;padding:0 3px;`;
  const highlighted = useMemo(() => highlightMentions(m.bodyHtml, mentionNames, spanStyle), [m.bodyHtml, mentionNames, spanStyle]);
  if (m.isSystem) {
    return (
      <div style={{ alignSelf: 'center', maxWidth: '80%', textAlign: 'center', fontSize: 11, color: theme.colors.ash, background: `${theme.colors.espresso}0d`, borderRadius: 10, padding: '5px 12px' }}
        dangerouslySetInnerHTML={{ __html: highlighted }} />
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
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
          <div dangerouslySetInnerHTML={{ __html: highlighted }} />
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
});

export default function ChatBox({ conversationId }) {
  const theme = useTheme();
  const { currentUserId } = useMessaging();
  const { messages, conversation, loading, ready, error, sendReply, markAllRead } = useThread(conversationId);
  const [text, setText]       = useState('');
  const [files, setFiles]     = useState([]);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  // @mention autocomplete — `mention` is null when inactive, else
  // { start: index of the '@' in `text`, query: text typed after it }.
  const [mention, setMention]           = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const scrollRef   = useRef(null);
  const fileRef     = useRef(null);
  const textareaRef = useRef(null);

  // Other participants of this conversation — mention candidates.
  const participants = useMemo(() => (conversation?.participants || [])
    .filter(p => String(p.userId) !== String(currentUserId))
    .map(p => ({ userId: p.userId, name: [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email || 'Someone' })),
    [conversation?.participants, currentUserId]);
  const mentionNames = useMemo(() => participants.map(p => p.name), [participants]);

  const mentionMatches = mention
    ? participants.filter(p => p.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

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

  // Is the caret sitting right after an "@token" with no whitespace in
  // between, and is that "@" itself at the start of the text or preceded by
  // whitespace? If so, that's an active mention query.
  const detectMention = (value, caret) => {
    const upToCaret = value.slice(0, caret);
    const at = upToCaret.lastIndexOf('@');
    if (at === -1) return null;
    const between = upToCaret.slice(at + 1);
    if (/\s/.test(between)) return null;
    if (at > 0 && !/\s/.test(value[at - 1])) return null;
    return { start: at, query: between };
  };

  const onTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    setMention(detectMention(value, e.target.selectionStart));
    setMentionIndex(0);
  };

  const pickMention = (p) => {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after  = text.slice(mention.start + 1 + mention.query.length);
    const inserted = `@${p.name} `;
    const newText = `${before}${inserted}${after}`;
    setText(newText);
    setMention(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) { const pos = before.length + inserted.length; el.focus(); el.setSelectionRange(pos, pos); }
    });
  };

  const send = async () => {
    const body = text.trim();
    const attachmentIds = files.filter(f => f.attachmentId).map(f => f.attachmentId);
    if (!body && !attachmentIds.length) return;
    if (files.some(f => f.uploading)) { setSendErr('Wait for uploads to finish.'); return; }
    setSending(true); setSendErr('');
    // Who's actually still @mentioned in the final text (picking someone,
    // then deleting the inserted name, un-mentions them — this re-checks
    // rather than trusting whatever was picked during typing).
    const mentionedUserIds = participants.filter(p => body.includes(`@${p.name}`)).map(p => p.userId);
    try {
      await sendReply({ bodyHtml: body ? escapeHtml(body).replace(/\n/g, '<br>') : '&nbsp;', attachmentIds, mentionedUserIds });
      setText(''); setFiles([]);
    } catch (err) { setSendErr(err?.response?.data?.error || 'Failed to send.'); }
    finally { setSending(false); }
  };

  const onKeyDown = (e) => {
    if (mention && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches[mentionIndex]); return; }
      if (e.key === 'Escape') { setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

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
        {messages.map(m => (
          <Bubble key={m.messageId} m={m} mine={String(m.senderId) === String(currentUserId)} theme={theme} mentionNames={mentionNames} />
        ))}
       </div>
      </div>

      {/* ── Composer (full width to match the messages above) ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${theme.colors.border}`, background: theme.colors.white, padding: '12px 24px', position: 'relative' }}>
        {/* @mention autocomplete — sits just above the composer */}
        {mention && mentionMatches.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 24, marginBottom: 6, width: 240, maxHeight: 220, overflowY: 'auto',
            background: theme.colors.white, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 50,
          }}>
            {mentionMatches.map((p, i) => (
              <div key={p.userId} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12.5,
                  background: i === mentionIndex ? `${theme.colors.espresso}14` : 'transparent', color: theme.colors.onyx,
                }}>
                <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700, color: theme.colors.onyx }}>{initials(p.name)}</span>
                {p.name}
              </div>
            ))}
          </div>
        )}
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
            ref={textareaRef}
            value={text}
            onChange={onTextChange}
            onKeyDown={onKeyDown}
            placeholder="Write an update…  (Enter to send, Shift+Enter for a new line, @ to mention)"
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
