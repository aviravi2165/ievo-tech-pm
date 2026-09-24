import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronLeft, Pencil, XCircle } from 'lucide-react';
import { meetingAttendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { BtnPrimary, BtnGhost, IconBtn, IconBtnDanger, Empty } from '../styles/shared.styles';
import MeetingFormModal from './MeetingFormModal';
import AttendanceChangeRequestModal from './AttendanceChangeRequestModal';

const STATUSES = ['Present', 'Absent', 'Half Day'];
const STATUS_COLOR = { Present: 'success', 'Half Day': 'copper', Absent: 'danger' };
function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// Subtle, tinted status pill (not a solid red/amber/green dashboard fill) —
// same restrained treatment the old AttendancePanel/ApprovalsPanel already
// used for exactly this reason.
function StatusChip({ status, theme }) {
  if (!status) return <span style={{ fontSize: 11, color: theme.colors.ashLight, fontStyle: 'italic' }}>Not marked</span>;
  const color = theme.colors[STATUS_COLOR[status]] || theme.colors.ash;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}1a`, borderRadius: 10, padding: '3px 10px' }}>{status}</span>
  );
}

function KpiCard({ label, value, theme, color }) {
  return (
    <div style={{ flex: '1 1 100px', minWidth: 90, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '10px 12px', background: theme.colors.white }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || theme.colors.onyx, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>{label}</div>
    </div>
  );
}

/**
 * MeetingDetailPanel — one meeting's attendance sheet: KPI summary + every
 * roster member's official status/remarks, with role-gated controls:
 *   - Manager: mark/edit any row directly, approve/reject pending requests,
 *     edit/cancel the meeting.
 *   - Member: read-only for everyone else's row; on their OWN row, a
 *     "Request change" button (disabled with an explanatory tag while a
 *     request is already pending) instead of any direct edit control.
 *   - Viewer: fully read-only, including request status.
 * All of this is a UI convenience only — the actual enforcement is
 * server-side (meetingAttendanceRoutes.js / meetingAttendanceService.js);
 * this component disables/hides controls rather than ever assuming a click
 * will succeed.
 */
export default function MeetingDetailPanel({ projectId, meetingId, myUserId, myRole, projectMembers, onBack, onChanged }) {
  const theme = useTheme();
  const canEdit = myRole === 'Manager';
  const isMember = myRole === 'Member';

  const [data, setData] = useState(null); // { meeting, kpis, members }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editStatus, setEditStatus] = useState('Present');
  const [editRemarks, setEditRemarks] = useState('');
  const [showEditMeeting, setShowEditMeeting] = useState(false);
  const [requestModalFor, setRequestModalFor] = useState(null); // member row while the request modal is open

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await meetingAttendanceApi.get(projectId, meetingId)); }
    catch (err) { setError(apiErrorMessage(err, 'Failed to load this meeting.')); }
    finally { setLoading(false); }
  }, [projectId, meetingId]);
  useEffect(() => { load(); }, [load]);

  const startEdit = (m) => { setEditingUserId(m.userId); setEditStatus(m.status || 'Present'); setEditRemarks(m.remarks || ''); };

  const saveMark = async (userId) => {
    if (editStatus === 'Absent' && !editRemarks.trim()) { showToast('A remark/reason is required when marking someone Absent.'); return; }
    setBusyKey(`mark-${userId}`);
    try {
      await meetingAttendanceApi.markAttendance(projectId, meetingId, userId, { status: editStatus, remarks: editRemarks.trim() || null });
      setEditingUserId(null); await load(); onChanged?.();
      showToast('Attendance updated.', 'success');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to update attendance.')); }
    finally { setBusyKey(null); }
  };

  const decide = async (requestId, action) => {
    setBusyKey(`req-${requestId}`);
    try {
      await (action === 'approve' ? meetingAttendanceApi.approveRequest(projectId, requestId) : meetingAttendanceApi.rejectRequest(projectId, requestId));
      await load(); onChanged?.();
      showToast(action === 'approve' ? 'Request approved — attendance updated.' : 'Request rejected.', 'success');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to decide this request.')); }
    finally { setBusyKey(null); }
  };

  const cancelMyRequest = async (requestId) => {
    setBusyKey(`req-${requestId}`);
    try { await meetingAttendanceApi.cancelRequest(projectId, requestId); await load(); showToast('Request cancelled.', 'success'); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to cancel your request.')); }
    finally { setBusyKey(null); }
  };

  const cancelMeeting = async () => {
    if (!window.confirm(`Cancel "${data.meeting.title}"? This removes it from the meeting list but keeps its history.`)) return;
    setBusyKey('cancel-meeting');
    try { await meetingAttendanceApi.cancel(projectId, meetingId); showToast('Meeting cancelled.', 'success'); onChanged?.(); onBack(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to cancel this meeting.')); }
    finally { setBusyKey(null); }
  };

  if (loading) return <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>;
  if (error) return <Empty>{error}</Empty>;
  if (!data) return null;

  const { meeting, kpis, members } = data;
  const currentMemberIds = members.map(m => m.userId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <button type="button" onClick={onBack} title="Back to meetings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex', padding: '2px 0 0' }}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <div>
            <div style={{ fontFamily: theme.font.display, fontSize: 17, fontWeight: 800, color: theme.colors.onyx }}>{meeting.title}</div>
            <div style={{ fontSize: 12.5, color: theme.colors.ash, marginTop: 2 }}>{fmtDate(meeting.meetingDate)}</div>
            {meeting.description && <div style={{ fontSize: 12, color: theme.colors.ash, marginTop: 4, maxWidth: 480 }}>{meeting.description}</div>}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <IconBtn title="Edit meeting" onClick={() => setShowEditMeeting(true)}><Pencil size={13} strokeWidth={2} /></IconBtn>
            <IconBtnDanger title="Cancel meeting" onClick={cancelMeeting} disabled={busyKey === 'cancel-meeting'}><XCircle size={13} strokeWidth={2} /></IconBtnDanger>
          </div>
        )}
      </div>

      {/* ── KPI summary ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <KpiCard label="Total members" value={kpis.total} theme={theme} />
        <KpiCard label="Present" value={kpis.present} theme={theme} color={theme.colors.success} />
        <KpiCard label="Absent" value={kpis.absent} theme={theme} color={theme.colors.danger} />
        <KpiCard label="Half Day" value={kpis.halfDay} theme={theme} color={theme.colors.copper} />
        {kpis.notMarked > 0 && <KpiCard label="Not marked" value={kpis.notMarked} theme={theme} color={theme.colors.ashLight} />}
      </div>

      {/* ── Member rows ── */}
      <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
        {members.map(m => {
          const isMe = String(m.userId) === String(myUserId);
          const isEditingThis = editingUserId === m.userId;
          const fullRequest = m.pendingRequest && m.pendingRequest.requestId ? m.pendingRequest : null;
          const bareRequestPending = m.pendingRequest && !m.pendingRequest.requestId; // { status: 'pending' } only

          return (
            <div key={m.userId} style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.white }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: theme.colors.onyx }}>{initials(m.name)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: theme.colors.onyx, fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}{isMe && <span style={{ color: theme.colors.ash, fontWeight: 400 }}> (you)</span>}
                </span>

                {isEditingThis ? (
                  <>
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                      style={{ fontSize: 12, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 8px', color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input value={editRemarks} onChange={e => setEditRemarks(e.target.value)}
                      placeholder={editStatus === 'Absent' ? 'Reason (required)' : 'Remarks (optional)'}
                      style={{ fontSize: 12, width: 160, background: theme.colors.mid, border: `1px solid ${editStatus === 'Absent' && !editRemarks.trim() ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 8px', color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
                    <BtnPrimary onClick={() => saveMark(m.userId)} disabled={busyKey === `mark-${m.userId}`} style={{ fontSize: 11, padding: '4px 10px' }}>Save</BtnPrimary>
                    <button type="button" onClick={() => setEditingUserId(null)} style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <StatusChip status={m.status} theme={theme} />
                    {m.remarks && (
                      <span style={{ fontSize: 11, color: theme.colors.ash, fontStyle: 'italic', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.remarks}>
                        "{m.remarks}"
                      </span>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => startEdit(m)} style={{ background: 'none', border: 'none', color: theme.colors.espresso, cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>Edit</button>
                    )}
                    {isMember && isMe && !fullRequest && !bareRequestPending && (
                      <button type="button" onClick={() => setRequestModalFor(m)} style={{ background: 'none', border: 'none', color: theme.colors.espresso, cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>Request change</button>
                    )}
                    {bareRequestPending && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: theme.colors.copper, background: `${theme.colors.copper}1a`, borderRadius: 10, padding: '2px 8px' }}>Pending request</span>
                    )}
                  </>
                )}
              </div>

              {/* ── Pending/decided change-request detail (full visibility: Manager sees everyone's, a member sees their own) ── */}
              {fullRequest && (
                <div style={{ marginTop: 8, marginLeft: 38, padding: '8px 10px', background: theme.colors.greige, borderRadius: theme.radius.sm, fontSize: 11.5 }}>
                  <div style={{ color: theme.colors.onyx, marginBottom: 3 }}>
                    Requested <strong>{fullRequest.requestedStatus}</strong>
                    {fullRequest.status !== 'pending' && (
                      <span style={{ marginLeft: 6, fontWeight: 700, color: fullRequest.status === 'approved' ? theme.colors.success : theme.colors.danger, textTransform: 'uppercase', fontSize: 10 }}>{fullRequest.status}</span>
                    )}
                  </div>
                  <div style={{ color: theme.colors.ash, fontStyle: 'italic', marginBottom: fullRequest.status === 'pending' ? 6 : 0 }}>"{fullRequest.reason}"</div>
                  {fullRequest.decisionNote && <div style={{ color: theme.colors.ash, marginTop: 4 }}>Manager note: {fullRequest.decisionNote}</div>}
                  {fullRequest.status === 'pending' && canEdit && !isMe && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <BtnPrimary onClick={() => decide(fullRequest.requestId, 'approve')} disabled={busyKey === `req-${fullRequest.requestId}`} style={{ fontSize: 10.5, padding: '3px 10px' }}>Approve</BtnPrimary>
                      <BtnGhost onClick={() => decide(fullRequest.requestId, 'reject')} disabled={busyKey === `req-${fullRequest.requestId}`} style={{ fontSize: 10.5, padding: '3px 10px' }}>Reject</BtnGhost>
                    </div>
                  )}
                  {fullRequest.status === 'pending' && isMe && (
                    <div style={{ marginTop: 4 }}>
                      <BtnGhost onClick={() => cancelMyRequest(fullRequest.requestId)} disabled={busyKey === `req-${fullRequest.requestId}`} style={{ fontSize: 10.5, padding: '3px 10px' }}>Cancel request</BtnGhost>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showEditMeeting && (
        <MeetingFormModal
          mode="edit" projectId={projectId} meeting={meeting} currentMemberIds={currentMemberIds}
          projectMembers={projectMembers} onClose={() => setShowEditMeeting(false)}
          onSaved={() => { load(); onChanged?.(); }}
        />
      )}
      {requestModalFor && (
        <AttendanceChangeRequestModal
          projectId={projectId} meetingId={meetingId} currentStatus={requestModalFor.status}
          onClose={() => setRequestModalFor(null)} onSubmitted={load}
        />
      )}
    </div>
  );
}
