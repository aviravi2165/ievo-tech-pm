import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@emotion/react';
import { messageApi } from '../api/messageApi';
import { orgGroupApi } from '../api/orgGroupApi';
import { fileApi }    from '../api/fileApi';
import { useAuth }    from '../../auth/AuthContext';
import { useOrgGroups } from '../hooks/useOrgGroups';
import api            from '../api/axiosInstance';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '../api/allowedFileTypes';
import { IconBtn, Btn, BtnGhost, BtnPrimary, FieldLabel, FieldInput, Dropdown, DropdownItem, Spinner, Req } from '../styles/shared.styles';
import { RecipientBox } from '../styles/RecipientPicker.styles';
import { Toolbar, FmtBtn, FmtSep, ComposerArea, ComposerAttachments, ComposerAttachChip, ComposerAttachRemove } from '../styles/Composer.styles';
import {
  ModalOverlay, ModalCard, ModalHeader, ModalBody, ModalFooter,
  ModeBtnRow, ModeBtn, ModeHint, HelperNote, ErrorBox, FooterHint,
  ToggleRow, ToggleLabel, ToggleSub, ToggleSwitch,
  Chip, ChipMemberCount, ChipExpandBtn, ChipExpandedTag, ChipRemoveBtn,
  DropdownGroupLabel,
} from '../styles/ComposeModal.styles';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

// ── User-search hook (debounced 240 ms) ──────────────────────────────────────
// Fetches on an empty query too (not just once you start typing) — the
// backend already returns a sensible default list for q='' (same pattern
// PM's UserSearchInput uses on focus), so People should appear right away
// in the dropdown same as Teams do, not only after typing a character.
function useUserSearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
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
// A team ("Production Team") stays collapsed as one chip by default in
// EITHER mode — left alone, every member gets added (individually in
// Private, into the one shared thread in Shared — the backend just starts
// it with everyone in the team, see buildPayload). The ⤵ button expands it
// into removable per-member chips only for when you actually need to
// exclude someone from that particular send.
function RecipientChip({ item, onRemove, onExpand, expanding }) {
  const isTeam     = item.type === 'group';
  const showExpand = isTeam && !item.expanded;

  return (
    <Chip isGroup={isTeam}>
      {isTeam && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" style={{ color: 'inherit' }}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
        {isTeam && item.memberCount != null && (
          <ChipMemberCount>({item.memberCount})</ChipMemberCount>
        )}
      </span>

      {showExpand && (
        <ChipExpandBtn type="button" title="Expand — exclude specific members"
          onClick={onExpand} disabled={expanding}>
          {expanding ? <span style={{ fontSize: 9 }}>…</span> : '⤵'}
        </ChipExpandBtn>
      )}

      {isTeam && item.expanded && (
        <ChipExpandedTag>expanded</ChipExpandedTag>
      )}

      <ChipRemoveBtn type="button" onClick={onRemove}>×</ChipRemoveBtn>
    </Chip>
  );
}

// ── Recipient search input + dropdown ─────────────────────────────────────────
// `teams` — admin-managed org_groups (e.g. "Production Team"), NOT
// comm_groups chat groups (those no longer appear in the composer at all —
// see ComposeModal's top-level comment). Selecting one behaves exactly like
// the old chat-group chip did: collapses to one chip in Private mode (⤵ to
// expand and exclude someone), auto-expands to individual member chips
// immediately in Shared mode (see addTeam/doExpandTeam in ComposeModal).
function RecipientInput({ selectedIds, onAdd, onAddTeam, teams, mode, placeholder, currentUserId }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const [rect,  setRect]  = useState(null);
  const { results: users, loading } = useUserSearch(query);
  const inputRef = useRef(null);
  const dropRef  = useRef(null);

  const groupMatches = mode !== 'group_thread'
    ? teams.filter(g =>
        !selectedIds.has(`g-${g.orgGroupId}`) &&
        (!query.trim() || g.name.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  const userResults = mode !== 'group_thread'
    ? users.filter(u =>
        !selectedIds.has(String(u.userId)) &&
        String(u.userId) !== String(currentUserId)
      )
    : [];

  const updateRect = useCallback(() => {
    if (inputRef.current) {
      setRect(inputRef.current.getBoundingClientRect());
    }
  }, []);

  useEffect(() => {
    const h = e => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Update position dynamically when scrolling or resizing
  useEffect(() => {
    if (open) {
      updateRect();
      window.addEventListener('scroll', updateRect, true); // true catches scroll events from parent containers
      window.addEventListener('resize', updateRect);
      return () => {
        window.removeEventListener('scroll', updateRect, true);
        window.removeEventListener('resize', updateRect);
      };
    }
  }, [open, updateRect]);

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
        style={{
          width: '100%', flex: 1, minWidth: 80, background: 'none', border: 'none', outline: 'none',
          color: theme.colors.onyx, fontFamily: theme.font.body, fontSize: 11,
        }}
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); updateRect(); }}
        onFocus={() => { setOpen(true); updateRect(); }}
      />
      {hasDrop && rect && createPortal(
        <Dropdown ref={dropRef} style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(rect.width, 240), // Provide a sensible min-width
          zIndex: 9999, // Safely above the modal's z-index
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          {loading && <DropdownItem style={{ color: theme.colors.ash }}>Searching…</DropdownItem>}
          {!loading && !groupMatches.length && !userResults.length && query.trim() && (
            <DropdownItem style={{ color: theme.colors.ash }}>No results for "{query}"</DropdownItem>
          )}
          {groupMatches.length > 0 && (
            <>
              <DropdownGroupLabel>Teams</DropdownGroupLabel>
              {groupMatches.map(g => (
                <DropdownItem key={`t-${g.orgGroupId}`}
                  onMouseDown={e => {
                    e.preventDefault();
                    onAddTeam(g);
                    setQuery(''); setOpen(false); inputRef.current?.focus();
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke={theme.colors.espresso} strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  <div>
                    <div style={{ color: theme.colors.onyx, fontSize: 13 }}>{g.name}</div>
                    <div style={{ color: theme.colors.ash, fontSize: 11 }}>
                      {g.memberCount ?? 0} member{g.memberCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </DropdownItem>
              ))}
            </>
          )}
          {userResults.length > 0 && (
            <>
              <DropdownGroupLabel>People</DropdownGroupLabel>
              {userResults.map(u => (
                <DropdownItem key={String(u.userId)}
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
                    stroke={theme.colors.ashLight} strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <div>
                    <div style={{ color: theme.colors.onyx, fontSize: 13 }}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim()}
                    </div>
                    <div style={{ color: theme.colors.ash, fontSize: 11 }}>{u.email}</div>
                  </div>
                </DropdownItem>
              ))}
            </>
          )}
        </Dropdown>,
        document.body
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
    hint:  'One shared thread. Everyone can see replies and each other. Teams can be left as-is (everyone starts in the thread) or expanded with ⤵ to exclude specific members.',
  },
];

// ── Main ComposeModal ─────────────────────────────────────────────────────────
export default function ComposeModal({ onClose, onSent, initialRecipients = [], initialMode = 'bcc' }) {
  const theme = useTheme();
  const { orgGroups: teams = [] } = useOrgGroups();
  const { user } = useAuth();
  const currentUserId = user?.userId;

  const [mode,        setMode]        = useState(initialMode || 'bcc');
  const [recipients,  setRecipients]  = useState(() => initialRecipients || []);
  const [subject,     setSubject]     = useState('');
  const [allowReply,  setAllowReply]  = useState(true);
  const [sending,     setSending]     = useState(false);
  const [error,       setError]       = useState('');
  const [attachments, setAttachments] = useState([]);
  const [expanding,   setExpanding]   = useState({});

  const bodyRef = useRef(null);
  const fileRef = useRef(null);

  useEscapeKey(onClose);

  useEffect(() => {
    if (initialRecipients?.length) setRecipients(initialRecipients);
    if (initialMode) setMode(initialMode);
  }, []); // eslint-disable-line

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

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setError('');
    if (newMode === 'group_thread') {
      setRecipients([]);
    }
  };

  // Fetches a team's members and marks the existing team chip `expanded`,
  // attaching its member list as removable sub-chips — the ⤵ button,
  // available in both Private and Shared mode, only for when you need to
  // exclude specific people before sending. Left un-expanded in either
  // mode, buildPayload still resolves and sends to every member (the
  // backend starts a single shared thread with everyone for Shared, or a
  // separate thread per person for Private — same as it always has for a
  // flat recipient list; a team is just a shortcut for typing them all in).
  const doExpandTeam = useCallback(async (teamItem) => {
    const chipId = teamItem.id;
    setExpanding(prev => ({ ...prev, [chipId]: true }));
    try {
      const numericId = teamItem._groupId ?? parseInt(String(chipId).replace('g-', ''), 10);
      const members   = await orgGroupApi.getMembers(numericId);
      const chips     = members
        .filter(m => String(m.userId) !== String(currentUserId))
        .map(m => ({
          id:        String(m.userId),
          label:     `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email,
          sub:       m.email,
          type:      'user',
          fromGroup: teamItem.label,
        }));

      setRecipients(prev => {
        const standaloneIds = new Set(
          prev.filter(r => r.id !== chipId && r.type === 'user').map(r => String(r.id))
        );
        const dedupedChips = chips.filter(c => !standaloneIds.has(String(c.id)));
        return prev.map(r => r.id === chipId ? { ...r, expanded: true, members: dedupedChips } : r);
      });
    } catch {
      setError(`Failed to expand team "${teamItem.label}". Try again.`);
    } finally {
      setExpanding(prev => ({ ...prev, [chipId]: false }));
    }
  }, [currentUserId]);

  // Selecting a team from the dropdown always adds it as ONE collapsed
  // chip, in either mode — members are resolved lazily, either by clicking
  // ⤵ to exclude someone, or, if left as-is, at send time in buildPayload.
  const addTeam = useCallback((team) => {
    const item = { id: `g-${team.orgGroupId}`, _groupId: team.orgGroupId, label: team.name, type: 'group', memberCount: team.memberCount };
    if (selectedIds.has(item.id)) return;
    setRecipients(prev => [...prev, item]);
  }, [selectedIds]);

  const addRecipient = useCallback((item) => {
    if (selectedIds.has(String(item.id))) return;
    setRecipients(prev => [...prev, item]);
  }, [selectedIds]);

  const removeRecipient = useCallback((id) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  }, []);

  const execCmd = (cmd) => { bodyRef.current?.focus(); document.execCommand(cmd, false, null); };

  const handleFile = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`File too large (max ${MAX_FILE_SIZE_MB} MB): ${file.name}`);
        continue;
      }
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

  // A team chip left un-expanded still has to resolve to real recipients —
  // there's no backend concept of an org_group_id the way there is for a
  // real comm_groups chat group, so this is resolved client-side at send
  // time instead of relying on server-side group expansion. An expanded
  // chip already has its (possibly exclusion-edited) member list cached
  // from doExpandTeam, so this only fetches for the ones still collapsed.
  const resolveTeamMemberIds = async (teamRecipients) => {
    const ids = [];
    for (const r of teamRecipients) {
      if (r.expanded && r.members?.length) {
        r.members.forEach(m => { if (String(m.id) !== String(currentUserId)) ids.push(m.id); });
      } else {
        const numericId = r._groupId ?? parseInt(String(r.id).replace('g-', ''), 10);
        const members = await orgGroupApi.getMembers(numericId);
        members.forEach(m => { if (String(m.userId) !== String(currentUserId)) ids.push(String(m.userId)); });
      }
    }
    return ids;
  };

  const buildPayload = async () => {
    const bodyHtml = bodyRef.current?.innerHTML?.trim();
    if (!bodyHtml || bodyHtml === '<br>') { setError('Message body is required.'); return null; }
    if (!subject.trim())                  { setError('Subject is required.');       return null; }
    if (!recipients.length)               { setError('Add at least one recipient.'); return null; }
    if (attachments.some(a => a.uploading)) { setError('Wait for file uploads to finish.'); return null; }

    if (mode === 'group_thread') {
      // Unreachable via the current UI (no button selects this mode, and
      // teams have no conversation to post into) — kept only so an
      // existing initialMode='group_thread' caller fails with a clear
      // message instead of silently sending to the wrong place.
      setError('Select at least one group.'); return null;
    }

    const attachmentIds = attachments.filter(a => a.attachmentId).map(a => a.attachmentId);
    const base = { subject: subject.trim(), bodyHtml, allowReply, attachmentIds, mode };

    const userIds = recipients
      .filter(r => r.type === 'user' && String(r.id) !== String(currentUserId))
      .map(r => r.id);
    const teamIds = await resolveTeamMemberIds(recipients.filter(r => r.type === 'group'));
    const recipientIds = [...new Set([...userIds, ...teamIds])];

    if (!recipientIds.length) { setError('Add at least one recipient.'); return null; }
    return { ...base, recipientIds, groupIds: [] };
  };

  const handleSend = async () => {
    setError('');
    setSending(true);
    try {
      const payload = await buildPayload();
      if (!payload) { setSending(false); return; }
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

  // An expanded team chip shows its member list as removable sub-rows
  // underneath (the exclude-someone flow) — same in either mode now;
  // everything else (individual users, unexpanded team chips) is flat.
  const chipRows = [];
  for (const r of recipients) {
    chipRows.push({ ...r, _isParent: true });
    if (r.type === 'group' && r.expanded && r.members?.length) {
      chipRows.push(...r.members.map(m => ({ ...m, _fromGroup: r.id })));
    }
  }

  return (
    <ModalOverlay onClick={e => e.target === e.currentTarget && onClose()}>
      <ModalCard width={700}>

        {/* Header */}
        <ModalHeader>
          <h3>New Message</h3>
          <IconBtn type="button" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </IconBtn>
        </ModalHeader>

        {/* Body */}
        <ModalBody>

          {/* Mode selector */}
          <div>
            <FieldLabel>Send Mode</FieldLabel>
            <ModeBtnRow>
              {MODES.map(m => (
                <ModeBtn key={m.key} type="button" active={mode === m.key} onClick={() => handleModeChange(m.key)}>
                  {m.label}
                </ModeBtn>
              ))}
            </ModeBtnRow>
            <ModeHint>{currentModeObj.hint}</ModeHint>
          </div>

          {/* Recipients */}
          <div>
            <FieldLabel>
              {mode === 'bcc' && 'To — Private (separate threads per recipient)'}
              {mode === 'cc' && 'To — Shared thread (everyone sees each other)'}
              {mode === 'group_thread' && 'Group(s)'}
              <Req>*</Req>
            </FieldLabel>
            <RecipientBox
              // Clicking anywhere in the box focuses its input. The
              // previous `e.target === e.currentTarget` guard only caught
              // clicks landing on the box's own background — chip gaps and
              // the input's own flex-item wrapper (which doesn't
              // necessarily stretch to fill the box's full padded area)
              // still had dead space that ate 1-2 clicks before one
              // happened to land exactly on the box or the input itself.
              // Focusing unconditionally on any click within the box is
              // harmless even when the click was really meant for a chip's
              // remove/expand button — those are real <button> elements
              // with their own onClick that still fires; this just also
              // focuses the input as a side effect, which doesn't block or
              // change that.
              onClick={e => e.currentTarget.querySelector('input')?.focus()}
              style={{ flexWrap: 'wrap', minHeight: 46, maxHeight: 120, overflowY: 'auto', alignItems: 'flex-start', paddingTop: 8, cursor: 'text' }}>
              {chipRows.map(r => {
                const isSubMember = !!r._fromGroup;
                return (
                  <RecipientChip
                    key={isSubMember ? `sub-${r.id}` : r.id}
                    item={r}
                    expanding={!!expanding[r.id]}
                    onExpand={() => doExpandTeam(r)}
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
                onAddTeam={addTeam}
                teams={teams}
                mode={mode}
                currentUserId={currentUserId}
                placeholder={
                  mode === 'group_thread' ? 'Select a group…'
                  : recipients.length === 0 ? 'Search users or teams…'
                  : 'Add more…'
                }
              />
            </RecipientBox>
            {recipients.some(r => r.type === 'group' && !r.expanded) && (
              <HelperNote warn>⤵ Click ⤵ on a team chip to expand and exclude specific members before sending. Left as-is, everyone in the team is included.</HelperNote>
            )}
          </div>

          {/* Subject */}
          <div>
            <FieldLabel>Subject<Req>*</Req></FieldLabel>
            <FieldInput type="text"
              placeholder="What is this about?"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Message body */}
          <div>
            <FieldLabel>Message</FieldLabel>
            <Toolbar style={{ marginBottom: 6 }}>
              <FmtBtn type="button" title="Bold"
                onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}>
                <strong>B</strong>
              </FmtBtn>
              <FmtBtn type="button" title="Italic"
                style={{ fontStyle: 'italic' }}
                onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}>I</FmtBtn>
              <FmtBtn type="button" title="Underline"
                style={{ textDecoration: 'underline' }}
                onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}>U</FmtBtn>
              <FmtSep/>
              <FmtBtn type="button" title="Bullet list"
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
              </FmtBtn>
              <FmtBtn type="button" title="Numbered list"
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
              </FmtBtn>
              <FmtSep/>
              <FmtBtn type="button" title="Attach file"
                onClick={() => fileRef.current?.click()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </FmtBtn>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
                onChange={handleFile}/>
            </Toolbar>

            <ComposerArea
              ref={bodyRef}
              contentEditable={!sending}
              suppressContentEditableWarning
              data-placeholder="Write your message… (Ctrl+Enter to send)"
              style={{ minHeight: 130 }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault(); handleSend();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  let node = window.getSelection()?.anchorNode;
                  while (node) {
                    if (node.nodeType === 1 && ['LI', 'UL', 'OL'].includes(node.nodeName)) return;
                    node = node.parentNode;
                  }
                  e.preventDefault();
                  document.execCommand('insertLineBreak');
                }
              }}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <ComposerAttachments>
              {attachments.map(a => (
                <ComposerAttachChip key={a.tempId}>
                  {a.uploading
                    ? <span style={{ color: theme.colors.copper, fontSize: 11 }}>{a.progress}%</span>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke={theme.colors.success} strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                  }
                  <span>{a.name}</span>
                  <ComposerAttachRemove type="button"
                    onClick={() => setAttachments(p => p.filter(x => x.tempId !== a.tempId))}>
                    ×
                  </ComposerAttachRemove>
                </ComposerAttachChip>
              ))}
            </ComposerAttachments>
          )}

          {/* Allow reply */}
          {mode !== 'group_thread' && (
            <ToggleRow>
              <div>
                <ToggleLabel>Allow Replies</ToggleLabel>
                <ToggleSub>Disable for broadcast-only announcements</ToggleSub>
              </div>
              <ToggleSwitch>
                <input type="checkbox" checked={allowReply}
                  onChange={e => setAllowReply(e.target.checked)}/>
                <span className="slider"/>
              </ToggleSwitch>
            </ToggleRow>
          )}

          {error && <ErrorBox>{error}</ErrorBox>}
        </ModalBody>

        {/* Footer */}
        <ModalFooter>
          <FooterHint>Ctrl+Enter to send</FooterHint>
          <BtnGhost type="button" onClick={onClose} disabled={sending}>
            Cancel
          </BtnGhost>
          <BtnPrimary type="button" onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Spinner style={{
                  width: 13, height: 13, borderWidth: 2,
                  display: 'inline-block', marginRight: 6, verticalAlign: 'middle',
                }}/>
                Sending…
              </>
            ) : 'Send'}
          </BtnPrimary>
        </ModalFooter>
      </ModalCard>
    </ModalOverlay>
  );
}
