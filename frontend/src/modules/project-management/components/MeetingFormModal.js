import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { meetingAttendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { X } from 'lucide-react';
import { ModalOverlay, Modal, Field, ModalFooter, BtnPrimary, BtnGhost, MemberRow } from '../styles/shared.styles';
import UserSearchInput from './UserSearchInput';

const userName = (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;

function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * MeetingFormModal — Add Meeting (mode="create") or Edit Meeting
 * (mode="edit", pre-filled from `meeting`). Manager-only (the tab already
 * gates who ever gets a way to open this).
 *
 * Member selection: on create, ONLY the creating manager starts checked
 * (if they're a project member) — everyone else is added deliberately by
 * searching or scrolling and checking. On edit, the meeting's current
 * project-sourced roster starts checked. Member add/remove on edit goes
 * through a separate call (updateMembers) right after the title/date/
 * description save.
 */
export default function MeetingFormModal({ mode, projectId, projectMembers, meeting, currentMemberIds, myUserId, onClose, onSaved }) {
  const theme = useTheme();
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState(meeting?.title || '');
  const [date, setDate] = useState(meeting?.meetingDate ? String(meeting.meetingDate).slice(0, 10) : todayStr());
  const [description, setDescription] = useState(meeting?.description || '');
  const [selected, setSelected] = useState(() => {
    if (isEdit) return new Set((currentMemberIds || []).map(String));
    const me = projectMembers.find(m => String(m.userId) === String(myUserId));
    return new Set(me ? [String(me.userId)] : []);
  });
  const [search, setSearch] = useState('');
  // Create mode only: meeting-only guests (any other active user — added to
  // this meeting, never to the project). Same thing "+ Add Guest
  // Participant" does inside a meeting; on edit, guests are managed there.
  const [guests, setGuests] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) setSelected(new Set((currentMemberIds || []).map(String)));
  }, [isEdit, currentMemberIds]);

  // People already checked when the modal opened are listed first (the
  // creator on create, the current roster on edit). Order is fixed at open
  // time so rows don't jump around while you check/uncheck.
  const orderedMembers = useMemo(() => {
    const initiallySelected = new Set(selected);
    return [...projectMembers].sort((a, b) => {
      const sa = initiallySelected.has(String(a.userId)) ? 0 : 1;
      const sb = initiallySelected.has(String(b.userId)) ? 0 : 1;
      return sa - sb || (a.name || '').localeCompare(b.name || '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectMembers]);

  const q = search.trim().toLowerCase();
  const visibleMembers = q
    ? orderedMembers.filter(m => (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q))
    : orderedMembers;

  const toggle = (userId) => {
    setSelected(prev => {
      const next = new Set(prev);
      const key = String(userId);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(prev => new Set([...prev, ...visibleMembers.map(m => String(m.userId))]));
  const clearAll = () => setSelected(new Set());

  const addGuest = (user) => {
    if (!user) return;
    setGuests(prev => (prev.some(g => String(g.userId) === String(user.userId)) ? prev : [...prev, user]));
  };
  const removeGuest = (userId) => setGuests(prev => prev.filter(g => String(g.userId) !== String(userId)));

  const submit = async () => {
    if (!title.trim()) { setError('Meeting title is required.'); return; }
    if (!date) { setError('Meeting date is required.'); return; }
    if (isEdit && selected.size === 0) { setError('Select at least one project member.'); return; }
    if (!isEdit && selected.size === 0 && guests.length === 0) { setError('Add at least one participant.'); return; }
    setSubmitting(true); setError('');
    try {
      const memberIds = [...selected];
      if (isEdit) {
        await meetingAttendanceApi.update(projectId, meeting.meetingId, { title: title.trim(), meetingDate: date, description: description.trim() || null });
        await meetingAttendanceApi.updateMembers(projectId, meeting.meetingId, memberIds);
        showToast('Meeting updated.', 'success');
        onSaved?.(meeting.meetingId);
      } else {
        const created = await meetingAttendanceApi.create(projectId, {
          title: title.trim(), meetingDate: date, description: description.trim() || null,
          memberIds, guestIds: guests.map(g => g.userId),
        });
        showToast('Meeting created.', 'success');
        onSaved?.(created.meeting.meetingId);
      }
      onClose();
    } catch (err) { setError(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} the meeting.`)); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal style={{ maxWidth: 480 }}>
        <h3>{isEdit ? 'Edit meeting' : 'Add meeting'}</h3>

        <Field>
          <label>Meeting title / purpose <span className="req">*</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly Project Review" maxLength={200} />
        </Field>

        <Field>
          <label>Meeting date <span className="req">*</span></label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>

        <Field>
          <label>Description / remarks (optional)</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this meeting about?" maxLength={1000} />
        </Field>

        {/* Deliberately NOT inside <Field>: Field's generic `label` (block,
            uppercase) and `input` (width:100%) rules were hitting each member
            row's label/checkbox, stacking the checkbox, initials and name on
            separate lines. */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Project members {isEdit && <span style={{ color: theme.colors.espresso }}>*</span>}
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 11, color: theme.colors.ash }}>
              <span>{selected.size} selected</span>
              <button type="button" onClick={selectAllVisible}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: theme.colors.espresso }}>
                {q ? 'Select shown' : 'Select all'}
              </button>
              {selected.size > 0 && (
                <button type="button" onClick={clearAll}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: theme.colors.ash }}>
                  Clear
                </button>
              )}
            </span>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members by name or email…"
            style={{ width: '100%', marginBottom: 8, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '8px 12px', fontSize: 12.5, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
            {projectMembers.length === 0 && (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '6px 0' }}>No members on this project yet.</div>
            )}
            {projectMembers.length > 0 && visibleMembers.length === 0 && (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '6px 0' }}>No member matches "{search}".</div>
            )}
            {visibleMembers.map(m => {
              const checked = selected.has(String(m.userId));
              const isMe = String(m.userId) === String(myUserId);
              return (
                <MemberRow key={m.userId} selected={checked} as="label" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(m.userId)} style={{ width: 15, height: 15, flexShrink: 0, margin: 0 }} />
                  <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx }}>{initials(m.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}{isMe && <span style={{ color: theme.colors.ash }}> (you)</span>}
                  </span>
                  <span style={{ fontSize: 10, color: theme.colors.ashLight, flexShrink: 0 }}>{m.role}</span>
                </MemberRow>
              );
            })}
          </div>
        </div>

        {!isEdit && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Guest participants (optional)
              </span>
              {guests.length > 0 && <span style={{ fontSize: 11, color: theme.colors.ash }}>{guests.length} added</span>}
            </div>
            <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 6 }}>
              Anyone else in the system — added to this meeting only, not to the project.
            </div>
            <UserSearchInput
              selectedUser={null} onSelect={addGuest} placeholder="Search guests by name or email…"
              excludeUserIds={[...projectMembers.map(m => m.userId), ...guests.map(g => g.userId)]}
            />
            {guests.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {guests.map(g => (
                  <span key={g.userId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: theme.colors.onyx, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '3px 6px 3px 10px' }}>
                    {userName(g)}
                    <span style={{ fontSize: 9, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase' }}>Guest</span>
                    <button type="button" onClick={() => removeGuest(g.userId)} title="Remove"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex', padding: 0 }}>
                      <X size={12} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 4 }}>{error}</div>}

        <ModalFooter>
          <BtnGhost onClick={onClose} disabled={submitting}>Cancel</BtnGhost>
          <BtnPrimary onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Create meeting')}</BtnPrimary>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}
