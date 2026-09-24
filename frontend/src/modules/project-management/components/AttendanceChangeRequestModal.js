import { useState } from 'react';
import { useTheme } from '@emotion/react';
import { meetingAttendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { ModalOverlay, Modal, Field, ModalFooter, BtnPrimary, BtnGhost } from '../styles/shared.styles';

const STATUSES = ['Present', 'Absent'];

/**
 * AttendanceChangeRequestModal — a Member requesting a correction to their
 * OWN official attendance for one meeting. Never touches the official
 * record directly; goes to the project's Manager(s) for approval (see
 * MeetingDetailPanel's Manager-side approve/reject controls).
 */
export default function AttendanceChangeRequestModal({ projectId, meetingId, currentStatus, onClose, onSubmitted }) {
  const theme = useTheme();
  const [status, setStatus] = useState(STATUSES.find(s => s !== currentStatus) || 'Present');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason.trim()) { setError('Please explain why your attendance should be changed.'); return; }
    setSubmitting(true); setError('');
    try {
      await meetingAttendanceApi.requestChange(projectId, meetingId, { requestedStatus: status, reason: reason.trim() });
      showToast('Request sent — your Manager will review it.', 'success');
      onSubmitted?.();
      onClose();
    } catch (err) { setError(apiErrorMessage(err, 'Failed to send the request.')); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal style={{ maxWidth: 420 }}>
        <h3>Request attendance change</h3>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: theme.colors.mid, borderRadius: theme.radius.sm, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Current status</div>
            <div style={{ fontSize: 13, color: theme.colors.onyx, fontWeight: 600 }}>{currentStatus || 'Not marked'}</div>
          </div>
        </div>

        <Field>
          <label>Requested status <span className="req">*</span></label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field>
          <label>Reason / remarks <span className="req">*</span></label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder='e.g. "I attended the meeting but was marked absent."' />
        </Field>

        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 4 }}>{error}</div>}

        <ModalFooter>
          <BtnGhost onClick={onClose} disabled={submitting}>Cancel</BtnGhost>
          <BtnPrimary onClick={submit} disabled={submitting}>{submitting ? 'Sending…' : 'Send request'}</BtnPrimary>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}
