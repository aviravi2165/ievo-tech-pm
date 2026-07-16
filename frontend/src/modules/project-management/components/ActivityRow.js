import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronRight, ArrowRight, RotateCcw, Trash2, Lock, Users } from 'lucide-react';
import StatusBadge, { InactiveBadge } from './StatusBadge';
import ProgressBar from './ProgressBar';
import DelayBadge from './DelayBadge';
import TaskItem from './TaskItem';
import UserSearchInput from './UserSearchInput';
import ChatButton from './ChatButton';
import { activityApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { GroupRow, RowActions, COL, TASK_GRID_COLS, TableHead, TableHeadCell } from '../styles/Table.styles';
import { ActivityName, ActivityBody } from '../styles/ActivityRow.styles';
import {
  DepBadge, IconBtn, IconBtnDanger, EditPanelTitle, BtnPrimary, BtnGhost, TaskList,
} from '../styles/shared.styles';

const PRIORITY_OPTS = ['Low', 'Medium', 'High', 'Critical'];

function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function fmtRange(start, end) {
  const s = parseLocalDate(start), e = parseLocalDate(end);
  if (!s && !e) return null;
  const fmt = d => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${s ? fmt(s) : '?'} → ${e ? fmt(e) : '?'}`;
}


export default function ActivityRow({
  activity, allActivities = [], projectMembers = [], myUserId, onRefetchPhase, onRefetchProject
}) {
  const theme = useTheme();
  const [open,             setOpen]             = useState(false);
  const [tasks,            setTasks]            = useState([]);
  const [loadingTasks,     setLoadingTasks]     = useState(false);
  // Every status change / edit anywhere under this activity re-triggers
  // fetchTasks (directly via TaskItem's onRefetch, AND indirectly via the
  // project-level socket listener refetching everything above it) —
  // setLoadingTasks(true) unconditionally on every one of those calls made
  // the task list flash empty/"Loading…" and remount on every single
  // action, which is what actually read as the list "rolling back" even
  // though the underlying data was always correct. Same fix as
  // useProject.js's hasLoadedRef: only the true first load shows the
  // loading state; later background refetches update tasks in place.
  const hasLoadedTasksRef = useRef(false);
  const [panel,            setPanel]            = useState(null); // 'edit'|'deps'|'addtask'|'members'

  // Activity members state
  const [actMembers,       setActMembers]       = useState([]);
  const [memberLoading,    setMemberLoading]    = useState(false);
  const [memberSearch,     setMemberSearch]     = useState(null);
  const [memberError,      setMemberError]      = useState('');
  // Role to add a new member at — was always hardcoded to 'Employee' with
  // no way to add someone as Manager or Viewer directly, and no way to
  // change an existing member's role after adding them (no promote/demote
  // UI existed at all despite the backend already supporting it).
  const [newMemberRole,    setNewMemberRole]    = useState('Employee');

  // Edit form
  const [editStart,  setEditStart]  = useState(toInput(activity.plannedStart));
  const [editEnd,    setEditEnd]    = useState(toInput(activity.plannedEnd));
  const [editDesc,   setEditDesc]   = useState(activity.description || '');
  const [editOwner,  setEditOwner]  = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  // Add task form
  const [newTaskName,  setNewTaskName]  = useState('');
  const [newTaskPrio,  setNewTaskPrio]  = useState('Medium');
  const [newTaskDue,   setNewTaskDue]   = useState('');
  const [newTaskStart, setNewTaskStart] = useState('');
  const [newTaskDesc,  setNewTaskDesc]  = useState('');
  const [newTaskDeps,  setNewTaskDeps]  = useState([]);
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [taskAssignSearch, setTaskAssignSearch] = useState(null);
  const [addErrors,    setAddErrors]    = useState({});
  const [depError, setDepError] = useState('');

  // activity.myRole is the user's EFFECTIVE role on THIS activity (explicit
  // activity-level row, else inherited from phase/project role — see
  // roleService). Explicit activity roles are stored as 'Manager' |
  // 'Employee' | 'Viewer'; an inherited project role instead reads as
  // 'Manager' | 'Member' | 'Viewer' — 'Employee' and 'Member' are the same
  // rank (see roleService.RANK), so both must be treated as "member-level"
  // here.
  const canEdit   = activity.myRole === 'Manager';
  const canMember = activity.myRole === 'Employee' || activity.myRole === 'Member';

  // After actMembers load, know if this user belongs to this activity
  const isUserActivityMember = actMembers.some(m => String(m.userId) === String(myUserId));

  // ── Chat visibility ──────────────────────────────────────────────────────────
  // Manager: always sees chat (full access).
  // Member:  when collapsed we don't know yet → show button (ChatButton handles 403 gracefully).
  //          when expanded & members loaded → show only if confirmed member.
  const showChatButton = canEdit || (canMember && (!open || isUserActivityMember));

  useEffect(() => {
    setEditStart(toInput(activity.plannedStart));
    setEditEnd(toInput(activity.plannedEnd));
    setEditDesc(activity.description || '');
  }, [activity.plannedStart, activity.plannedEnd, activity.description]);

  // ── Fetch tasks ─────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!hasLoadedTasksRef.current) setLoadingTasks(true);
    try { setTasks(await activityApi.getTasks(activity.activityId)); }
    catch { }
    finally { hasLoadedTasksRef.current = true; setLoadingTasks(false); }
  }, [activity.activityId]);

  // ── Fetch activity members ──────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    setMemberLoading(true);
    try { setActMembers(await activityApi.getMembers(activity.activityId)); }
    catch { }
    finally { setMemberLoading(false); }
  }, [activity.activityId]);

  useEffect(() => {
    if (open) { fetchTasks(); fetchMembers(); }
  }, [open, fetchTasks, fetchMembers]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  // ── Edit activity save ───────────────────────────────────────────────────────
  const handleEditSave = async () => {
    const errs = {};
    if (!editStart) errs.start = 'Start date required';
    if (!editEnd)   errs.end   = 'End date required';
    if (editStart && editEnd && editEnd < editStart) errs.end = 'End must be after start';
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    setEditSaving(true);
    try {
      await activityApi.update(activity.activityId, {
        plannedStart: editStart || null,
        plannedEnd:   editEnd   || null,
        description:  editDesc  || null,
        ownerId:      editOwner?.userId || activity.ownerId || null,
      });
      onRefetchPhase?.(); onRefetchProject?.();
      setPanel(null); setEditErrors({});
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to save activity.')); }
    finally { setEditSaving(false); }
  };

  // ── Activity member management ───────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!memberSearch) return;
    setMemberError('');
    try {
      await activityApi.addMember(activity.activityId, memberSearch.userId, newMemberRole);
      setMemberSearch(null);
      setNewMemberRole('Employee');
      await fetchMembers();
    } catch (err) {
      setMemberError(err?.response?.data?.error || 'Failed to add member.');
    }
  };

  const handleMemberRoleChange = async (uid, role) => {
    try { await activityApi.updateMemberRole(activity.activityId, uid, role); await fetchMembers(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to change role.')); }
  };

  const handleRemoveMember = async (uid) => {
    try { await activityApi.removeMember(activity.activityId, uid); await fetchMembers(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
  };

  // ── Add task ─────────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    const errs = {};
    if (!newTaskName.trim()) errs.name = 'Task name required';
    if (!newTaskDue)         errs.due  = 'Due date is required';
    if (Object.keys(errs).length) { setAddErrors(errs); return; }
    try {
      await activityApi.createTask(activity.activityId, {
        name:        newTaskName.trim(),
        priority:    newTaskPrio,
        startDate:   newTaskStart || null,
        dueDate:     newTaskDue,
        description: newTaskDesc || null,
        assigneeIds: taskAssignees.map(a => a.userId),
      });
      setNewTaskName(''); setNewTaskDue(''); setNewTaskStart(''); setNewTaskDesc('');
      setTaskAssignees([]); setTaskAssignSearch(null); setNewTaskDeps([]);
      setPanel(null); setAddErrors({});
      fetchTasks(); onRefetchProject?.();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to add task.')); }
  };

  // ── Activity dependencies ────────────────────────────────────────────────────
  const otherActivities = allActivities.filter(a => a.activityId !== activity.activityId);
  const currentDeps = new Set((activity.dependsOn || []).map(Number));

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await activityApi.addDep(activity.activityId, depId); onRefetchPhase?.(); }
    catch (err) { setDepError(apiErrorMessage(err, 'Cannot add — would create a cycle.')); }
  };
  const handleRemoveDep = async (depId) => {
    try { await activityApi.removeDep(activity.activityId, depId); onRefetchPhase?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove dependency.')); }
  };

  const isBlocked  = activity.status === 'Blocked';
  const isInactive = activity.isActive === false;

  const handleDelete = async () => {
    if (!window.confirm(`Delete activity "${activity.name}"?`)) return;
    try {
      const { action } = await activityApi.delete(activity.activityId);
      if (action === 'deactivated') alert('This activity still has tasks — it was deactivated instead of deleted.');
      onRefetchPhase?.(); onRefetchProject?.();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to delete activity.')); }
  };

  const handleReactivate = async () => {
    try { await activityApi.reactivate(activity.activityId); onRefetchPhase?.(); onRefetchProject?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to reactivate activity.')); }
  };

  return (
    <>
      {/* ── Group-header row (table row, level 1 — indented one step deeper
          than its parent Phase's GroupRow) ── */}
      <GroupRow level={1} onClick={() => setOpen(v => !v)}>

        {/* Grid column 1 — chevron/name/dep-badge/progress/inactive all in
            one wrapping item, same reasoning as PhasePanel.js. */}
        <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden', minWidth:0 }}>
          <ChevronRight size={11} strokeWidth={2.5}
            style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, color: theme.colors.ash }} />

          <ActivityName style={{ opacity: (isBlocked || isInactive) ? 0.5 : 1 }} title={activity.name}>
            {activity.name}
          </ActivityName>

          {activity.dependsOn?.length > 0 && (
            <DepBadge
              title={`Depends on ${activity.dependsOn.length} activity`}
              onClick={e => { e.stopPropagation(); togglePanel('deps'); }} style={{ flexShrink:0 }}>
              <ArrowRight size={10} strokeWidth={2.5} />
              {activity.dependsOn.length}
            </DepBadge>
          )}

          <div style={{ width:104, flexShrink:0 }}><ProgressBar value={activity.progress || 0} /></div>
          {isInactive && <InactiveBadge />}
        </div>

        {/* Grid column 2: Manager — shows the Activity's own Manager(s)
            when explicitly set; falls back to the project Manager(s) when
            nothing's been added at the activity level yet (a project
            Manager already has full authority over every activity per
            roleService's inheritance rule, so they genuinely are the
            effective manager here). Clicking it opens the same "manage
            members" panel the old dedicated Members icon opened. */}
        <div style={{ overflow:'hidden', cursor: canEdit && !isInactive ? 'pointer' : 'default' }}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('members'); if (panel !== 'members') fetchMembers(); } : undefined}
          title={(canEdit && !isInactive) ? 'Click to manage members' : undefined}
        >
          {(() => {
            const projectManagerNames = projectMembers.filter(m => m.role === 'Manager').map(m => m.name).join(', ');
            const label = activity.managerNames || projectManagerNames;
            if (!label) return activity.memberCount > 0
              ? <span style={{ fontSize:10, color:theme.colors.ash }}>{activity.memberCount} member{activity.memberCount !== 1 ? 's' : ''}</span>
              : null;
            return (
              <span style={{ fontSize:10, color: activity.managerNames ? theme.colors.onyx : theme.colors.ash, fontWeight: activity.managerNames ? 600 : 400, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}
                title={activity.managerNames ? label : `${label} (project Manager — no Activity-specific Manager set)`}>
                {label}
              </span>
            );
          })()}
        </div>

        {/* Grid column 3: Dates — the actual planned date range AND the
            delay warning together, not one replacing the other. Clicking
            it opens the same edit panel (dates + description + owner) the
            old dedicated "Edit" pencil icon opened — Activity has no
            separate rename capability, so this IS the activity's one real
            edit surface. */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, overflow:'hidden', cursor: canEdit && !isInactive ? 'pointer' : 'default' }}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('edit'); } : undefined}
          title={(canEdit && !isInactive) ? 'Click to edit dates / description / owner' : undefined}
        >
          <span style={{ fontSize:10, color:theme.colors.ash, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{fmtRange(activity.plannedStart, activity.plannedEnd)}</span>
          {activity.delayDays > 0 && <DelayBadge days={activity.delayDays} label="Late by" />}
        </div>

        {/* Grid column 4: Status */}
        <div style={{ overflow:'hidden' }}>
          <StatusBadge status={activity.status} />
        </div>

        {/* Grid column 5 (max-content): actions — always visible. "Edit"
            icon removed: clicking the Dates cell above opens the same
            panel. "Members" icon was ALSO removed earlier in favor of
            clicking the Manager cell text — that made adding a Manager/
            Viewer here undiscoverable, so it's back as an explicit icon
            alongside that click, not instead of it. */}
        {canEdit && (
          <RowActions onClick={e => e.stopPropagation()}>
            {!isInactive && (
              <IconBtn active={panel === 'members'} title="Add Manager / Viewer / member"
                onClick={() => { togglePanel('members'); if (panel !== 'members') fetchMembers(); }} style={{ width:20, height:20 }}>
                <Users size={14} strokeWidth={2} />
              </IconBtn>
            )}
            {showChatButton && (
              <span onClick={e => e.stopPropagation()}>
                <ChatButton kind="activity" id={activity.activityId} compact />
              </span>
            )}
            {!isInactive && otherActivities.length > 0 && (
              <IconBtn active={panel === 'deps'} title="Prerequisites"
                onClick={() => togglePanel('deps')} style={{ width:20, height:20 }}>
                <ArrowRight size={14} strokeWidth={2} />
              </IconBtn>
            )}
            <div style={{ width:1, height:16, background:theme.colors.border, margin:'0 1px', flexShrink:0 }} />
            {isInactive ? (
              <IconBtn title="Reactivate" onClick={handleReactivate} style={{ width:20, height:20 }}>
                <RotateCcw size={14} strokeWidth={2} />
              </IconBtn>
            ) : (
              <IconBtnDanger title="Delete" onClick={handleDelete} style={{ width:20, height:20 }}>
                <Trash2 size={14} strokeWidth={2} />
              </IconBtnDanger>
            )}
          </RowActions>
        )}
      </GroupRow>

      {/* ── Edit activity panel ── */}
      {panel === 'edit' && canEdit && (
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${theme.colors.border}`, background: theme.colors.greige }}>
          <EditPanelTitle>Edit Activity</EditPanelTitle>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>Start Date *</label>
              <input type="date" value={editStart} onChange={e => { setEditStart(e.target.value); setEditErrors(er => ({ ...er, start: '' })); }}
                style={{ background: theme.colors.mid, border: `1px solid ${editErrors.start ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              {editErrors.start && <span style={{ fontSize: 10, color: theme.colors.danger }}>{editErrors.start}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>End Date *</label>
              <input type="date" value={editEnd} min={editStart || undefined} onChange={e => { setEditEnd(e.target.value); setEditErrors(er => ({ ...er, end: '' })); }}
                style={{ background: theme.colors.mid, border: `1px solid ${editErrors.end ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              {editErrors.end && <span style={{ fontSize: 10, color: theme.colors.danger }}>{editErrors.end}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>Owner (search users)</label>
              <UserSearchInput selectedUser={editOwner} onSelect={setEditOwner}
                placeholder={activity.ownerName ? `Current: ${activity.ownerName}` : 'Search to assign owner…'} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Description</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
              placeholder="Describe the activity's goal…" rows={2}
              style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <BtnPrimary style={{ fontSize: 11, padding: '6px 16px' }} onClick={handleEditSave} disabled={editSaving}>{editSaving ? '…' : 'Save'}</BtnPrimary>
            <BtnGhost style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { setPanel(null); setEditErrors({}); }}>Cancel</BtnGhost>
          </div>
        </div>
      )}

      {/* ── Activity Members panel ── */}
      {panel === 'members' && canEdit && (
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${theme.colors.border}`, background: theme.colors.greige }}>
          <EditPanelTitle>Activity Members</EditPanelTitle>
          <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 10 }}>
            These users can be assigned to tasks within this activity. Task assignees are automatically added here on acceptance.
          </div>

          {/* Role to add at — was hardcoded to 'Employee' with no way to add
              someone as Manager or Viewer directly. Applies to both the
              quick-add chips below and the search-based Add. */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Add as</label>
            <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)}
              style={{ background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'4px 8px', color:theme.colors.onyx, fontSize:11, fontFamily:'inherit', outline:'none' }}>
              <option value="Manager">Manager — full management of this activity</option>
              <option value="Employee">Employee — can be assigned to tasks</option>
              <option value="Viewer">Viewer — read-only access to this activity</option>
            </select>
          </div>

          {projectMembers.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', marginBottom: 5 }}>Add from project members</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {projectMembers
                  .filter(pm => !actMembers.find(am => String(am.userId) === String(pm.userId)))
                  .map(pm => (
                    <BtnGhost key={pm.userId} style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={async () => {
                        try { await activityApi.addMember(activity.activityId, pm.userId, newMemberRole); await fetchMembers(); }
                        catch (err) { showToast(apiErrorMessage(err, 'Failed to add member.')); }
                      }}>
                      + {pm.name || pm.email}
                    </BtnGhost>
                  ))
                }
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <UserSearchInput selectedUser={memberSearch} onSelect={setMemberSearch}
              excludeUserIds={actMembers.map(m => m.userId)}
              placeholder="Search users to add…" />
            <BtnPrimary style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
              onClick={handleAddMember} disabled={!memberSearch}>
              Add
            </BtnPrimary>
          </div>
          {memberError && <div style={{ color: theme.colors.danger, fontSize: 11, marginBottom: 8 }}>{memberError}</div>}

          {memberLoading && <div style={{ fontSize: 12, color: theme.colors.ash }}>Loading…</div>}
          {/* Existing members now show a role dropdown (promote/demote)
              instead of a fixed role — this action never existed in the UI
              before even though the backend already supported it. */}
          {!memberLoading && actMembers.map(m => (
            <div key={m.userId} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', marginBottom: 4, border:`1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: 'rgba(46, 40, 35, 0.06)' }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background: theme.colors.mid, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color: theme.colors.onyx, flexShrink: 0 }}>{initials(m.name)}</div>
              {/* name/email both truncate — an email is one unbreakable
                  token, so without a shrink+ellipsis guard a long one
                  forces this whole flex row wider than the panel and
                  pushes the role select + Remove button out of view. */}
              <span style={{ flex: 1, minWidth: 60, fontSize: 12, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</span>
              <span style={{ fontSize: 11, color: theme.colors.ash, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>{m.email}</span>
              <select value={m.role} onChange={e => handleMemberRoleChange(m.userId, e.target.value)}
                style={{ background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'3px 6px', color:theme.colors.onyx, fontSize:11, fontFamily:'inherit', outline:'none' }}>
                <option value="Manager">Manager</option>
                <option value="Employee">Employee</option>
                <option value="Viewer">Viewer</option>
              </select>
              {String(m.userId) !== String(myUserId) && (
                <BtnGhost style={{ fontSize: 11, padding: '2px 8px', color: theme.colors.danger, borderColor: 'rgba(168,93,77,.35)' }}
                  onClick={() => handleRemoveMember(m.userId)}>Remove</BtnGhost>
              )}
            </div>
          ))}
          {!memberLoading && actMembers.length === 0 && (
            <div style={{ fontSize: 12, color: theme.colors.ash, fontStyle: 'italic' }}>No members yet.</div>
          )}
        </div>
      )}

      {/* ── Dependency panel — viewable by anyone, editable by Manager only ── */}
      {panel === 'deps' && (
        <div style={{ padding: '10px 14px 12px', borderTop: `1px solid ${theme.colors.border}`, background: theme.colors.greige }}>
          <EditPanelTitle style={{ marginBottom: 6 }}>Activity Prerequisites</EditPanelTitle>
          <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 10 }}>
            {canEdit
              ? <>Selecting a predecessor auto-<strong>blocks</strong> this activity until it completes, then auto-unblocks. Cycles are prevented.</>
              : 'This activity is blocked until the activities below complete.'}
          </div>

          {/* Current dep chips */}
          {currentDeps.size > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {[...currentDeps].map(depId => {
                const act = otherActivities.find(a => a.activityId === depId);
                if (!act) return null;
                return (
                  <span key={depId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '2px 8px 2px 10px', maxWidth: '100%' }}>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={act.name}>{act.name}</span>
                    {canEdit && (
                      <button type="button" onClick={() => handleRemoveDep(depId)}
                        style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: canEdit ? 8 : 0 }}>No prerequisites set.</div>
          )}

          {/* Add via dropdown — Manager only */}
          {canEdit && (
            otherActivities.filter(a => !currentDeps.has(a.activityId)).length > 0 ? (
              <select defaultValue="" onChange={e => { if (e.target.value) { handleAddDep(Number(e.target.value)); e.target.value = ''; } }}
                style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
                <option value="">+ Add a predecessor activity…</option>
                {otherActivities.filter(a => !currentDeps.has(a.activityId)).map(a => (
                  <option key={a.activityId} value={a.activityId}>{a.name} ({a.status})</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 12, color: theme.colors.ash }}>All activities already added as prerequisites.</div>
            )
          )}

          {depError && <div style={{ color: theme.colors.danger, fontSize: 11, marginTop: 6 }}>{depError}</div>}
        </div>
      )}

      {/* ── Body: tasks + add task ── */}
      {open && (
        <ActivityBody>
          {activity.description && panel !== 'edit' && (
            <p style={{ fontSize: 12, color: theme.colors.ash, margin: '8px 0', lineHeight: 1.5 }}>{activity.description}</p>
          )}

          {isBlocked && (
            <div style={{ background: `${theme.colors.warning}24`, border: `1px solid ${theme.colors.warning}`, borderRadius: theme.radius.sm, padding: '6px 12px', marginBottom: 10, fontSize: 11, color: theme.colors.warning }}>
              🔒 This activity is blocked. Resolve its dependencies before adding or updating tasks.
            </div>
          )}

          {/* Non-member notice — shown to Members who aren't in this activity */}
          {canMember && !memberLoading && !isUserActivityMember && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', marginBottom: 8,
              background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
              fontSize: 12, color: theme.colors.ash }}>
              <Lock size={14} strokeWidth={2} />
              You are not a member of this activity — contact a Manager to be added.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 6px' }}>
            <span style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Tasks ({tasks.length})
            </span>
            {canEdit && !isBlocked && !isInactive && (
              <BtnGhost style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => togglePanel('addtask')}>
                + Add Task
              </BtnGhost>
            )}
          </div>

          {/* ── Add task form ── */}
          {panel === 'addtask' && canEdit && (
            <div style={{ background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '12px 14px', marginBottom: 10 }}>
              <EditPanelTitle>New Task</EditPanelTitle>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Task Name *</label>
                <input value={newTaskName} onChange={e => { setNewTaskName(e.target.value); setAddErrors(er => ({ ...er, name: '' })); }}
                  placeholder="What needs to be done?" autoFocus
                  style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${addErrors.name ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()} />
                {addErrors.name && <span style={{ fontSize: 10, color: theme.colors.danger }}>{addErrors.name}</span>}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>Start Date</label>
                  <input type="date" value={newTaskStart} min={activity.plannedStart ? String(activity.plannedStart).split('T')[0] : undefined}
                    onChange={e => setNewTaskStart(e.target.value)}
                    style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>Due Date *</label>
                  <input type="date" value={newTaskDue} onChange={e => { setNewTaskDue(e.target.value); setAddErrors(er => ({ ...er, due: '' })); }}
                    style={{ background: theme.colors.mid, border: `1px solid ${addErrors.due ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                  {addErrors.due && <span style={{ fontSize: 10, color: theme.colors.danger }}>{addErrors.due}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>Priority</label>
                  <select value={newTaskPrio} onChange={e => setNewTaskPrio(e.target.value)}
                    style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
                    {PRIORITY_OPTS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Assignee picker */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                  Assign To (optional — sends assignment request)
                </label>
                {actMembers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                    {actMembers.map(m => {
                      const already = taskAssignees.some(a => String(a.userId) === String(m.userId));
                      const Comp = already ? BtnPrimary : BtnGhost;
                      return (
                        <Comp key={m.userId} type="button"
                          style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => {
                            if (already) setTaskAssignees(prev => prev.filter(a => String(a.userId) !== String(m.userId)));
                            else setTaskAssignees(prev => [...prev, { userId: m.userId, name: m.name }]);
                          }}>
                          {already ? '✓ ' : ''}{m.name}
                        </Comp>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <UserSearchInput selectedUser={taskAssignSearch} onSelect={setTaskAssignSearch}
                    excludeUserIds={taskAssignees.map(a => a.userId)}
                    placeholder="Search users outside activity…" />
                  <BtnGhost type="button" style={{ fontSize: 11, padding: '6px 10px', flexShrink: 0 }}
                    onClick={() => {
                      if (!taskAssignSearch) return;
                      setTaskAssignees(prev => [...prev, { userId: taskAssignSearch.userId, name: taskAssignSearch.name || taskAssignSearch.email }]);
                      setTaskAssignSearch(null);
                    }} disabled={!taskAssignSearch}>
                    + Add
                  </BtnGhost>
                </div>
                {taskAssignees.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                    {taskAssignees.map(a => (
                      <span key={a.userId} style={{ fontSize: 11, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {a.name}
                        <button type="button" style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                          onClick={() => setTaskAssignees(prev => prev.filter(x => String(x.userId) !== String(a.userId)))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Notes (optional)</label>
                <textarea value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder="Any context or acceptance criteria…" rows={2}
                  style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <BtnPrimary style={{ fontSize: 11, padding: '6px 16px' }} onClick={handleAddTask}>Add Task</BtnPrimary>
                <BtnGhost style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => { setPanel(null); setAddErrors({}); }}>Cancel</BtnGhost>
              </div>
            </div>
          )}

          {/* ── Task list ── */}
          <TaskList>
            {loadingTasks && <div style={{ color: theme.colors.ash, fontSize: 12, padding: '8px 0' }}>Loading…</div>}

            {/* Task's OWN column header — Assignee/Due Date/Priority are
                genuinely Task-only fields (a Task has one real assignee
                and a real priority, unlike Phase/Activity), shown right
                where Task rows actually start. */}
            {/* paddingLeft:40 matches TaskTableRow's own indent (10 +
                2*15) so "TASK" lines up with the actual task name below it
                instead of sitting to the left of the indented row. */}
            {/* Neutral (ash-tinted, not copper or navy) below — Task is the
                leaf "data" level, not part of the Phase/Activity color
                story, so its rows and header stay plain/white rather than
                adding a third competing hue. */}
            {!loadingTasks && tasks.length > 0 && (
              <TableHead cols={TASK_GRID_COLS} style={{ marginBottom:2, borderRadius:6, paddingLeft:40, background:`linear-gradient(90deg, ${theme.colors.white} 0%, ${theme.colors.ash}30 100%)` }}>
                <TableHeadCell>Task</TableHeadCell>
                <TableHeadCell w={COL.assignee}>Assignee</TableHeadCell>
                <TableHeadCell w={COL.due}>Due Date</TableHeadCell>
                <TableHeadCell w={COL.priority}>Priority</TableHeadCell>
                <TableHeadCell w={COL.status}>Status</TableHeadCell>
              </TableHead>
            )}
            {!loadingTasks && tasks.map(t => (
              <TaskItem
                key={t.taskId}
                task={t}
                activityRole={activity.myRole}
                myUserId={myUserId}
                allTasks={tasks}
                activityMembers={actMembers}
                onRefetch={async () => { await fetchTasks(); onRefetchPhase?.(); }}
                onRefetchProject={onRefetchProject}
              />
            ))}
            {!loadingTasks && !tasks.length && (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '8px 0' }}>No tasks yet.</div>
            )}
          </TaskList>
        </ActivityBody>
      )}
    </>
  );
}
