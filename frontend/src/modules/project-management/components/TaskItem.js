import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { ArrowRight, FileText, RotateCcw, Trash2 } from 'lucide-react';
import StatusBadge, { InactiveBadge } from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import UserSearchInput from './UserSearchInput';
import ChatButton from './ChatButton';
import { taskApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { TaskTableRow, Cell, COL, Assignees, Avatar, RowActions } from '../styles/Table.styles';
import { TaskName } from '../styles/TaskItem.styles';
import {
  DepBadge, IconBtn, IconBtnDanger, BtnPrimary, BtnGhost, SubPanel, SubPanelTitle, SubPanelHint,
  MemberRow, LateTag, DueSoonTag,
} from '../styles/shared.styles';

// Statuses: To Do / Ongoing / Complete / Blocked (renamed from In Progress / Done)
// Blocked is system-managed (set/cleared automatically by the dependency
// graph, same as Phase/Activity status) — not a manual choice. Selecting it
// by hand did nothing useful and, worse, let a Blocked task be dragged
// straight to Complete via the dropdown, bypassing prerequisite enforcement.
const STATUS_OPTIONS = ['To Do', 'Ongoing', 'Complete'];

// Badge shown per request status alongside an assignee's name — theme-driven
// (module-level object can't call useTheme(), so this takes theme as a param).
function requestBadge(theme, status) {
  const map = {
    Pending:  { color: theme.colors.warning, bg: `${theme.colors.warning}24`, label: 'Pending'  },
    Accepted: { color: theme.colors.success, bg: `${theme.colors.success}24`, label: 'Accepted' },
    Declined: { color: theme.colors.danger,  bg: `${theme.colors.danger}24`,  label: 'Declined' },
  };
  return map[status] || map.Pending;
}

function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

// Previously hid the date entirely behind a bare "—" whenever status was
// 'Complete', REGARDLESS of whether a due date actually existed — so a
// completed task with a real due date and one with no due date at all
// looked identical, hiding real information the column exists to show.
// Now only genuinely missing dates show "—"; a completed task still shows
// its actual date, just without the urgency styling (no point flagging a
// finished task as "late").
function DueDateBadge({ dueDate, status }) {
  const theme = useTheme();
  if (!dueDate) return <span style={{ fontSize: 11, color: theme.colors.ashLight }}>—</span>;
  if (status === 'Complete') return <span style={{ fontSize: 11, color: theme.colors.ashLight }}>{fmtDate(dueDate)}</span>;
  const dt   = parseLocalDate(dueDate);
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - now) / 86400000);
  if (diff < 0)  return <LateTag>⚠ {Math.abs(diff)}d late</LateTag>;
  if (diff <= 2) return <DueSoonTag>Due {diff === 0 ? 'today' : `in ${diff}d`}</DueSoonTag>;
  return <span style={{ fontSize: 11, color: theme.colors.ash }}>{fmtDate(dueDate)}</span>;
}

// pending — Pending (not yet accepted) requests, shown as dashed/muted
// avatars alongside accepted ones instead of the row falling back to
// "Unassigned" the moment you send a request. Without this, sending an
// assignment request looked like it silently did nothing until the other
// person accepted it.
function Avatars({ assignees = [], pending = [] }) {
  const theme = useTheme();
  if (!assignees.length && !pending.length) {
    // fontSize 10 — at 11px italic "Unassigned" is ~62px wide, 2px more
    // than the 60px assignee column, so the cell's overflow:hidden clipped
    // it mid-letter ("Unassignec"). Caught in a browser screenshot pass.
    return <span style={{ fontSize: 10, color: theme.colors.ash, fontStyle: 'italic', whiteSpace: 'nowrap' }}>Unassigned</span>;
  }
  // Max 3 shown + a possible "+N" chip = 4 circles. Each is 18px wide
  // overlapping -4px, so 4 chips = 18 + 3×14 = exactly 60px — the assignee
  // column's width (COL.assignee). At 4 shown the "+N" chip made 5 chips
  // (74px) and the column's overflow:hidden clipped the +N half off — the
  // one chip whose whole job is saying "there are more you can't see".
  const all = [...assignees, ...pending];
  const shown = all.slice(0, all.length > 4 ? 3 : 4);
  const extra = all.length - shown.length;
  return (
    <Assignees>
      {shown.map(a => (
        <Avatar key={a.userId} pending={!assignees.includes(a)} title={`${a.name} (${a.requestStatus || 'Accepted'})`}>
          {initials(a.name)}
        </Avatar>
      ))}
      {extra > 0 && <Avatar>+{extra}</Avatar>}
    </Assignees>
  );
}

/**
 * TaskItem — aligned with the new assignment-request flow.
 *
 * Assignment is now via requests (Pending → Accepted / Declined) not direct inserts.
 * allRequests  — every request for this task (including Pending and Declined) for the manager's view
 * assignees    — only Accepted requests (rendered as confirmed participants)
 * activityMembers — members of the parent activity; task assignees are picked from this list
 *                   (or a new user can be selected, which auto-adds them to the activity on accept)
 *
 * Renders as one real table row (Name / Assignee / Due Date / Priority /
 * Status columns, matching the shared TableHeadCell widths in
 * ProjectDetailPage.js) followed by whichever inline edit panel is open —
 * same panels, same handlers as before, just no longer wrapped in a
 * bordered "card" div.
 */
// activityRole — the user's EFFECTIVE role on the PARENT activity (a task
// has no role of its own; per roleService, task access is decided by
// assignee-or-Activity-Manager-or-above). Previously this was the flat
// project-level myRole, so an Activity Manager who was only a project
// Member never got management controls on tasks in their own activity.
export default function TaskItem({ task, activityRole, myUserId, allTasks = [], activityMembers = [], onRefetch, onRefetchProject }) {
  const theme = useTheme();
  // Check if current user has an accepted request for this task
  const isAssigned = (task.assignees || []).some(a => String(a.userId) === String(myUserId));
  const canManager = activityRole === 'Manager';
  const canMember  = (activityRole === 'Employee' || activityRole === 'Member') && isAssigned;
  const canEdit    = canManager || canMember;
  const canStatus  = canEdit;
  const isInactive = task.isActive === false;

  const [localStatus,  setLocalStatus]  = useState(task.status);
  const [panel,        setPanel]        = useState(null); // 'assign'|'deps'|'date'|'desc'|null
  const [editName,     setEditName]     = useState(task.name);
  const [editingName,  setEditingName]  = useState(false);
  const [editDue,      setEditDue]      = useState(toInput(task.dueDate));
  const [editStart,    setEditStart]    = useState(toInput(task.startDate));
  const [dateError,    setDateError]    = useState('');
  const [editDesc,     setEditDesc]     = useState(task.description || '');
  const [depError,     setDepError]     = useState('');
  const [assignSearch, setAssignSearch] = useState(null);
  const [assignError,  setAssignError]  = useState('');

  useEffect(() => { setLocalStatus(task.status); }, [task.status]);
  useEffect(() => { setEditDue(toInput(task.dueDate)); }, [task.dueDate]);
  useEffect(() => { setEditStart(toInput(task.startDate)); }, [task.startDate]);
  useEffect(() => { setEditDesc(task.description || ''); }, [task.description]);

  const togglePanel = (p) => {
    setPanel(v => v === p ? null : p);
    if (p === 'deps') setDepError('');
  };

  // ── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = async (e) => {
    const s = e.target.value;
    const prev = localStatus;
    setLocalStatus(s);
    try {
      await taskApi.updateStatus(task.taskId, s);
      onRefetch?.(); onRefetchProject?.();
    } catch (err) {
      setLocalStatus(prev);
      showToast(apiErrorMessage(err, 'Failed to update status.'));
    }
  };

  // ── Name edit ──────────────────────────────────────────────────────────────
  const handleNameSave = async () => {
    if (!editName.trim()) return;
    try { await taskApi.update(task.taskId, { name: editName }); onRefetch?.(); setEditingName(false); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to rename task.')); }
  };

  // ── Due date save ──────────────────────────────────────────────────────────
  const handleDueSave = async () => {
    if (!editDue) return;
    setDateError('');
    try {
      await taskApi.update(task.taskId, { startDate: editStart || null, dueDate: editDue });
      onRefetch?.(); setPanel(null);
    }
    catch (err) { setDateError(apiErrorMessage(err, 'Failed to update dates.')); }
  };

  // ── Description save ───────────────────────────────────────────────────────
  const handleDescSave = async () => {
    try { await taskApi.update(task.taskId, { description: editDesc }); onRefetch?.(); setPanel(null); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to update description.')); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    // Tasks are never hard-deleted — always deactivated, so its history and
    // any dependency edges stay intact (and other tasks depending on it get
    // auto-unblocked, same as if it had been completed). Reactivate to undo.
    if (!window.confirm(`Deactivate task "${task.name}"? It will be hidden from active work but can be reactivated later.`)) return;
    try {
      await taskApi.delete(task.taskId);
      onRefetch?.(); onRefetchProject?.();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to deactivate task.')); }
  };

  const handleReactivate = async () => {
    try { await taskApi.reactivate(task.taskId); onRefetch?.(); onRefetchProject?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to reactivate task.')); }
  };

  // ── Assignment requests ────────────────────────────────────────────────────
  // allRequests includes Pending, Accepted, Declined — so the manager can see
  // who declined and re-assign. assignees (Accepted only) are the confirmed participants.
  const allRequests = task.allRequests || [];
  const requestedIds = new Set(allRequests.map(r => String(r.userId)));

  const handleSendRequest = async () => {
    if (!assignSearch) return;
    setAssignError('');
    try {
      await taskApi.sendRequest(task.taskId, assignSearch.userId);
      setAssignSearch(null);
      onRefetch?.();
    } catch (err) {
      setAssignError(err?.response?.data?.error || 'Failed to send request.');
    }
  };

  const handleRemoveRequest = async (uid) => {
    try { await taskApi.removeRequest(task.taskId, uid); onRefetch?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove request.')); }
  };

  // ── Dependencies ───────────────────────────────────────────────────────────
  const currentDeps = new Set((task.dependsOn || []).map(Number));
  const otherTasks  = allTasks.filter(t => t.taskId !== task.taskId);

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await taskApi.addDep(task.taskId, depId); onRefetch?.(); }
    catch (err) { setDepError(apiErrorMessage(err, 'Cannot add dependency — would create a deadlock or cycle.')); }
  };
  const handleRemoveDep = async (depId) => {
    try { await taskApi.removeDep(task.taskId, depId); onRefetch?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove dependency.')); }
  };

  return (
    <>
      <TaskTableRow>
        {/* Name column — inline rename preserved */}
        {editingName ? (
          <Cell onClick={e => e.stopPropagation()}>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              autoFocus
              style={{ width:150, background: theme.colors.mid, border: `1px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm, padding: '4px 8px', color: theme.colors.onyx, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setEditingName(false); setEditName(task.name); } }} />
            <BtnPrimary style={{ padding: '3px 10px', fontSize: 11 }} onClick={handleNameSave}>✓</BtnPrimary>
            <BtnGhost style={{ padding: '3px 8px',  fontSize: 11 }} onClick={() => { setEditingName(false); setEditName(task.name); }}>✕</BtnGhost>
          </Cell>
        ) : (
          // canManager && !isInactive — same permission the old dedicated
          // "Rename" icon required. Clicking the name itself now opens the
          // same inline rename input that icon used to open; no separate
          // icon needed for an action whose target is already the thing
          // you're clicking on.
          <Cell
            onClick={(canManager && !isInactive) ? (e) => { e.stopPropagation(); setEditingName(true); } : undefined}
            style={{ cursor: (canManager && !isInactive) ? 'pointer' : 'default' }}
            title={(canManager && !isInactive) ? 'Click to rename' : undefined}
          >
            <TaskName title={task.name} style={{
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              textDecoration: localStatus === 'Complete' ? 'line-through' : 'none', opacity: localStatus === 'Complete' ? 0.5 : 1,
            }}>
              {task.name}
            </TaskName>
            {isInactive && <InactiveBadge />}
            {task.dependsOn?.length > 0 && (
              <DepBadge onClick={e => { e.stopPropagation(); togglePanel('deps'); }}
                title="This task has prerequisites" style={{ cursor: 'pointer', flexShrink: 0 }}>
                <ArrowRight size={10} strokeWidth={2.5} />
                {task.dependsOn.length}
              </DepBadge>
            )}
            {task.estimatedHours && <span style={{ fontSize: 10, color: theme.colors.ashLight, flexShrink: 0 }}>{task.estimatedHours}h</span>}
          </Cell>
        )}

        {/* Assignee column — clicking the avatar stack (however many
            assignees, pending or accepted) opens the same "manage
            assignees" panel the old dedicated "Assign" icon opened. One
            click target instead of a stack of avatars PLUS a separate
            icon that does the same thing. */}
        <Cell w={COL.assignee}
          // Previously only a Manager could click this cell at all — a
          // plain assignee with more assignees than the "+N" chip could
          // show had no way to see the rest of the list except a
          // browser-native hover tooltip (easy to miss, doesn't work on
          // touch). Now everyone can click: a Manager gets the full manage
          // panel (unchanged), anyone else gets a read-only list.
          onClick={!isInactive ? (e) => { e.stopPropagation(); togglePanel(canManager ? 'assign' : 'viewAssignees'); } : undefined}
          style={{ cursor: !isInactive ? 'pointer' : 'default' }}
          title={!isInactive ? (canManager ? 'Click to manage assignees' : 'Click to see all assignees') : undefined}
        >
          <Avatars assignees={task.assignees} pending={allRequests.filter(r => r.requestStatus === 'Pending')} />
        </Cell>

        {/* Due date column — clicking the date/badge opens the same edit
            panel the old dedicated "Due date" icon opened. */}
        <Cell w={COL.due}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('date'); } : undefined}
          style={{ cursor: (canEdit && !isInactive) ? 'pointer' : 'default' }}
          title={(canEdit && !isInactive) ? 'Click to edit due date' : undefined}
        >
          <DueDateBadge dueDate={task.dueDate} status={localStatus} />
        </Cell>

        {/* Priority column */}
        <Cell w={COL.priority}><PriorityBadge priority={task.priority} /></Cell>

        {/* Status column */}
        <Cell w={COL.status} onClick={e => e.stopPropagation()}>
          {canStatus && !isInactive && localStatus !== 'Blocked' ? (
            <select value={localStatus} onChange={handleStatusChange}
              style={{ width: '100%', background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, color:theme.colors.onyx, fontSize:11, padding:'3px 6px', fontFamily:'inherit', outline:'none' }}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <span title={localStatus === 'Blocked' ? 'Waiting on a prerequisite task — resolve its dependencies to unblock automatically.' : undefined}>
              <StatusBadge status={localStatus} />
            </span>
          )}
        </Cell>

        {/* Action toolbar — always visible. Rename/Assign/Due-date icons
            removed: their targets (name, assignee avatars, due date) are
            now directly clickable in the row itself, so a separate icon
            duplicating the same action was pure redundancy. Description
            stays — there's no visible description text in the row to
            click on instead. */}
        <RowActions data-row-actions onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              {!isInactive && (
                <IconBtn active={panel === 'desc'} title="Description" onClick={() => togglePanel('desc')} style={{ width:20, height:20 }}>
                  <FileText size={14} strokeWidth={2} />
                </IconBtn>
              )}
              {(canEdit || isAssigned) && (
                <ChatButton kind="task" id={task.taskId} compact />
              )}
            </>
          )}
          {canManager && (
            <>
              {/* Divider — visually separates the shared view/edit icons above
                  from the manager-only actions below, instead of all 5-7
                  icons reading as one undifferentiated cluster. */}
              <div style={{ width:1, height:16, background:theme.colors.border, margin:'0 1px', flexShrink:0 }} />
              {!isInactive && otherTasks.length > 0 && (
                <IconBtn active={panel === 'deps'} title="Prerequisites"
                  onClick={() => togglePanel('deps')} style={{ width:20, height:20 }}>
                  <ArrowRight size={14} strokeWidth={2} />
                </IconBtn>
              )}
              {isInactive ? (
                <IconBtn title="Reactivate" onClick={handleReactivate} style={{ width:20, height:20 }}>
                  <RotateCcw size={14} strokeWidth={2} />
                </IconBtn>
              ) : (
                <IconBtnDanger title="Deactivate" onClick={handleDelete} style={{ width:20, height:20 }}>
                  <Trash2 size={14} strokeWidth={2} />
                </IconBtnDanger>
              )}
            </>
          )}
        </RowActions>
      </TaskTableRow>

      {/* ── Description panel — viewable by anyone canEdit (assignee or
          Manager), but only a Manager can actually edit it. An assigned
          Member could previously open AND save changes here, which wasn't
          the intended split: assignee access is view-only for
          descriptions, editing is Manager-only. */}
      {panel === 'desc' && canEdit && (
        <SubPanel style={{ margin: 0 }}>
          <SubPanelTitle>Task Notes / Description</SubPanelTitle>
          <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
            readOnly={!canManager}
            placeholder={canManager ? 'Add context, acceptance criteria, links, notes…' : 'No description yet.'} rows={4}
            style={{ width: '100%', background: canManager ? theme.colors.mid : theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '8px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5, cursor: canManager ? 'text' : 'default' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {canManager
              ? <>
                  <BtnPrimary style={{ fontSize: 11, padding: '5px 14px' }} onClick={handleDescSave}>Save</BtnPrimary>
                  <BtnGhost style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setPanel(null); setEditDesc(task.description || ''); }}>Cancel</BtnGhost>
                </>
              : <BtnGhost style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setPanel(null)}>Close</BtnGhost>}
          </div>
        </SubPanel>
      )}

      {/* ── Start / Due date panel ── */}
      {panel === 'date' && canEdit && (
        <SubPanel style={{ margin: 0 }}>
          <SubPanelTitle>Dates</SubPanelTitle>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10.5, color: theme.colors.ash, marginBottom: 3 }}>Start date</div>
              <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: theme.colors.ash, marginBottom: 3 }}>Due date <span style={{ color: theme.colors.danger }}>*</span></div>
              <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <BtnPrimary style={{ fontSize: 11, padding: '6px 14px' }} onClick={handleDueSave} disabled={!editDue}>Save</BtnPrimary>
            <BtnGhost style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => { setPanel(null); setDateError(''); }}>Cancel</BtnGhost>
          </div>
          {!editDue && <div style={{ color: theme.colors.danger, fontSize: 11, marginTop: 4 }}>Due date is required.</div>}
          {dateError && <div style={{ color: theme.colors.danger, fontSize: 11, marginTop: 4 }}>{dateError}</div>}
        </SubPanel>
      )}

      {/* ── Assignee / request panel ── */}
      {panel === 'assign' && canManager && (
        <SubPanel style={{ margin: 0 }}>
          <SubPanelTitle>Task Assignees</SubPanelTitle>
          <SubPanelHint>
            Select from activity members below, or search any user — they'll be added to the activity automatically when they accept.
          </SubPanelHint>

          {/* Quick-pick from activity members */}
          {activityMembers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {activityMembers
                .filter(m => !requestedIds.has(String(m.userId)))
                .map(m => (
                  <BtnGhost key={m.userId} style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={async () => {
                      setAssignError('');
                      try { await taskApi.sendRequest(task.taskId, m.userId); onRefetch?.(); }
                      catch (err) { setAssignError(err?.response?.data?.error || 'Failed'); }
                    }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: theme.colors.mid, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx, flexShrink: 0 }}>
                      {initials(m.name)}
                    </span>
                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</span>
                    <span style={{ fontSize: 9, color: theme.colors.ash, flexShrink: 0 }}>+ Request</span>
                  </BtnGhost>
                ))
              }
            </div>
          )}

          {/* Search outside activity members */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <UserSearchInput
              selectedUser={assignSearch}
              onSelect={setAssignSearch}
              excludeUserIds={[...requestedIds]}
              placeholder="Search users outside activity…"
            />
            <BtnPrimary style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
              onClick={handleSendRequest} disabled={!assignSearch}>
              Send Request
            </BtnPrimary>
          </div>
          {assignError && <div style={{ color: theme.colors.danger, fontSize: 11, marginBottom: 8 }}>{assignError}</div>}

          {/* All requests with status badges */}
          {allRequests.length === 0 && (
            <div style={{ fontSize: 12, color: theme.colors.ash, fontStyle: 'italic' }}>No assignment requests sent yet.</div>
          )}
          {allRequests.map(r => {
            const badge = requestBadge(theme, r.requestStatus);
            return (
              <MemberRow key={r.userId} selected style={{ marginBottom: 4 }}>
                <Avatar style={{ flexShrink: 0, marginLeft: 0 }}>{initials(r.name)}</Avatar>
                <span style={{ flex: 1, minWidth: 60, fontSize: 12, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, borderRadius: 8, padding: '2px 8px', flexShrink: 0 }}>
                  {badge.label}
                </span>
                <BtnGhost style={{ fontSize: 11, padding: '2px 8px', color: theme.colors.danger, borderColor: 'rgba(168,93,77,.35)', flexShrink: 0 }}
                  onClick={() => handleRemoveRequest(r.userId)}>
                  Remove
                </BtnGhost>
              </MemberRow>
            );
          })}
        </SubPanel>
      )}

      {/* ── Read-only assignee list — for anyone who isn't a Manager (so
          can't open the full manage panel above). Same info the manage
          panel shows, minus the edit controls. */}
      {panel === 'viewAssignees' && !canManager && (
        <SubPanel style={{ margin: 0 }}>
          <SubPanelTitle>Task Assignees</SubPanelTitle>
          {allRequests.length === 0 ? (
            <div style={{ fontSize: 12, color: theme.colors.ash, fontStyle: 'italic' }}>No one assigned yet.</div>
          ) : (
            allRequests.map(r => {
              const badge = requestBadge(theme, r.requestStatus);
              return (
                <MemberRow key={r.userId} selected style={{ marginBottom: 4 }}>
                  <Avatar style={{ flexShrink: 0, marginLeft: 0 }}>{initials(r.name)}</Avatar>
                  <span style={{ flex: 1, minWidth: 60, fontSize: 12, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, borderRadius: 8, padding: '2px 8px', flexShrink: 0 }}>
                    {badge.label}
                  </span>
                </MemberRow>
              );
            })
          )}
          <BtnGhost style={{ fontSize: 11, padding: '5px 10px', marginTop: 8 }} onClick={() => setPanel(null)}>Close</BtnGhost>
        </SubPanel>
      )}

      {/* ── Dependency panel — viewable by anyone, editable by Manager only ── */}
      {panel === 'deps' && (
        <SubPanel style={{ margin: 0 }}>
          <SubPanelTitle>Prerequisites — Tasks that must complete first</SubPanelTitle>
          <SubPanelHint>
            {canManager
              ? <>Selecting a predecessor auto-<strong>blocks</strong> this task until it reaches Complete, then auto-unblocks. Cycles are prevented.</>
              : 'This task is blocked until the tasks below reach Complete.'}
          </SubPanelHint>

          {/* Current dep chips */}
          {currentDeps.size > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {[...currentDeps].map(depId => {
                const t = otherTasks.find(x => x.taskId === depId);
                if (!t) return null;
                return (
                  <span key={depId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '2px 8px 2px 10px', maxWidth: '100%' }}>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</span>
                    {canManager && (
                      <button type="button" onClick={() => handleRemoveDep(depId)}
                        style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: canManager ? 8 : 0 }}>No prerequisites set.</div>
          )}

          {/* Add via dropdown — Manager only */}
          {canManager && (
            otherTasks.filter(t => !currentDeps.has(t.taskId)).length > 0 ? (
              <select defaultValue="" onChange={e => { if (e.target.value) { handleAddDep(Number(e.target.value)); e.target.value = ''; } }}
                style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
                <option value="">+ Add a predecessor task…</option>
                {otherTasks.filter(t => !currentDeps.has(t.taskId)).map(t => (
                  <option key={t.taskId} value={t.taskId}>{t.name} ({t.status})</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 12, color: theme.colors.ash }}>All tasks already added as prerequisites.</div>
            )
          )}

          {depError && <div style={{ color: theme.colors.danger, fontSize: 11, marginTop: 6 }}>{depError}</div>}
        </SubPanel>
      )}
    </>
  );
}
