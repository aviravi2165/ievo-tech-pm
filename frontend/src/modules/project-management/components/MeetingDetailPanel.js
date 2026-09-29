import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronLeft, Pencil, XCircle, X } from 'lucide-react';
import { meetingAttendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { BtnPrimary, BtnGhost, IconBtn, IconBtnDanger, Empty, MemberRow } from '../styles/shared.styles';
import MeetingFormModal from './MeetingFormModal';
import AttendanceChangeRequestModal from './AttendanceChangeRequestModal';
import UserSearchInput from './UserSearchInput';

function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// Same shape the server returns — recomputed locally for optimistic updates.
function computeKpis(members) {
  return {
    total: members.length,
    present: members.filter(m => m.status === 'Present').length,
    absent: members.filter(m => m.status === 'Absent').length,
    notMarked: members.filter(m => !m.status).length,
  };
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
 * AttendanceControls — the Manager-only, no-Edit-click attendance widget for
 * one member row. Real <input type="radio"> elements (not pill buttons):
 *   - Not Marked: both radios unchecked.
 *   - Click Present → saves immediately, no reason needed.
 *   - Click the ALREADY-checked Present radio again → clears back to Not
 *     Marked (both radios unchecked again) — this is the "unselect" gesture.
 *   - Click Absent → radio shows checked right away, but nothing is saved
 *     yet; a mandatory reason box appears alongside it. Save is disabled
 *     until non-empty, and nothing is written to the server before then.
 *   - Click the already-saved Absent radio again → clears it the same way
 *     Present does (symmetric "click again to unselect").
 *   - Clicking the OTHER (currently unchecked) radio always just switches
 *     straight to it — standard radio-group behavior.
 * All of this is a UI convenience only; the server re-validates everything
 * (mandatory reason for Absent, roster membership, Manager-only) regardless.
 */
function AttendanceControls({ member, busy, onSetPresent, onSaveAbsent, onClear, theme }) {
  const [pendingAbsent, setPendingAbsent] = useState(false);
  const [reason, setReason] = useState('');

  // Reset the transient "typing a reason" state whenever the SERVER status
  // actually changes (save/clear succeeded, or a reload brought in someone
  // else's change) — otherwise a stale reason box could linger.
  useEffect(() => { setPendingAbsent(false); setReason(''); }, [member.status]);

  const presentChecked = member.status === 'Present';
  const absentChecked = member.status === 'Absent' || pendingAbsent;

  const clickPresent = () => {
    if (busy) return;
    if (presentChecked) { onClear(); return; } // click the selected radio again → unselect
    setPendingAbsent(false); setReason('');
    onSetPresent();
  };
  const clickAbsent = () => {
    if (busy) return;
    if (member.status === 'Absent') { onClear(); return; } // click the selected (saved) radio again → unselect
    if (pendingAbsent) { setPendingAbsent(false); setReason(''); return; } // un-pick a not-yet-saved Absent
    setPendingAbsent(true);
  };

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: theme.colors.onyx, cursor: busy ? 'default' : 'pointer' }}>
        <input
          type="radio" name={`attendance-${member.userId}`} checked={presentChecked}
          onChange={() => {}} onClick={clickPresent}
          style={{ width: 14, height: 14, accentColor: theme.colors.success, cursor: busy ? 'default' : 'pointer' }}
        />
        Present
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: theme.colors.onyx, cursor: busy ? 'default' : 'pointer' }}>
        <input
          type="radio" name={`attendance-${member.userId}`} checked={absentChecked}
          onChange={() => {}} onClick={clickAbsent}
          style={{ width: 14, height: 14, accentColor: theme.colors.danger, cursor: busy ? 'default' : 'pointer' }}
        />
        Absent
      </label>

      {member.status === 'Absent' && !pendingAbsent && member.remarks && (
        <span style={{ fontSize: 11, color: theme.colors.ash, fontStyle: 'italic', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.remarks}>"{member.remarks}"</span>
      )}

      {pendingAbsent && (
        <>
          <input value={reason} onChange={e => setReason(e.target.value)} autoFocus placeholder="Reason (required)"
            style={{ fontSize: 12, width: 150, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 8px', color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
          <BtnPrimary onClick={() => onSaveAbsent(reason.trim())} disabled={busy || !reason.trim()} style={{ fontSize: 11, padding: '4px 10px' }}>Save</BtnPrimary>
        </>
      )}
    </span>
  );
}

// ── "+ Add Project Participant" — a short, filterable list of current
// project members not already on this meeting. No new API needed; the full
// project roster is already loaded by the parent (ProjectDetailPage). ──────
function PickFromList({ theme, candidates, onPick, busy, emptyText, filterPlaceholder, renderExtra }) {
  const [search, setSearch] = useState('');
  const filtered = candidates.filter(m => !search.trim() || (m.name || '').toLowerCase().includes(search.toLowerCase()) || (m.email || '').toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{ marginTop: 8, padding: 10, background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={filterPlaceholder} autoFocus
        style={{ width: '100%', marginBottom: 8, background: theme.colors.white, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', fontSize: 12, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {candidates.length === 0 && <div style={{ fontSize: 12, color: theme.colors.ash, padding: '4px 2px' }}>{emptyText}</div>}
        {candidates.length > 0 && filtered.length === 0 && <div style={{ fontSize: 12, color: theme.colors.ash, padding: '4px 2px' }}>No match.</div>}
        {filtered.map(m => (
          <MemberRow key={m.userId} as="button" type="button" onClick={() => onPick(m)} disabled={busy}
            style={{ width: '100%', cursor: 'pointer', textAlign: 'left', border: `1px solid ${theme.colors.border}` }}>
            <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx }}>{initials(m.name)}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            {renderExtra?.(m)}
          </MemberRow>
        ))}
      </div>
    </div>
  );
}

/**
 * MeetingDetailPanel — one meeting's attendance sheet: KPI summary + every
 * participant's official status/remarks, with role-gated controls:
 *   - Manager: mark attendance directly via Present/Absent radios (no Edit
 *     click needed), add meeting-only participants (existing project
 *     members OR guests) via the top toolbar, remove one via the single
 *     "Remove Participant" picker (also top toolbar — no per-row icons),
 *     approve/reject pending requests, edit/cancel the meeting.
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
  const [showEditMeeting, setShowEditMeeting] = useState(false);
  const [requestModalFor, setRequestModalFor] = useState(null); // member row while the request modal is open
  const [toolPanel, setToolPanel] = useState(null); // null | 'add-project' | 'add-guest' | 'remove'
  const [bulkUndoIds, setBulkUndoIds] = useState(null); // userIds the last "Mark all Present" actually changed

  // Only the FIRST load shows "Loading…". Every later refresh is silent and
  // updates in place — previously each attendance click re-fetched with
  // loading=true, which blanked the whole panel and read as a page reload.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try { setData(await meetingAttendanceApi.get(projectId, meetingId)); }
    catch (err) {
      if (silent) showToast(apiErrorMessage(err, 'Failed to refresh this meeting.'));
      else setError(apiErrorMessage(err, 'Failed to load this meeting.'));
    }
    finally { if (!silent) setLoading(false); }
  }, [projectId, meetingId]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => load({ silent: true });

  // Patch one member row locally (KPIs recomputed) — used for optimistic
  // attendance updates so a radio click reflects instantly, and only that
  // row changes when the server answers (no whole-panel swap, and no race
  // where one row's response overwrites another row's in-flight click).
  const patchMember = (userId, fields) => setData(prev => {
    if (!prev) return prev;
    const members = prev.members.map(m => (String(m.userId) === String(userId) ? { ...m, ...fields } : m));
    return { ...prev, members, kpis: computeKpis(members) };
  });

  const quickMark = async (userId, status, remarks) => {
    const before = data.members.find(m => String(m.userId) === String(userId));
    patchMember(userId, { status, remarks: remarks || null });
    setBusyKey(`mark-${userId}`);
    try {
      const res = await meetingAttendanceApi.markAttendance(projectId, meetingId, userId, { status, remarks: remarks || null });
      const fresh = res.members.find(m => String(m.userId) === String(userId));
      if (fresh) patchMember(userId, fresh);
    } catch (err) {
      patchMember(userId, { status: before?.status ?? null, remarks: before?.remarks ?? null });
      showToast(apiErrorMessage(err, 'Failed to update attendance.'));
    } finally { setBusyKey(null); }
  };

  const clearMark = async (userId) => {
    const before = data.members.find(m => String(m.userId) === String(userId));
    patchMember(userId, { status: null, remarks: null });
    setBusyKey(`clear-${userId}`);
    try { await meetingAttendanceApi.clearAttendance(projectId, meetingId, userId); }
    catch (err) {
      patchMember(userId, { status: before?.status ?? null, remarks: before?.remarks ?? null });
      showToast(apiErrorMessage(err, 'Failed to clear attendance.'));
    } finally { setBusyKey(null); }
  };

  // Bulk: only people currently Not Marked — never overwrites an Absent (and
  // its reason). The server enforces the same rule and reports exactly who
  // it changed, which is what Undo sends back.
  const markAllPresent = async (ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids.map(String));
    setData(prev => {
      const members = prev.members.map(m => (idSet.has(String(m.userId)) && !m.status ? { ...m, status: 'Present', remarks: null } : m));
      return { ...prev, members, kpis: computeKpis(members) };
    });
    setBusyKey('bulk');
    try {
      const { affectedUserIds, ...detail } = await meetingAttendanceApi.markAllPresent(projectId, meetingId, ids);
      setData(detail);
      setBulkUndoIds(affectedUserIds.length ? affectedUserIds : null);
      showToast(`Marked ${affectedUserIds.length} Present.`, 'success');
    } catch (err) { await refresh(); showToast(apiErrorMessage(err, 'Failed to mark everyone Present.')); }
    finally { setBusyKey(null); }
  };

  const undoMarkAllPresent = async () => {
    if (!bulkUndoIds?.length) return;
    setBusyKey('bulk');
    try {
      setData(await meetingAttendanceApi.undoMarkAllPresent(projectId, meetingId, bulkUndoIds));
      setBulkUndoIds(null);
      showToast('Undone.', 'success');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to undo.')); }
    finally { setBusyKey(null); }
  };

  const decide = async (requestId, action) => {
    setBusyKey(`req-${requestId}`);
    try {
      setData(await (action === 'approve' ? meetingAttendanceApi.approveRequest(projectId, requestId) : meetingAttendanceApi.rejectRequest(projectId, requestId)));
      onChanged?.();
      showToast(action === 'approve' ? 'Request approved — attendance updated.' : 'Request rejected.', 'success');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to decide this request.')); }
    finally { setBusyKey(null); }
  };

  const cancelMyRequest = async (requestId) => {
    setBusyKey(`req-${requestId}`);
    try { await meetingAttendanceApi.cancelRequest(projectId, requestId); await refresh(); showToast('Request cancelled.', 'success'); }
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

  const addProjectParticipant = async (m) => {
    setBusyKey(`add-${m.userId}`);
    try { setData(await meetingAttendanceApi.addParticipant(projectId, meetingId, m.userId, 'project')); onChanged?.(); showToast('Added to this meeting.', 'success'); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to add that participant.')); }
    finally { setBusyKey(null); }
  };

  const addGuest = async (user) => {
    if (!user) return;
    setBusyKey(`add-${user.userId}`);
    try {
      setData(await meetingAttendanceApi.addParticipant(projectId, meetingId, user.userId, 'guest'));
      onChanged?.(); setToolPanel(null);
      showToast('Guest added to this meeting.', 'success');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to add that guest.')); }
    finally { setBusyKey(null); }
  };

  const removeParticipant = async (m) => {
    if (!window.confirm(`Remove ${m.name} from this meeting? Their attendance record for this meeting will be removed too.`)) return;
    setBusyKey(`remove-${m.userId}`);
    try { setData(await meetingAttendanceApi.removeParticipant(projectId, meetingId, m.userId)); onChanged?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove that participant.')); }
    finally { setBusyKey(null); }
  };

  if (loading) return <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>;
  if (error) return <Empty>{error}</Empty>;
  if (!data) return null;

  const { meeting, kpis, members } = data;
  // The Edit Meeting modal's checkbox roster is project-members-only — pass
  // it only the currently-checked PROJECT-sourced members, never guests
  // (guests aren't in that list at all and must never be affected by it).
  const currentProjectMemberIds = members.filter(m => m.source === 'project').map(m => m.userId);
  const meetingMemberIdSet = new Set(members.map(m => String(m.userId)));
  const availableProjectMembers = (projectMembers || []).filter(m => !meetingMemberIdSet.has(String(m.userId)));
  // A guest picker shouldn't offer people already on the meeting OR people
  // who are already project members (those belong in "+ Add Project
  // Participant" instead) — keeps the two flows meaningfully distinct.
  const guestExcludeIds = [...meetingMemberIdSet, ...(projectMembers || []).map(m => String(m.userId))];
  const notMarkedIds = members.filter(m => !m.status).map(m => m.userId);
  // Undo stays offered while at least one person the bulk action marked is
  // still Present (the server re-checks the same thing).
  const undoIdSet = new Set((bulkUndoIds || []).map(String));
  const undoAvailable = undoIdSet.size > 0 && members.some(m => undoIdSet.has(String(m.userId)) && m.status === 'Present');

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
        {kpis.notMarked > 0 && <KpiCard label="Not marked" value={kpis.notMarked} theme={theme} color={theme.colors.ashLight} />}
      </div>

      {/* ── Participant management — top of the participant section, Manager
          only. One "Remove Participant" picker here rather than a per-row
          icon on every single row. ── */}
      {canEdit && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <BtnGhost type="button" onClick={() => setToolPanel(toolPanel === 'add-project' ? null : 'add-project')} style={{ fontSize: 11.5, padding: '6px 12px' }}>+ Add Project Participant</BtnGhost>
            <BtnGhost type="button" onClick={() => setToolPanel(toolPanel === 'add-guest' ? null : 'add-guest')} style={{ fontSize: 11.5, padding: '6px 12px' }}>+ Add Guest Participant</BtnGhost>
            <BtnGhost type="button" onClick={() => setToolPanel(toolPanel === 'remove' ? null : 'remove')} style={{ fontSize: 11.5, padding: '6px 12px' }}>Remove Participant</BtnGhost>
          </div>

          {toolPanel === 'add-project' && (
            <PickFromList theme={theme} candidates={availableProjectMembers} onPick={addProjectParticipant}
              busy={busyKey?.startsWith('add-')} emptyText="Every project member is already on this meeting."
              filterPlaceholder="Filter project members…" />
          )}
          {toolPanel === 'add-guest' && (
            <div style={{ marginTop: 8, padding: 10, background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm }}>
              <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 6 }}>
                Search any user in the system — added to this meeting only, not to the project.
              </div>
              <UserSearchInput selectedUser={null} onSelect={addGuest} excludeUserIds={guestExcludeIds} placeholder="Search by name or email…" />
            </div>
          )}
          {toolPanel === 'remove' && (
            <PickFromList theme={theme} candidates={members} onPick={removeParticipant}
              busy={busyKey?.startsWith('remove-')} emptyText="No participants on this meeting."
              filterPlaceholder="Filter participants to remove…"
              renderExtra={(m) => <X size={13} strokeWidth={2} color={theme.colors.danger} style={{ flexShrink: 0 }} />} />
          )}
        </div>
      )}

      {/* ── Member rows ── */}
      <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
        {/* Bulk bar — Manager only. "Mark all Present" fills in everyone still
            Not Marked (Absent entries are never overwritten); Undo reverts
            exactly those people. */}
        {canEdit && members.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 12px', background: theme.colors.greige, borderBottom: `1px solid ${theme.colors.border}` }}>
            <span style={{ fontSize: 11, color: theme.colors.ash }}>
              {notMarkedIds.length ? `${notMarkedIds.length} not marked yet` : 'Everyone is marked'}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              {undoAvailable && (
                <BtnGhost type="button" onClick={undoMarkAllPresent} disabled={busyKey === 'bulk'} style={{ fontSize: 11, padding: '4px 10px' }}>Undo mark all</BtnGhost>
              )}
              <BtnPrimary type="button" onClick={() => markAllPresent(notMarkedIds)} disabled={busyKey === 'bulk' || notMarkedIds.length === 0}
                style={{ fontSize: 11, padding: '4px 10px' }}>
                Mark all Present
              </BtnPrimary>
            </span>
          </div>
        )}
        {members.map(m => {
          const isMe = String(m.userId) === String(myUserId);
          const fullRequest = m.pendingRequest && m.pendingRequest.requestId ? m.pendingRequest : null;
          const bareRequestPending = m.pendingRequest && !m.pendingRequest.requestId; // { status: 'pending' } only

          return (
            <div key={m.userId} style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.white }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: theme.colors.onyx }}>{initials(m.name)}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                  <span style={{ fontSize: 13, color: theme.colors.onyx, fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}{isMe && <span style={{ color: theme.colors.ash, fontWeight: 400 }}> (you)</span>}
                  </span>
                  {m.source === 'guest' && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: theme.colors.ash, background: theme.colors.mid, borderRadius: 8, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '.03em', flexShrink: 0 }}>Guest</span>
                  )}
                </span>

                {canEdit ? (
                  <AttendanceControls
                    member={m} theme={theme}
                    busy={busyKey === `mark-${m.userId}` || busyKey === `clear-${m.userId}` || busyKey === 'bulk'}
                    onSetPresent={() => quickMark(m.userId, 'Present')}
                    onSaveAbsent={(reason) => quickMark(m.userId, 'Absent', reason)}
                    onClear={() => clearMark(m.userId)}
                  />
                ) : (
                  <>
                    {!m.status && <span style={{ fontSize: 11, color: theme.colors.ashLight, fontStyle: 'italic' }}>Not marked</span>}
                    {m.status === 'Present' && <span style={{ fontSize: 11, fontWeight: 700, color: theme.colors.success, background: `${theme.colors.success}1a`, borderRadius: 10, padding: '3px 10px' }}>Present</span>}
                    {m.status === 'Absent' && <span style={{ fontSize: 11, fontWeight: 700, color: theme.colors.danger, background: `${theme.colors.danger}1a`, borderRadius: 10, padding: '3px 10px' }}>Absent</span>}
                    {m.remarks && (
                      <span style={{ fontSize: 11, color: theme.colors.ash, fontStyle: 'italic', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.remarks}>"{m.remarks}"</span>
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
          mode="edit" projectId={projectId} meeting={meeting} currentMemberIds={currentProjectMemberIds} myUserId={myUserId}
          projectMembers={projectMembers} onClose={() => setShowEditMeeting(false)}
          onSaved={() => { refresh(); onChanged?.(); }}
        />
      )}
      {requestModalFor && (
        <AttendanceChangeRequestModal
          projectId={projectId} meetingId={meetingId} currentStatus={requestModalFor.status}
          onClose={() => setRequestModalFor(null)} onSubmitted={refresh}
        />
      )}
    </div>
  );
}
