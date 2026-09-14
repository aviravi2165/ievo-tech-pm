import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { subscribeDateChangeRequest, closeDateChangeRequest } from '../hooks/dateChangeRequestStore';
import { dateChangeRequestApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import UserSearchInput from './UserSearchInput';
import { ModalOverlay, Modal, Field, BtnPrimary, BtnGhost } from '../styles/shared.styles';

const FIELD_LABEL = { plannedStart: 'start date', plannedEnd: 'end date', startDate: 'start date', dueDate: 'due date' };
const ENTITY_LABEL = { project: 'Project', phase: 'Phase', activity: 'Activity', task: 'Task' };

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * DateChangeRequestModal — mounted ONCE (in ProjectDetailPage) and driven by
 * dateChangeRequestStore, a module-level pub-sub. Any date-editing save
 * (Project/Phase/Activity/Task) that gets back a 409 DATE_LOCKED calls
 * openDateChangeRequest(meta) instead of just toasting the error, which pops
 * this up pre-filled with what changed — the requester just adds a reason
 * and picks who should approve it.
 */
export default function DateChangeRequestModal({ onApplied }) {
  const theme = useTheme();
  const [meta, setMeta] = useState(null);
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeDateChangeRequest(setMeta), []);
  useEffect(() => { if (meta) { setReason(''); setApprover(null); setError(''); } }, [meta]);

  if (!meta) return null;

  const close = () => closeDateChangeRequest();

  const submit = async () => {
    if (!reason.trim()) { setError('Please explain why this date needs to change.'); return; }
    if (!approver) { setError('Please choose who should approve this.'); return; }
    setSubmitting(true); setError('');
    try {
      await dateChangeRequestApi.create({
        projectId: meta.projectId,
        entityType: meta.entityType,
        entityId: meta.entityId,
        field: meta.field,
        newValue: meta.newValue,
        reason: reason.trim(),
        approverId: approver.userId,
      });
      showToast('Request sent — you\'ll be notified once it\'s decided.', 'success');
      onApplied?.();
      close();
    } catch (err) { setError(apiErrorMessage(err, 'Failed to send the request.')); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Modal style={{ maxWidth: 440 }}>
        <h3>Request date change</h3>
        <p style={{ fontSize: 12.5, color: theme.colors.ash, lineHeight: 1.6, marginTop: -10, marginBottom: 18 }}>
          {ENTITY_LABEL[meta.entityType] || meta.entityType}'s {FIELD_LABEL[meta.field] || meta.field} is locked once set.
          {' '}Submit this for approval — it applies automatically once approved.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: theme.colors.mid, borderRadius: theme.radius.sm, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Current</div>
            <div style={{ fontSize: 13, color: theme.colors.onyx, fontWeight: 600 }}>{fmt(meta.oldValue)}</div>
          </div>
          <div style={{ flex: 1, background: `${theme.colors.espresso}14`, borderRadius: theme.radius.sm, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: theme.colors.espresso, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>Requested</div>
            <div style={{ fontSize: 13, color: theme.colors.onyx, fontWeight: 600 }}>{fmt(meta.newValue)}</div>
          </div>
        </div>

        <Field>
          <label>Reason <span className="req">*</span></label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why does this date need to change?" />
        </Field>

        <Field>
          <label>Send to (admin or a project member) <span className="req">*</span></label>
          <UserSearchInput selectedUser={approver} onSelect={setApprover} placeholder="Search a person to approve…" />
        </Field>

        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <BtnGhost onClick={close} disabled={submitting}>Cancel</BtnGhost>
          <BtnPrimary onClick={submit} disabled={submitting}>{submitting ? 'Sending…' : 'Send request'}</BtnPrimary>
        </div>
      </Modal>
    </ModalOverlay>
  );
}
