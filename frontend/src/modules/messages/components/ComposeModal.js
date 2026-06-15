import { useState, useRef, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { groupApi }   from '../api/groupApi';
import { fileApi }    from '../api/fileApi';
import api            from '../api/axiosInstance';

// ─────────────────────────────────────────────────────────────────
// Tiny user-search hook
// ─────────────────────────────────────────────────────────────────
function useUserSearch(query) {
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!query.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/users/search', { params: { q: query, limit: 10 } });
        setResults(res.data.users || res.data || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(debounce.current);
  }, [query]);

  return { results, loading };
}

// ─────────────────────────────────────────────────────────────────
// RecipientRow — one chip with optional expand controls for groups
// ─────────────────────────────────────────────────────────────────
function RecipientChip({ item, onRemove, onExpand, expandable }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 7px',
      background: item.type === 'group' ? 'rgba(201,169,110,0.15)' : 'var(--mid)',
      border: `1px solid ${item.type === 'group' ? 'var(--gold-dim)' : 'transparent'}`,
      borderRadius: 4, fontSize: 12, color: 'var(--light)',
      maxWidth: 200,
    }}>
      {item.type === 'group' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      )}
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {item.label}
      </span>
      {expandable && item.type === 'group' && (
        <button
          type="button"
          title="Expand group members"
          onClick={onExpand}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--gold)', padding: '0 2px', fontSize: 11, lineHeight: 1,
          }}
        >⤵</button>
      )}
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: 14, lineHeight: 1, padding: 0,
        }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
      >×</button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// RecipientInput — search box + dropdown
// ─────────────────────────────────────────────────────────────────
function RecipientInput({ selectedIds, onAdd, groups = [], placeholder }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const { results: users, loading } = useUserSearch(query);
  const inputRef = useRef(null);
  const dropRef  = useRef(null);

  // Show groups when query empty
  const groupMatches = groups.filter(g =>
    !selectedIds.has(String(g.groupId)) &&
    (!query.trim() || g.groupName.toLowerCase().includes(query.toLowerCase()))
  );
  const userResults = users.filter(u => !selectedIds.has(String(u.userId)));

  useEffect(() => {
    const h = (e) => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = (item) => {
    onAdd(item);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const showDrop = open && (loading || groupMatches.length > 0 || userResults.length > 0 || query.trim());

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        className="recipient-input"
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {showDrop && (
        <div ref={dropRef} className="dropdown" style={{ zIndex: 500 }}>
          {loading && <div className="dropdown-item" style={{ color:'var(--muted)' }}>Searching…</div>}
          {!loading && !groupMatches.length && !userResults.length && query.trim() && (
            <div className="dropdown-item" style={{ color:'var(--muted)' }}>No results for "{query}"</div>
          )}
          {groupMatches.map(g => (
            <div key={`g-${g.groupId}`} className="dropdown-item"
              onMouseDown={e => { e.preventDefault(); select({ id: String(g.groupId), label: g.groupName, type: 'group', memberCount: g.memberCount }); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              <div>
                <div style={{ color:'var(--light)', fontSize:13 }}>{g.groupName}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{g.memberCount ?? 0} members · Group</div>
              </div>
            </div>
          ))}
          {userResults.map(u => (
            <div key={`u-${u.userId}`} className="dropdown-item"
              onMouseDown={e => { e.preventDefault(); select({ id: u.userId, label: `${u.firstName} ${u.lastName}`.trim(), sub: u.email, type: 'user' }); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--subtle)" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <div>
                <div style={{ color:'var(--light)', fontSize:13 }}>{u.firstName} {u.lastName}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{u.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Mode pill selector
// ─────────────────────────────────────────────────────────────────
const MODES = [
  { key: 'bcc',          label: 'Private',      desc: 'Each recipient gets a separate private thread' },
  { key: 'cc',           label: 'Shared',        desc: 'One shared thread, everyone can see each other' },
  { key: 'group_thread', label: 'Group Thread',  desc: 'Send to existing group conversation' },
];

// ─────────────────────────────────────────────────────────────────
// Main ComposeModal
// ─────────────────────────────────────────────────────────────────
export default function ComposeModal({ onClose, onSent, groups = [] }) {
  // Mode
  const [mode, setMode] = useState('bcc');

  // Recipients — stored as { id, label, type: 'user'|'group', expanded?: boolean, members?: [] }
  const [recipients, setRecipients] = useState([]);

  // Subject + body
  const [subject,    setSubject]    = useState('');
  const bodyRef = useRef(null);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);

  // State
  const [allowReply, setAllowReply] = useState(true);
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState('');

  // Expansion loading state per group chip
  const [expanding, setExpanding] = useState({});

  const selectedIds = new Set(recipients.map(r => String(r.id)));

  // ── Add recipient ────────────────────────────────────────────────
  const addRecipient = (item) => {
    if (selectedIds.has(String(item.id))) return;
    // In CC mode, auto-expand groups immediately
    if (mode === 'cc' && item.type === 'group') {
      expandGroup(item, true);
      return;
    }
    setRecipients(prev => [...prev, item]);
  };

  const removeRecipient = (id) => {
    setRecipients(prev => prev.filter(r => String(r.id) !== String(id)));
  };

  // ── Expand group chip into individual members ────────────────────
  const expandGroup = useCallback(async (groupItem, replace = false) => {
    const gid = groupItem.id;
    setExpanding(prev => ({ ...prev, [gid]: true }));
    try {
      const members = await groupApi.getMembers(parseInt(gid, 10));
      const memberChips = members
        .filter(m => !selectedIds.has(String(m.userId)))
        .map(m => ({
          id:    m.userId,
          label: m.firstName ? `${m.firstName} ${m.lastName}`.trim() : m.email,
          sub:   m.email,
          type:  'user',
        }));
      if (replace) {
        // Replace group chip with individual member chips
        setRecipients(prev => [
          ...prev.filter(r => String(r.id) !== String(gid)),
          ...memberChips.filter(mc => !prev.find(p => String(p.id) === String(mc.id))),
        ]);
      } else {
        // Add members alongside the group chip (for BCC preview)
        setRecipients(prev =>
          prev.map(r => String(r.id) === String(gid)
            ? { ...r, expanded: true, members: memberChips }
            : r
          )
        );
      }
    } catch { /**/ }
    finally { setExpanding(prev => ({ ...prev, [gid]: false })); }
  }, [selectedIds]);

  // ── Formatting ───────────────────────────────────────────────────
  const execCmd = (cmd) => { bodyRef.current?.focus(); document.execCommand(cmd, false, null); };

  // ── File upload ──────────────────────────────────────────────────
  const ALLOWED = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','text/plain'];

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) { setError(`Not allowed: ${file.name}`); continue; }
      if (file.size > 25 * 1024 * 1024) { setError(`Too large: ${file.name}`); continue; }
      setError('');
      const tempId = `tmp_${Date.now()}_${file.name}`;
      setAttachments(prev => [...prev, { tempId, name: file.name, uploading: true, progress: 0 }]);
      try {
        const result = await fileApi.upload(file, pct =>
          setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, progress: pct } : a))
        );
        setAttachments(prev => prev.map(a =>
          a.tempId === tempId ? { ...a, uploading: false, attachmentId: result.attachmentId } : a
        ));
      } catch {
        setError(`Upload failed: ${file.name}`);
        setAttachments(prev => prev.filter(a => a.tempId !== tempId));
      }
    }
  };

  // ── Build send payload ───────────────────────────────────────────
  const buildPayload = () => {
    const bodyHtml = bodyRef.current?.innerHTML?.trim();
    if (!bodyHtml || bodyHtml === '<br>') { setError('Message body is required.'); return null; }
    if (!subject.trim()) { setError('Subject is required.'); return null; }
    if (recipients.length === 0) { setError('Add at least one recipient.'); return null; }
    if (attachments.some(a => a.uploading)) { setError('Wait for uploads to finish.'); return null; }

    const attachmentIds = attachments.filter(a => a.attachmentId).map(a => a.attachmentId);

    if (mode === 'group_thread') {
      const groupIds = recipients.filter(r => r.type === 'group').map(r => parseInt(r.id, 10));
      const recipientIds = recipients.filter(r => r.type === 'user').map(r => r.id);
      if (!groupIds.length && !recipientIds.length) { setError('Add at least one group or user.'); return null; }
      return { mode, subject: subject.trim(), bodyHtml, allowReply, attachmentIds, groupIds, recipientIds };
    }

    if (mode === 'cc') {
      // All chips should already be expanded to users
      const recipientIds = recipients.filter(r => r.type === 'user').map(r => r.id);
      const groupIds     = recipients.filter(r => r.type === 'group').map(r => parseInt(r.id, 10));
      return { mode, subject: subject.trim(), bodyHtml, allowReply, attachmentIds, recipientIds, groupIds };
    }

    // BCC mode
    // Expanded group chips: use their members list as individual recipients
    const recipientIds = [];
    const expandedGroupMembers = [];
    for (const r of recipients) {
      if (r.type === 'user') { recipientIds.push(r.id); }
      else if (r.type === 'group' && r.expanded && r.members?.length) {
        r.members.forEach(m => expandedGroupMembers.push({ id: m.id, userId: m.id }));
      } else if (r.type === 'group' && !r.expanded) {
        // Not expanded — backend will expand from group members
        return {
          mode, subject: subject.trim(), bodyHtml, allowReply, attachmentIds,
          recipientIds, groupIds: recipients.filter(rx => rx.type === 'group').map(rx => parseInt(rx.id, 10)),
        };
      }
    }
    return { mode, subject: subject.trim(), bodyHtml, allowReply, attachmentIds, recipientIds, expandedGroupMembers };
  };

  // ── Send ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    setError('');
    const payload = buildPayload();
    if (!payload) return;
    setSending(true);
    try {
      const data = await messageApi.send(payload);
      onSent?.(data.results);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  const currentMode = MODES.find(m => m.key === mode);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 660 }}>

        {/* Header */}
        <div className="modal-header">
          <h3>New Message</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* Mode selector */}
          <div>
            <label className="field-label">Send Mode</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              {MODES.map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { setMode(m.key); setRecipients([]); }}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${mode === m.key ? 'var(--gold)' : 'var(--divider)'}`,
                    background: mode === m.key ? 'rgba(201,169,110,0.12)' : 'none',
                    color: mode === m.key ? 'var(--gold)' : 'var(--muted)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    letterSpacing: '.04em',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              {currentMode?.desc}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="field-label">
              {mode === 'bcc' ? 'To (Private)' : mode === 'cc' ? 'To (Shared)' : 'Group / Users'}
            </label>

            {/* Chips */}
            <div className="recipient-box" style={{ flexWrap: 'wrap', minHeight: 42 }}>
              {recipients.map(r => (
                <RecipientChip
                  key={r.id}
                  item={r}
                  onRemove={() => removeRecipient(r.id)}
                  expandable={mode === 'bcc' && r.type === 'group'}
                  onExpand={() => expandGroup(r)}
                />
              ))}
              {/* Show expanded member chips for BCC groups */}
              {mode === 'bcc' && recipients.filter(r => r.type === 'group' && r.expanded).flatMap(r =>
                (r.members || []).map(m => (
                  <RecipientChip
                    key={`exp-${m.id}`}
                    item={{ ...m, label: m.label }}
                    onRemove={() => {
                      // Remove from parent group's members list
                      setRecipients(prev => prev.map(p =>
                        p.id === r.id
                          ? { ...p, members: p.members.filter(x => x.id !== m.id) }
                          : p
                      ));
                    }}
                    expandable={false}
                  />
                ))
              )}
              <RecipientInput
                selectedIds={selectedIds}
                onAdd={addRecipient}
                groups={mode === 'group_thread' || mode === 'bcc' ? groups : []}
                placeholder={
                  mode === 'group_thread'
                    ? 'Select a group…'
                    : recipients.length === 0
                    ? 'Search users or groups…'
                    : 'Add more…'
                }
              />
            </div>

            {/* BCC group expansion hint */}
            {mode === 'bcc' && recipients.some(r => r.type === 'group' && !r.expanded) && (
              <div style={{
                fontSize: 11, color: 'var(--gold-dim)', marginTop: 4,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span>⤵</span>
                <span>Click ⤵ on a group chip to expand members and send individually</span>
              </div>
            )}

            {/* CC auto-expand note */}
            {mode === 'cc' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Groups are auto-expanded in Shared mode. All members will see each other.
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="field-label">Subject</label>
            <input
              className="field-input"
              type="text"
              placeholder="Enter subject…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Message body with formatting toolbar */}
          <div>
            <label className="field-label">Message</label>
            <div className="composer-toolbar" style={{ marginBottom: 6 }}>
              <button type="button" className="fmt-btn" title="Bold"
                onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}><strong>B</strong></button>
              <button type="button" className="fmt-btn" title="Italic"
                style={{ fontStyle:'italic' }}
                onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}>I</button>
              <button type="button" className="fmt-btn" title="Underline"
                style={{ textDecoration:'underline' }}
                onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}>U</button>
              <div className="fmt-sep"/>
              <button type="button" className="fmt-btn" title="Bullet list"
                onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
                  <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
                  <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
                </svg>
              </button>
              <div className="fmt-sep"/>
              <button type="button" className="fmt-btn" title="Attach file"
                onClick={() => fileRef.current?.click()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <input ref={fileRef} type="file" multiple style={{ display:'none' }}
                accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.txt" onChange={handleFile}/>
            </div>

            <div
              ref={bodyRef}
              className="composer-area"
              contentEditable={!sending}
              suppressContentEditableWarning
              data-placeholder="Write your message…"
              style={{ minHeight: 110 }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault(); handleSend();
                }
              }}
            />
          </div>

          {/* Pending attachments */}
          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map(a => (
                <div key={a.tempId} className="composer-attach-chip">
                  {a.uploading
                    ? <span style={{ color:'var(--gold)', fontSize:11 }}>{a.progress}%</span>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                  }
                  <span>{a.name}</span>
                  <button type="button" className="composer-attach-remove"
                    onClick={() => setAttachments(prev => prev.filter(x => x.tempId !== a.tempId))}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Allow reply toggle — not shown in group_thread (always true) */}
          {mode !== 'group_thread' && (
            <div className="toggle-row">
              <div>
                <div className="toggle-label">Allow Replies</div>
                <div className="toggle-sub">Disable for broadcast-only</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={allowReply} onChange={e => setAllowReply(e.target.checked)}/>
                <span className="toggle-slider"/>
              </label>
            </div>
          )}

          {error && (
            <div style={{
              color: 'var(--danger)', fontSize: 12, padding: '7px 10px',
              background: 'rgba(192,57,43,0.1)', borderRadius: 'var(--radius)',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending}>
            {sending
              ? <><div className="spinner" style={{ width:14, height:14, borderWidth:2, display:'inline-block', marginRight:6 }}/> Sending…</>
              : 'Send Message'
            }
          </button>
        </div>
      </div>
    </div>
  );
}