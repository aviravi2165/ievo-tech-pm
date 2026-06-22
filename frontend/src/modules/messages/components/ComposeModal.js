import { useState, useRef, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { groupApi }   from '../api/groupApi';
import { fileApi }    from '../api/fileApi';
import { useAuth }    from '../../auth/AuthContext';
import api            from '../api/axiosInstance';

// ── User-search hook (debounced 240 ms) ──────────────────────────────────────
function useUserSearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!query.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/users/search', { params: { q: query, limit: 12 } });
        setResults(res.data.users || res.data || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 240);
    return () => clearTimeout(timer.current);
  }, [query]);

  return { results, loading };
}

// ── Recipient chip ────────────────────────────────────────────────────────────
function RecipientChip({ item, onRemove, onExpand, expanding, mode }) {
  const isGroup   = item.type === 'group';
  const showExpand = mode === 'bcc' && isGroup && !item.expanded;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px 3px 7px',
      background: isGroup ? 'rgba(237,28,36,0.08)' : 'var(--mid)',
      border: `1px solid ${isGroup ? 'rgba(237,28,36,0.3)' : 'transparent'}`,
      borderRadius: 4, fontSize: 12, color: 'var(--light)',
      maxWidth: 240, flexShrink: 0,
    }}>
      {isGroup && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="var(--gold)" strokeWidth="2.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
        {isGroup && item.memberCount != null && (
          <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 3 }}>
            ({item.memberCount})
          </span>
        )}
      </span>

      {/* BCC: expand-group button */}
      {showExpand && (
        <button type="button" title="Expand — send individually to each member"
          onClick={onExpand} disabled={expanding}
          style={{
            background: 'none', border: 'none',
            cursor: expanding ? 'wait' : 'pointer',
            color: 'var(--gold)', padding: '0 2px', fontSize: 13, lineHeight: 1,
            display: 'flex', alignItems: 'center',
          }}>
          {expanding ? <span style={{ fontSize: 9 }}>…</span> : '⤵'}
        </button>
      )}

      {mode === 'bcc' && isGroup && item.expanded && (
        <span style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic', marginLeft: 2 }}>
          expanded
        </span>
      )}

      <button type="button" onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: 15, lineHeight: 1,
          padding: '0 0 0 3px', transition: 'color 0.12s',
        }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
      >×</button>
    </span>
  );
}

// ── Recipient search input + dropdown ─────────────────────────────────────────
function RecipientInput({ selectedIds, onAdd, groups, mode, placeholder, currentUserId }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const { results: users, loading } = useUserSearch(query);
  const inputRef = useRef(null);
  const dropRef  = useRef(null);

  // FIX: groups shown in ALL modes (CC now shows groups — they auto-expand when added)
  // Filter out already-selected groups and the current user from user results
  const groupMatches = mode !== 'group_thread'
    ? groups.filter(g =>
        !selectedIds.has(`g-${g.groupId}`) &&
        (!query.trim() || g.groupName.toLowerCase().includes(query.toLowerCase()))
      )
    : groups.filter(g => // group_thread: only groups
        !selectedIds.has(`g-${g.groupId}`) &&
        (!query.trim() || g.groupName.toLowerCase().includes(query.toLowerCase()))
      );

  const userResults = mode !== 'group_thread'
    ? users.filter(u =>
        !selectedIds.has(String(u.userId)) &&
        String(u.userId) !== String(currentUserId)  // FIX: exclude self
      )
    : [];

  useEffect(() => {
    const h = e => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = item => {
    onAdd(item);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const hasDrop = open && (loading || groupMatches.length > 0 || userResults.length > 0 || query.trim());

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 80 }}>
      <input
        ref={inputRef}
        className="recipient-input"
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {hasDrop && (
        <div ref={dropRef} className="dropdown" style={{ zIndex: 700 }}>
          {loading && (
            <div className="dropdown-item" style={{ color: 'var(--muted)' }}>Searching…</div>
          )}
          {!loading && !groupMatches.length && !userResults.length && query.trim() && (
            <div className="dropdown-item" style={{ color: 'var(--muted)' }}>
              No results for "{query}"
            </div>
          )}
          {groupMatches.length > 0 && (
            <>
              <div style={{
                padding: '5px 14px 3px', fontSize: 10, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}>Groups</div>
              {groupMatches.map(g => (
                <div key={`g-${g.groupId}`} className="dropdown-item"
                  onMouseDown={e => {
                    e.preventDefault();
                    select({ id: `g-${g.groupId}`, _groupId: g.groupId, label: g.groupName, type: 'group', memberCount: g.memberCount });
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="var(--gold)" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  <div>
                    <div style={{ color: 'var(--light)', fontSize: 13 }}>{g.groupName}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {g.memberCount ?? 0} members
                      {mode === 'cc' && ' · will auto-expand'}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {userResults.length > 0 && (
            <>
              <div style={{
                padding: '5px 14px 3px', fontSize: 10, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}>People</div>
              {userResults.map(u => (
                <div key={String(u.userId)} className="dropdown-item"
                  onMouseDown={e => {
                    e.preventDefault();
                    select({
                      id: String(u.userId),
                      label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                      sub: u.email,
                      type: 'user',
                    });
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="var(--subtle)" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <div>
                    <div style={{ color: 'var(--light)', fontSize: 13 }}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim()}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{u.email}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modes ─────────────────────────────────────────────────────────────────────
const MODES = [
  {
    key:   'bcc',
    label: 'Private',
    hint:  'Each recipient gets their own separate thread and cannot see others. Groups can be left as-is (all members receive individually) or expanded with ⤵ to exclude specific members.',
  },
  {
    key:   'cc',
    label: 'Shared',
    hint:  'One shared thread. Everyone can see replies and each other. Groups auto-expand into individual members. You can remove any participant after sending.',
  },
  {
    key:   'group_thread',
    label: 'Group Chat',
    hint:  'Posts into a group\'s shared conversation. All group members participate. Use this for team discussions.',
  },
];

// ── Main ComposeModal ─────────────────────────────────────────────────────────
export default function ComposeModal({ onClose, onSent, groups = [], initialRecipients = [] }) {
  const { user } = useAuth();
  const currentUserId = user?.userId;

  const [mode,        setMode]        = useState('bcc');
  const [recipients,  setRecipients]  = useState(() => initialRecipients || []);
  const [subject,     setSubject]     = useState('');
  const [allowReply,  setAllowReply]  = useState(true);
  const [sending,     setSending]     = useState(false);
  const [error,       setError]       = useState('');
  const [attachments, setAttachments] = useState([]);
  const [expanding,   setExpanding]   = useState({});

  const bodyRef = useRef(null);
  const fileRef = useRef(null);

  // Set initial recipients when provided (e.g. pre-filled from group card)
  useEffect(() => {
    if (initialRecipients?.length) setRecipients(initialRecipients);
  }, []); // eslint-disable-line

  // Deduplication set for the search dropdown
  const selectedIds = new Set(
    recipients.flatMap(r => {
      if (r.type === 'group') {
        if (r.expanded && r.members?.length)
          return [r.id, ...r.members.map(m => String(m.id))];
        return [r.id];
      }
      return [String(r.id)];
    })
  );

  // ── Mode change ────────────────────────────────────────────────────────────
  const handleModeChange = async (newMode) => {
    setMode(newMode);
    setError('');
    if (newMode === 'cc') {
      // Auto-expand all group chips currently in the list
      const groupChips = recipients.filter(r => r.type === 'group');
      for (const g of groupChips) await doExpandGroup(g, true);
    }
    if (newMode === 'group_thread') {
      // Keep only group chips
      setRecipients(prev => prev.filter(r => r.type === 'group'));
    }
  };

  // ── Expand group chip into individual member chips ─────────────────────────
  // replace=true: replaces the group chip with member chips (CC mode / explicit)
  // replace=false: marks the chip as expanded, stores members as sub-list (BCC)
  const doExpandGroup = useCallback(async (groupItem, replace) => {
    const chipId = groupItem.id; // `g-${groupId}` string
    setExpanding(prev => ({ ...prev, [chipId]: true }));
    try {
      const numericId = groupItem._groupId ?? parseInt(String(chipId).replace('g-', ''), 10);
      const members   = await groupApi.getMembers(numericId);
      const chips     = members
        .filter(m => String(m.userId) !== String(currentUserId)) // FIX: exclude sender
        .map(m => ({
          id:        String(m.userId),
          label:     `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email,
          sub:       m.email,
          type:      'user',
          fromGroup: groupItem.label,
        }));

      if (replace) {
        setRecipients(prev => {
          const without = prev.filter(r => r.id !== chipId);
          const newOnes = chips.filter(c => !without.find(p => p.id === c.id));
          return [...without, ...newOnes];
        });
      } else {
        setRecipients(prev =>
          prev.map(r => r.id === chipId ? { ...r, expanded: true, members: chips } : r)
        );
      }
    } catch {
      setError(`Failed to expand group "${groupItem.label}". Try again.`);
    } finally {
      setExpanding(prev => ({ ...prev, [chipId]: false }));
    }
  }, [currentUserId]);

  // ── Add recipient ──────────────────────────────────────────────────────────
  const addRecipient = useCallback(async (item) => {
    if (selectedIds.has(item.id)) return; // dedupe
    if (item.type === 'group' && mode === 'cc') {
      await doExpandGroup(item, true);
      return;
    }
    setRecipients(prev => [...prev, item]);
  }, [selectedIds, mode, doExpandGroup]); // eslint-disable-line

  // ── Remove recipient ───────────────────────────────────────────────────────
  const removeRecipient = useCallback((id) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  }, []);

  // ── Formatting toolbar ─────────────────────────────────────────────────────
  const execCmd = (cmd) => { bodyRef.current?.focus(); document.execCommand(cmd, false, null); };

  // ── File upload ────────────────────────────────────────────────────────────
  const ALLOWED = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'text/plain',
  ];

  const handleFile = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) { setError(`File type not allowed: ${file.name}`); continue; }
      if (file.size > 25 * 1024 * 1024) { setError(`File too large (max 25 MB): ${file.name}`); continue; }
      setError('');
      const tempId = `tmp_${Date.now()}_${file.name}`;
      setAttachments(prev => [...prev, { tempId, name: file.name, uploading: true, progress: 0 }]);
      try {
        const result = await fileApi.upload(file, pct =>
          setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, progress: pct } : a))
        );
        setAttachments(prev =>
          prev.map(a => a.tempId === tempId ? { ...a, uploading: false, attachmentId: result.attachmentId } : a)
        );
      } catch {
        setError(`Upload failed: ${file.name}`);
        setAttachments(prev => prev.filter(a => a.tempId !== tempId));
      }
    }
  };

  // ── Build payload ──────────────────────────────────────────────────────────
  const buildPayload = () => {
    const bodyHtml = bodyRef.current?.innerHTML?.trim();
    if (!bodyHtml || bodyHtml === '<br>') { setError('Message body is required.'); return null; }
    if (!subject.trim())                  { setError('Subject is required.');       return null; }
    if (!recipients.length)               { setError('Add at least one recipient.'); return null; }
    if (attachments.some(a => a.uploading)) { setError('Wait for file uploads to finish.'); return null; }

    const attachmentIds = attachments.filter(a => a.attachmentId).map(a => a.attachmentId);
    const base = { subject: subject.trim(), bodyHtml, allowReply, attachmentIds, mode };

    if (mode === 'group_thread') {
      const groupIds = recipients
        .filter(r => r.type === 'group')
        .map(r => r._groupId ?? parseInt(String(r.id).replace('g-', ''), 10));
      if (!groupIds.length) { setError('Select at least one group.'); return null; }
      return { ...base, groupIds, recipientIds: [] };
    }

    if (mode === 'cc') {
      const recipientIds = recipients
        .filter(r => r.type === 'user' && String(r.id) !== String(currentUserId))
        .map(r => r.id);
      const groupIds = recipients
        .filter(r => r.type === 'group')
        .map(r => r._groupId ?? parseInt(String(r.id).replace('g-', ''), 10));
      if (!recipientIds.length && !groupIds.length) {
        setError('Add at least one recipient.'); return null;
      }
      return { ...base, recipientIds, groupIds };
    }

    // BCC
    const recipientIds         = [];
    const groupIds             = [];
    const expandedGroupMembers = [];

    for (const r of recipients) {
      if (r.type === 'user') {
        if (String(r.id) !== String(currentUserId)) recipientIds.push(r.id);
      } else if (r.type === 'group') {
        if (r.expanded && r.members?.length) {
          r.members.forEach(m => {
            if (String(m.id) !== String(currentUserId))
              expandedGroupMembers.push({ id: m.id, userId: m.id });
          });
        } else {
          groupIds.push(r._groupId ?? parseInt(String(r.id).replace('g-', ''), 10));
        }
      }
    }

    if (!recipientIds.length && !groupIds.length && !expandedGroupMembers.length) {
      setError('Add at least one recipient.'); return null;
    }
    return { ...base, recipientIds, groupIds, expandedGroupMembers };
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    setError('');
    const payload = buildPayload();
    if (!payload) return;
    setSending(true);
    try {
      const data    = await messageApi.send(payload);
      const results = Array.isArray(data) ? data : (data.results || []);
      onSent?.(results);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to send. Try again.');
    } finally {
      setSending(false);
    }
  };

  const currentModeObj = MODES.find(m => m.key === mode) || MODES[0];

  // Flat chip list — for BCC, expanded group members shown inline below group chip
  const chipRows = [];
  for (const r of recipients) {
    chipRows.push({ ...r, _isParent: true });
    if (mode === 'bcc' && r.type === 'group' && r.expanded && r.members?.length) {
      chipRows.push(...r.members.map(m => ({ ...m, _fromGroup: r.id })));
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 700, maxWidth: '96vw' }}>

        {/* Header */}
        <div className="modal-header">
          <h3>New Message</h3>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">

          {/* Mode selector */}
          <div>
            <label className="field-label">Send Mode</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {MODES.map(m => (
                <button key={m.key} type="button"
                  onClick={() => handleModeChange(m.key)}
                  style={{
                    flex: 1, padding: '7px 10px',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${mode === m.key ? 'var(--gold)' : 'var(--divider)'}`,
                    background: mode === m.key ? 'rgba(237,28,36,0.08)' : 'none',
                    color: mode === m.key ? 'var(--gold)' : 'var(--muted)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    letterSpacing: '.04em', transition: 'all 0.15s',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--muted)',
              padding: '6px 10px',
              background: 'var(--slate)', border: '1px solid var(--divider)',
              borderRadius: 'var(--radius)', lineHeight: 1.55,
            }}>
              {currentModeObj.hint}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="field-label">
              {mode === 'bcc' && 'To — Private (separate threads per recipient)'}
              {mode === 'cc' && 'To — Shared thread (everyone sees each other)'}
              {mode === 'group_thread' && 'Group(s)'}
            </label>
            <div className="recipient-box"
              style={{ flexWrap: 'wrap', minHeight: 46, alignItems: 'flex-start', paddingTop: 8 }}>
              {chipRows.map(r => {
                const isSubMember = !!r._fromGroup;
                return (
                  <RecipientChip
                    key={isSubMember ? `sub-${r.id}` : r.id}
                    item={r}
                    mode={mode}
                    expanding={!!expanding[r.id]}
                    onExpand={() => doExpandGroup(r, false)}
                    onRemove={() => {
                      if (isSubMember) {
                        setRecipients(prev => prev.map(p =>
                          p.id === r._fromGroup
                            ? { ...p, members: (p.members || []).filter(m => m.id !== r.id) }
                            : p
                        ));
                      } else {
                        removeRecipient(r.id);
                      }
                    }}
                  />
                );
              })}
              <RecipientInput
                selectedIds={selectedIds}
                onAdd={addRecipient}
                groups={groups}
                mode={mode}
                currentUserId={currentUserId}
                placeholder={
                  mode === 'group_thread' ? 'Select a group…'
                  : recipients.length === 0 ? 'Search users or groups…'
                  : 'Add more…'
                }
              />
            </div>
            {mode === 'bcc' && recipients.some(r => r.type === 'group' && !r.expanded) && (
              <div style={{ fontSize: 11, color: 'var(--gold-dim)', marginTop: 5 }}>
                ⤵ Click ⤵ on a group chip to expand and exclude specific members before sending.
              </div>
            )}
            {mode === 'cc' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                Groups auto-expand into members when added. Remove individuals with ×.
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="field-label">Subject</label>
            <input className="field-input" type="text"
              placeholder="What is this about?"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Message body */}
          <div>
            <label className="field-label">Message</label>
            <div className="composer-toolbar" style={{ marginBottom: 6 }}>
              <button type="button" className="fmt-btn" title="Bold"
                onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}>
                <strong>B</strong>
              </button>
              <button type="button" className="fmt-btn" title="Italic"
                style={{ fontStyle: 'italic' }}
                onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}>I</button>
              <button type="button" className="fmt-btn" title="Underline"
                style={{ textDecoration: 'underline' }}
                onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}>U</button>
              <div className="fmt-sep"/>
              {/* FIX: bullet list */}
              <button type="button" className="fmt-btn" title="Bullet list"
                onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <line x1="9" y1="6" x2="20" y2="6"/>
                  <line x1="9" y1="12" x2="20" y2="12"/>
                  <line x1="9" y1="18" x2="20" y2="18"/>
                  <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
                  <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
                </svg>
              </button>
              {/* FIX: numbered list — was missing */}
              <button type="button" className="fmt-btn" title="Numbered list"
                onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList'); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <line x1="10" y1="6"  x2="21" y2="6"/>
                  <line x1="10" y1="12" x2="21" y2="12"/>
                  <line x1="10" y1="18" x2="21" y2="18"/>
                  <text x="2" y="8"  fontSize="7" fill="currentColor" stroke="none">1.</text>
                  <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2.</text>
                  <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3.</text>
                </svg>
              </button>
              <div className="fmt-sep"/>
              <button type="button" className="fmt-btn" title="Attach file"
                onClick={() => fileRef.current?.click()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
                accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.txt"
                onChange={handleFile}/>
            </div>

            <div
              ref={bodyRef}
              className="composer-area"
              contentEditable={!sending}
              suppressContentEditableWarning
              data-placeholder="Write your message… (Ctrl+Enter to send)"
              style={{ minHeight: 130 }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault(); handleSend();
                  return;
                }
                // FIX: same manual line-break normalization as Composer.js
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  document.execCommand('insertLineBreak');
                }
              }}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map(a => (
                <div key={a.tempId} className="composer-attach-chip">
                  {a.uploading
                    ? <span style={{ color: 'var(--gold)', fontSize: 11 }}>{a.progress}%</span>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="var(--success)" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                  }
                  <span>{a.name}</span>
                  <button type="button" className="composer-attach-remove"
                    onClick={() => setAttachments(p => p.filter(x => x.tempId !== a.tempId))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Allow reply */}
          {mode !== 'group_thread' && (
            <div className="toggle-row">
              <div>
                <div className="toggle-label">Allow Replies</div>
                <div className="toggle-sub">Disable for broadcast-only announcements</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={allowReply}
                  onChange={e => setAllowReply(e.target.checked)}/>
                <span className="toggle-slider"/>
              </label>
            </div>
          )}

          {error && (
            <div style={{
              color: 'var(--danger)', fontSize: 12,
              padding: '8px 12px',
              background: 'rgba(196,24,31,0.08)',
              border: '1px solid rgba(196,24,31,0.25)',
              borderRadius: 'var(--radius)',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ctrl+Enter to send</span>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <div className="spinner" style={{
                  width: 13, height: 13, borderWidth: 2,
                  display: 'inline-block', marginRight: 6, verticalAlign: 'middle',
                }}/>
                Sending…
              </>
            ) : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}