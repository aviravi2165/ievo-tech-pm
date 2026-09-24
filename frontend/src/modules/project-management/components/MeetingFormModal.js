import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { meetingAttendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { ModalOverlay, Modal, Field, ModalFooter, BtnPrimary, BtnGhost, MemberRow } from '../styles/shared.styles';

function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * MeetingFormModal — Add Meeting (mode="create") or Edit Meeting
 * (mode="edit", pre-filled from `meeting`). Manager-only (the tab already
 * gates who ever gets a way to open this). Member selection defaults to
 * every current project member checked; on edit, member add/remove goes
 * through a separate call (updateMembers) right after the title/date/
 * description save, matching "Manager can add/remove members from a
 * meeting" as part of editing it — there's no separate "finalize" step, an
 * edit is always allowed for a Manager.
 */
export default function MeetingFormModal({ mode, projectId, projectMembers, meeting, currentMemberIds, onClose, onSaved }) {
  const theme = useTheme();
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState(meeting?.title || '');
  const [date, setDate] = useState(meeting?.meetingDate ? String(meeting.meetingDate).slice(0, 10) : todayStr());
  const [description, setDescription] = useState(meeting?.description || '');
  const [selected, setSelected] = useState(() => new Set((currentMemberIds || projectMembers.map(m => m.userId)).map(String)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) setSelected(new Set((currentMemberIds || []).map(String)));
  }, [isEdit, currentMemberIds]);

  const toggle = (userId) => {
    setSelected(prev => {
      const next = new Set(prev);
      const key = String(userId);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!title.trim()) { setError('Meeting title is required.'); return; }
    if (!date) { setError('Meeting date is required.'); return; }
    if (selected.size === 0) { setError('Select at least one project member.'); return; }
    setSubmitting(true); setError('');
    try {
      const memberIds = [...selected];
      if (isEdit) {
        await meetingAttendanceApi.update(projectId, meeting.meetingId, { title: title.trim(), meetingDate: date, description: description.trim() || null });
        await meetingAttendanceApi.updateMembers(projectId, meeting.meetingId, memberIds);
        showToast('Meeting updated.', 'success');
        onSaved?.(meeting.meetingId);
      } else {
        const created = await meetingAttendanceApi.create(projectId, { title: title.trim(), meetingDate: date, description: description.trim() || null, memberIds });
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

        <Field>
          <label>Project members <span className="req">*</span></label>
          <div style={{ maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
            {projectMembers.length === 0 && (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '6px 0' }}>No members on this project yet.</div>
            )}
            {projectMembers.map(m => {
              const checked = selected.has(String(m.userId));
              return (
                <MemberRow key={m.userId} selected={checked} as="label" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(m.userId)} style={{ width: 15, height: 15, flexShrink: 0 }} />
                  <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx }}>{initials(m.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  <span style={{ fontSize: 10, color: theme.colors.ashLight }}>{m.role}</span>
                </MemberRow>
              );
            })}
          </div>
        </Field>

        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 4 }}>{error}</div>}

        <ModalFooter>
          <BtnGhost onClick={onClose} disabled={submitting}>Cancel</BtnGhost>
          <BtnPrimary onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Create meeting')}</BtnPrimary>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}
