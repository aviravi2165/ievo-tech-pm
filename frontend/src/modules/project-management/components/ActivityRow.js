import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronRight, ArrowRight, RotateCcw, Trash2, Lock, Users } from 'lucide-react';
import StatusBadge, { InactiveBadge, statusLabel } from './StatusBadge';
import ProgressBar from './ProgressBar';
import ScheduleBadge from './ScheduleBadge';
import EmptyStateHint from './EmptyStateHint';
import TaskItem from './TaskItem';
import UserSearchInput from './UserSearchInput';
import ChatButton from './ChatButton';
import ParticipantsPanel from './ParticipantsPanel';
import { aggregateAssignees } from '../utils/aggregateAssignees';
import { activityApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { GroupRow, RowActions, COL, TASK_GRID_COLS, TableHead, TableHeadCell } from '../styles/Table.styles';
import { ActivityName, ActivityBody } from '../styles/ActivityRow.styles';
import {
  DepBadge, WeightBadge, IconBtn, IconBtnDanger, EditPanelTitle, BtnPrimary, BtnGhost, TaskList,
} from '../styles/shared.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect, FilterSelect, FilterToggle } from '../../shared/components/TableControls';
import FloatingPopover from '../../shared/components/FloatingPopover';

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
  activity, allActivities = [], projectMembers = [], phaseManagers = [], myUserId, onRefetchPhase, onRefetchProject
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
  // Participants panel is a floating popup (matches the Project-level
  // popup's exact pattern) rather than an inline-expanding block.
  const participantsRef = useRef(null);
  // Dependency popup — same floating-popup treatment, same two-triggers
  // reasoning as PhasePanel.js's own depsAnchorEl.
  const [depsAnchorEl, setDepsAnchorEl] = useState(null);

  // Activity managers state — "Activity Members" (a generic assignable
  // tier) doesn't exist as something you manually add anymore; this list
  // is now specifically who's an explicit MANAGER of this activity. Regular
  // team members get access by being assigned to a task (see the Assignees
  // roll-up ParticipantsPanel computes from `tasks` below), not by being
  // pre-added here.
  const [actMembers,       setActMembers]       = useState([]);
  const [memberLoading,    setMemberLoading]    = useState(false);

  // Edit form
  const [editName,   setEditName]   = useState(activity.name || '');
  const [editStart,  setEditStart]  = useState(toInput(activity.plannedStart));
  const [editEnd,    setEditEnd]    = useState(toInput(activity.plannedEnd));
  const [editDesc,   setEditDesc]   = useState(activity.description || '');
  const [editWeight, setEditWeight] = useState(activity.weightage ?? '');
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  // Edit-activity popup — same floating-popup treatment as Participants/
  // Dependencies, one trigger (the Dates cell), so a plain ref works here
  // (unlike depsAnchorEl, which has two possible triggers).
  const editRef = useRef(null);

  // Add task form
  const [newTaskName,  setNewTaskName]  = useState('');
  const [newTaskPrio,  setNewTaskPrio]  = useState('Medium');
  const [newTaskDue,   setNewTaskDue]   = useState('');
  const [newTaskStart, setNewTaskStart] = useState('');
  const [newTaskDesc,  setNewTaskDesc]  = useState('');
  const [newTaskWeight, setNewTaskWeight] = useState('');
  const [newTaskDeps,  setNewTaskDeps]  = useState([]);
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [taskAssignSearch, setTaskAssignSearch] = useState(null);
  const [addingTask, setAddingTask] = useState(false);
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
    setEditName(activity.name || '');
    setEditStart(toInput(activity.plannedStart));
    setEditEnd(toInput(activity.plannedEnd));
    setEditDesc(activity.description || '');
    setEditWeight(activity.weightage ?? '');
  }, [activity.name, activity.plannedStart, activity.plannedEnd, activity.description, activity.weightage]);

  // How much of the parent Phase's 100% weightage budget is available for
  // THIS activity — every other active activity's share is already spoken
  // for, so this activity's own current share is added back into the pool
  // it can choose from (raising it doesn't "use" budget it already has).
  const weightBudget = useMemo(() => {
    const othersSum = allActivities
      .filter(a => a.activityId !== activity.activityId && a.isActive !== false)
      .reduce((s, a) => s + (Number(a.weightage) || 0), 0);
    return Math.max(0, Math.round((100 - othersSum) * 100) / 100);
  }, [allActivities, activity.activityId]);

  // Weightage budget for this Activity's own Tasks — one level further down
  // the same pattern as weightBudget above / PhasePanel.js's
  // phaseWeightSum/phaseWeightRemaining. Only active Tasks count, matching
  // the backend's own getActivityWeightageTotal filter.
  const taskWeightSum = tasks
    .filter(t => t.isActive !== false)
    .reduce((s, t) => s + (Number(t.weightage) || 0), 0);
  const taskWeightRemaining = Math.max(0, Math.round((100 - taskWeightSum) * 100) / 100);
  const taskWeightageLocked = taskWeightRemaining <= 0;

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

  useEffect(() => {
    if (panel !== 'members') return;
    const handler = (e) => { if (participantsRef.current && !participantsRef.current.contains(e.target)) setPanel(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panel]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  // UI-only sort/filter over this activity's already-loaded tasks list.
  const taskStatusOptions = [...new Set(tasks.map(t => t.status).filter(Boolean))].map(s => ({ value: s, label: statusLabel(s) }));
  const {
    items: visibleTasks, sortKey: taskSortKey, setSortKey: setTaskSortKey,
    sortDir: taskSortDir, toggleSortDir: toggleTaskSortDir, filters: taskFilters, setFilter: setTaskFilter,
  } = useSortFilter(tasks, {
    sorters: {
      name:     (a, b) => (a.name || '').localeCompare(b.name || ''),
      due:      (a, b) => (parseLocalDate(a.dueDate)?.getTime() ?? 0) - (parseLocalDate(b.dueDate)?.getTime() ?? 0),
      priority: (a, b) => PRIORITY_OPTS.indexOf(a.priority) - PRIORITY_OPTS.indexOf(b.priority),
      status:   (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    defaultSortKey: 'due',
    filters: {
      status:   { predicate: (t, v) => t.status === v },
      priority: { predicate: (t, v) => t.priority === v },
      active:   { predicate: (t, v) => (v === 'active' ? t.isActive !== false : t.isActive === false) },
    },
  });

  // ── Edit activity save ───────────────────────────────────────────────────────
  const handleEditSave = async () => {
    const errs = {};
    if (!editName.trim()) errs.name = 'Name required';
    if (!editStart) errs.start = 'Start date required';
    if (!editEnd)   errs.end   = 'End date required';
    if (editStart && editEnd && editEnd < editStart) errs.end = 'End must be after start';
    if (editWeight === '') errs.weight = 'Weightage is required';
    if (editWeight !== '' && Number(editWeight) < 1) errs.weight = 'Weightage must be at least 1%';
    if (editWeight !== '' && Number(editWeight) > weightBudget) {
      errs.weight = `Only ${weightBudget}% of this phase's weightage is available`;
    }
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    setEditSaving(true);
    try {
      await activityApi.update(activity.activityId, {
        name:         editName.trim(),
        plannedStart: editStart || null,
        plannedEnd:   editEnd   || null,
        description:  editDesc  || null,
        weightage:    Number(editWeight),
        // ownerId is no longer user-editable — Activity Managers are set
        // via the Participants tab now. Passed through unchanged so the
        // backend's owner_id fallback (used only when an activity has no
        // explicit Manager at all — see roleService.resolveActivityManagerIds)
        // keeps whatever it already had.
        ownerId:      activity.ownerId || null,
      });
      onRefetchPhase?.(); onRefetchProject?.();
      setPanel(null); setEditErrors({});
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to save activity.')); }
    finally { setEditSaving(false); }
  };

  // ── Activity manager management (passed to ParticipantsPanel) ─────────────────
  // Always adds as 'Manager' — Viewer is project-only now, no role choice
  // left to make at Activity level either.
  const handleAddManager = async (userId) => {
    await activityApi.addMember(activity.activityId, userId, 'Manager');
    await fetchMembers();
  };
  const handleRemoveManager = async (uid) => {
    try { await activityApi.removeMember(activity.activityId, uid); await fetchMembers(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
  };

  // ── Participants panel data (Managers deduped against inherited groups,
  // Assignees rolled up from this activity's own tasks) ─────────────────────
  const projectManagerPeople = projectMembers.filter(m => m.role === 'Manager').map(m => ({ userId: m.userId, name: m.name }));
  const projectManagerIds = new Set(projectManagerPeople.map(p => String(p.userId)));
  const projectViewerPeople = projectMembers.filter(m => m.role === 'Viewer').map(m => ({ userId: m.userId, name: m.name }));
  const phaseManagerPeople = phaseManagers
    .filter(m => !projectManagerIds.has(String(m.userId)))
    .map(m => ({ userId: m.userId, name: m.name }));
  const inheritedGroups = [
    { label: 'Project Managers', people: projectManagerPeople },
    { label: 'Phase Managers', people: phaseManagerPeople },
  ];
  // Only 'Manager' rows are "this Activity's managers" now — Viewer is
  // project-only (see ParticipantsPanel.js). An Employee/Member/Viewer row
  // can still exist here (auto-added when someone with no other access
  // accepted a task assignment, or pre-dating this redesign), but that's
  // an assignee fact, not a manager fact, so it's excluded from this list
  // and merged into the Assignees roll-up instead. Also excludes anyone
  // already an inherited Project or Phase Manager — same "don't show Yash
  // twice" dedup as PhasePanel.js; the DB row (if any) is untouched, just
  // not re-displayed.
  const inheritedManagerIds = new Set([...projectManagerIds, ...phaseManagerPeople.map(p => String(p.userId))]);
  const panelManagers = actMembers.filter(m => m.role === 'Manager' && !inheritedManagerIds.has(String(m.userId)));
  const explicitManagerIds = new Set(panelManagers.map(m => String(m.userId)));
  // Add-candidates exclude anyone who already has Manager access here via
  // inheritance (Project OR Phase Manager) — "if someone has project/phase
  // level access he should not be included to add as activity manager,"
  // same rule one level down too. A project Member/Viewer with no Phase
  // access yet is still a valid promote-to-Activity-Manager candidate.
  const quickAddPool = projectMembers
    .filter(m => m.role !== 'Manager')
    .map(m => ({ userId: m.userId, name: m.name, email: m.email }))
    .filter(p => !explicitManagerIds.has(String(p.userId)) && !inheritedManagerIds.has(String(p.userId)));

  // Assignees is strictly "who has an actual task here" — it used to also
  // merge in any bare non-Manager pm_activity_members row (a "legacy
  // stub"), even with zero tasks, which directly contradicted the section's
  // own "(from tasks in this scope)" label: someone with a stray explicit
  // Employee row and no tasks showed up as an "assignee" with none, which
  // read as a bug (and often WAS one — see the createActivity fix above;
  // an inherited Manager who picked up a stray explicit Employee row here
  // showed up exactly this way). That row is still real access — just not
  // an assignee fact — so it belongs in the Managers/quickAddPool accounting
  // above, not here.
  const activityAssignees = useMemo(() => {
    // Deactivating ("deleting") a task doesn't remove its row, only flips
    // isActive — without this filter, someone whose only task here just got
    // deleted kept showing up in the Assignees tile until a hard-delete.
    return aggregateAssignees(tasks.filter(t => t.isActive !== false));
  }, [tasks]);

  // Task assignment's quick-pick used to only suggest actMembers (this
  // activity's own explicit rows) — someone with real access here via
  // inheritance (a Project or Phase Manager who never got an explicit
  // Activity row) had no quick-pick shortcut, only the "search any user"
  // fallback, even though they're exactly the kind of person likely to be
  // assigned something. Merged + deduped by userId; actMembers wins on
  // conflicts since it has the richer (email included) record.
  const suggestedAssignees = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...actMembers, ...panelManagers, ...phaseManagers, ...projectManagerPeople].forEach(m => {
      const key = String(m.userId);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(m);
    });
    return out;
  }, [actMembers, panelManagers, phaseManagers, projectManagerPeople]);

  // ── Add task ─────────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (taskWeightageLocked) {
      showToast("This activity's task weightage is fully allocated (100%). Lower an existing task's weightage before adding another task.");
      return;
    }
    const errs = {};
    if (!newTaskName.trim()) errs.name = 'Task name required';
    if (!newTaskDue)         errs.due  = 'Due date is required';
    if (newTaskWeight === '') errs.weight = 'Weightage is required';
    if (newTaskWeight !== '' && Number(newTaskWeight) < 1) errs.weight = 'Weightage must be at least 1%';
    if (newTaskWeight !== '' && Number(newTaskWeight) > taskWeightRemaining) {
      errs.weight = `Only ${taskWeightRemaining}% of this activity's weightage is left to assign`;
    }
    if (Object.keys(errs).length) { setAddErrors(errs); return; }
    if (addingTask) return;
    setAddingTask(true);
    try {
      await activityApi.createTask(activity.activityId, {
        name:        newTaskName.trim(),
        priority:    newTaskPrio,
        startDate:   newTaskStart || null,
        dueDate:     newTaskDue,
        description: newTaskDesc || null,
        weightage:   Number(newTaskWeight),
        assigneeIds: taskAssignees.map(a => a.userId),
      });
      setNewTaskName(''); setNewTaskDue(''); setNewTaskStart(''); setNewTaskDesc(''); setNewTaskWeight('');
      setTaskAssignees([]); setTaskAssignSearch(null); setNewTaskDeps([]);
      setPanel(null); setAddErrors({});
      // fetchTasks() only refreshes THIS Activity's own tasks — its
      // .emptyState field lives one level up, in PhasePanel's `activities`
      // list (from phaseApi.getActivities), which nothing here was
      // refreshing. That's why "No tasks yet" kept showing until a full
      // page reload happened to re-fetch it.
      fetchTasks(); onRefetchPhase?.(); onRefetchProject?.();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to add task.')); }
    finally { setAddingTask(false); }
  };

  // ── Activity dependencies ────────────────────────────────────────────────────
  const otherActivities = allActivities.filter(a => a.activityId !== activity.activityId);
  // Same reasoning as PhasePanel.js's addablePhases — an inactive activity
  // never reaches "Completed", so it can't legitimately be a prerequisite
  // without deadlocking this activity forever. Already-selected inactive
  // deps still render as removable chips, just not offered as new picks.
  const addableActivities = otherActivities.filter(a => a.isActive !== false);
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

  // Only reachable while already deactivated — see phaseService's
  // hardDeletePhase comment (same convention here) for why this requires
  // every Task under it to already be permanently deleted first.
  const handleHardDelete = async () => {
    if (!window.confirm(`Permanently delete activity "${activity.name}"? This cannot be undone.`)) return;
    try { await activityApi.hardDelete(activity.activityId); onRefetchPhase?.(); onRefetchProject?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to permanently delete activity.')); }
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
              onClick={e => { e.stopPropagation(); setDepsAnchorEl(e.currentTarget); togglePanel('deps'); }} style={{ flexShrink:0 }}>
              <ArrowRight size={10} strokeWidth={2.5} />
              {activity.dependsOn.length}
            </DepBadge>
          )}

          {activity.weightage != null && (
            <WeightBadge title="Share of this phase's progress" style={{ flexShrink:0 }}>
              {activity.weightage}%
            </WeightBadge>
          )}

          {canEdit && !isInactive && (
            <BtnGhost
              type="button"
              title="Edit activity dates, description, and weightage"
              onClick={e => { e.stopPropagation(); togglePanel('edit'); }}
              style={{ flexShrink:0, padding:'2px 8px', fontSize:10 }}
            >
              Edit
            </BtnGhost>
          )}

          {isInactive && <InactiveBadge />}
        </div>

        {/* Grid column 2: Participants — shows the Activity's actual
            Manager name(s) directly in-cell (managerNames was already
            computed server-side in activityService.getActivitiesForPhase,
            just never rendered), truncated with an ellipsis + full text in
            the title= tooltip if it overflows. Clicking still opens the
            same ParticipantsPanel floating popup (unchanged) — that's
            where every participant is listed individually with real
            section headers, and where any one of them can be managed.
            Viewable by anyone (not just canEdit) — the panel itself gates
            editing per role. */}
        <div style={{ position: 'relative', display:'flex', justifyContent:'center', overflow:'hidden' }} ref={participantsRef}>
          <div style={{ cursor: !isInactive ? 'pointer' : 'default', display:'flex', alignItems:'center', gap:5, overflow:'hidden', minWidth:0, maxWidth:'100%' }}
            onClick={!isInactive ? (e) => { e.stopPropagation(); togglePanel('members'); if (panel !== 'members') { fetchMembers(); if (!hasLoadedTasksRef.current) fetchTasks(); } } : undefined}
            title={!isInactive ? (activity.managerNames || 'View / manage participants') : undefined}
          >
            <Users size={13} strokeWidth={2} style={{ color: theme.colors.ash, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {activity.managerNames || <span style={{ color: theme.colors.ashLight, fontStyle: 'italic' }}>None</span>}
            </span>
          </div>

          <FloatingPopover anchorRef={participantsRef} open={panel === 'members'} width={360}>
            <div onClick={e => e.stopPropagation()} style={{
              background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
              borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
              boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
              overflowY: 'visible',
            }}>
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom: 4 }}>
                <BtnGhost onClick={() => setPanel(null)} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
              </div>
              <ParticipantsPanel
                levelLabel="Activity"
                inheritedGroups={inheritedGroups}
                managers={panelManagers}
                managersLoading={memberLoading}
                canEditManagers={canEdit}
                onAddManager={handleAddManager}
                onRemoveManager={handleRemoveManager}
                managerQuickAddPool={quickAddPool}
                excludeUserIdsForSearch={[...panelManagers.map(m => m.userId), ...inheritedManagerIds]}
                myUserId={myUserId}
                assigneesLoading={loadingTasks}
                assignees={activityAssignees}
                viewerGroup={{ people: projectViewerPeople, editable: false }}
              />
            </div>
          </FloatingPopover>
        </div>

        {/* Grid column 3: Dates — the actual planned date range AND the
            delay warning together, not one replacing the other. Clicking
            it also opens the edit panel; the visible Edit button beside the
            activity name is the discoverable primary action. Activity has no separate
            rename capability, so this IS the activity's one real edit
            surface. No Owner field here anymore — Activity Managers are
            set via the Participants tab; owner_id is a legacy column the
            backend only falls back to when an activity has no explicit
            Manager at all, not something meant to be hand-edited. */}
        <div ref={editRef} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, overflow:'hidden', cursor: canEdit && !isInactive ? 'pointer' : 'default' }}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('edit'); } : undefined}
          title={(canEdit && !isInactive) ? 'Click to edit dates / description' : undefined}
        >
          <span style={{ fontSize:10, color:theme.colors.ash, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{fmtRange(activity.plannedStart, activity.plannedEnd)}</span>
          <ScheduleBadge isOverdue={activity.isOverdue} overdueDays={activity.overdueDays} delayDays={activity.delayDays} delayLabel="Late by" />
        </div>

        {/* Grid column 4: Progress — BUG-030, same fix as PhasePanel.js's
            Phase rows: this used to be crammed into the Name cluster. */}
        <div style={{ overflow:'hidden', display:'flex', justifyContent:'center' }} onClick={e => e.stopPropagation()}>
          <ProgressBar value={activity.progress || 0} />
        </div>

        {/* Grid column 5: Status */}
        <div style={{ overflow:'hidden', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
          <StatusBadge status={activity.status} />
          <EmptyStateHint emptyState={activity.emptyState} theme={theme} />
        </div>

        {/* Grid column 6 (max-content): actions. "Edit" icon removed:
            clicking the Dates cell above opens the same panel. "Members"
            icon was ALSO removed earlier in favor of clicking the Manager
            cell text — that made adding a Manager/Viewer here
            undiscoverable, so it's back as an explicit icon alongside that
            click, not instead of it.
            BUG: this whole block used to be gated on `canEdit` (Manager)
            ONLY, which made `showChatButton`'s own more permissive check
            (Manager OR an Employee/Member who's an activity participant —
            see its definition above) completely unreachable: a regular
            assigned team member could never see or open this activity's
            chat at all, no matter how the unread state computed. The
            Prerequisites/Reactivate/Delete actions stay Manager-only
            (their own `canEdit` guard, unchanged); only the chat button's
            visibility is no longer smuggled behind that same gate. */}
        {(canEdit || showChatButton) && (
          <RowActions data-row-actions onClick={e => e.stopPropagation()}>
            {/* Members icon removed — redundant now that the Participants
                cell (grid column 2) itself opens the same panel, viewable
                by anyone and not just Managers. */}
            {showChatButton && (
              <span onClick={e => e.stopPropagation()}>
                <ChatButton kind="activity" id={activity.activityId} compact
                  hasUnread={activity.hasUnreadChat} conversationId={activity.chatConversationId} />
              </span>
            )}
            {canEdit && (
              <>
                {!isInactive && otherActivities.length > 0 && (
                  <IconBtn active={panel === 'deps'} title="Prerequisites"
                    onClick={e => { setDepsAnchorEl(e.currentTarget); togglePanel('deps'); }} style={{ width:20, height:20 }}>
                    <ArrowRight size={14} strokeWidth={2} />
                  </IconBtn>
                )}
                <div style={{ width:1, height:16, background:theme.colors.border, margin:'0 1px', flexShrink:0 }} />
                {isInactive ? (
                  <>
                    <IconBtn title="Reactivate" onClick={handleReactivate} style={{ width:20, height:20 }}>
                      <RotateCcw size={14} strokeWidth={2} />
                    </IconBtn>
                    <IconBtnDanger title="Delete permanently" onClick={handleHardDelete} style={{ width:20, height:20 }}>
                      <Trash2 size={14} strokeWidth={2} />
                    </IconBtnDanger>
                  </>
                ) : (
                  <IconBtnDanger title="Delete" onClick={handleDelete} style={{ width:20, height:20 }}>
                    <Trash2 size={14} strokeWidth={2} />
                  </IconBtnDanger>
                )}
              </>
            )}
          </RowActions>
        )}
      </GroupRow>

      {/* ── Edit activity popup — floating popover, same treatment as
          Participants/Dependencies (was an inline block that pushed every
          row below it down the page). No Owner field — see the comment on
          the Dates cell above for why. ── */}
      <FloatingPopover anchorRef={editRef} open={panel === 'edit' && canEdit} onClose={() => { setPanel(null); setEditErrors({}); }} width={340}>
        <div onClick={e => e.stopPropagation()} style={{
          background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
          borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
          boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
          overflowY: 'visible',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
            <EditPanelTitle>Edit Activity</EditPanelTitle>
            <BtnGhost onClick={() => { setPanel(null); setEditErrors({}); }} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Name *</label>
            <input value={editName} onChange={e => { setEditName(e.target.value); setEditErrors(er => ({ ...er, name: '' })); }}
              style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${editErrors.name ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            {editErrors.name && <span style={{ fontSize: 10, color: theme.colors.danger }}>{editErrors.name}</span>}
          </div>
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
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Description</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
              placeholder="Describe the activity's goal…" rows={2}
              style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
              Weightage (% of phase) <span style={{ color: theme.colors.espresso }}>*</span>
            </label>
            <input type="number" min={1} max={weightBudget} step="0.1"
              value={editWeight}
              disabled={weightBudget <= 0 && editWeight === ''}
              onChange={e => { setEditWeight(e.target.value); setEditErrors(er => ({ ...er, weight: '' })); }}
              placeholder={weightBudget <= 0 && editWeight === '' ? 'Fully allocated' : `up to ${weightBudget}`}
              style={{ width: 120, background: theme.colors.mid, border: `1px solid ${editErrors.weight ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            {editErrors.weight && <div style={{ fontSize: 10, color: theme.colors.danger, marginTop: 3 }}>{editErrors.weight}</div>}
            <div style={{ fontSize: 10, color: theme.colors.ash, marginTop: 3 }}>
              Required. Phase progress always uses activity weightage.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <BtnPrimary style={{ fontSize: 11, padding: '6px 16px' }} onClick={handleEditSave} disabled={editSaving}>{editSaving ? '…' : 'Save'}</BtnPrimary>
            <BtnGhost style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { setPanel(null); setEditErrors({}); }}>Cancel</BtnGhost>
          </div>
        </div>
      </FloatingPopover>

      {/* ── Dependency popup — floating popover, same treatment as
          Participants (was an inline block that pushed every row below it
          down the page). Viewable by anyone, editable by Manager only. ── */}
      <FloatingPopover anchorEl={depsAnchorEl} open={panel === 'deps'} onClose={() => setPanel(null)} width={340}>
        <div onClick={e => e.stopPropagation()} style={{
          background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
          borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
          boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
          overflowY: 'visible',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
            <EditPanelTitle>Activity Prerequisites</EditPanelTitle>
            <BtnGhost onClick={() => setPanel(null)} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
          </div>
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

          {/* Add via dropdown — Manager only. Inactive activities are
              excluded (see addableActivities above) — they'd never
              complete, so selecting one would deadlock this activity
              forever. */}
          {canEdit && (
            addableActivities.filter(a => !currentDeps.has(a.activityId)).length > 0 ? (
              <select defaultValue="" onChange={e => { if (e.target.value) { handleAddDep(Number(e.target.value)); e.target.value = ''; } }}
                style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
                <option value="">+ Add a predecessor activity…</option>
                {addableActivities.filter(a => !currentDeps.has(a.activityId)).map(a => (
                  <option key={a.activityId} value={a.activityId}>{a.name} ({a.status})</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 12, color: theme.colors.ash }}>All eligible activities already added as prerequisites.</div>
            )
          )}

          {depError && <div style={{ color: theme.colors.danger, fontSize: 11, marginTop: 6 }}>{depError}</div>}
        </div>
      </FloatingPopover>

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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 6px', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Tasks ({visibleTasks.length}{visibleTasks.length !== tasks.length ? ` of ${tasks.length}` : ''})
              {taskWeightSum > 0 && (
                <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 'normal', color: taskWeightageLocked ? theme.colors.copper : theme.colors.ash }}>
                  · Weight {taskWeightSum}%/100{taskWeightageLocked ? ' (locked)' : ''}
                </span>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {tasks.length > 0 && (
                <FilterToggle open={panel === 'sortfilter'} onClick={() => togglePanel('sortfilter')}
                  active={!!(taskFilters.status || taskFilters.priority)} title="Sort & filter tasks" />
              )}
              {canEdit && !isBlocked && !isInactive && (
                <BtnGhost style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => togglePanel('addtask')}
                  disabled={taskWeightageLocked}
                  title={taskWeightageLocked ? "This activity's 100% task weightage is already allocated" : 'Add Task'}>
                  + Add Task
                </BtnGhost>
              )}
            </div>
          </div>

          {panel === 'sortfilter' && tasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8, padding: '8px 10px', background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm }}>
              <SortSelect
                value={taskSortKey} onChange={setTaskSortKey} dir={taskSortDir} onToggleDir={toggleTaskSortDir}
                options={[
                  { value: 'name', label: 'Name' }, { value: 'due', label: 'Due Date' },
                  { value: 'priority', label: 'Priority' }, { value: 'status', label: 'Status' },
                ]}
              />
              <FilterSelect placeholder="All statuses" value={taskFilters.status} onChange={v => setTaskFilter('status', v)} options={taskStatusOptions} />
              <FilterSelect placeholder="All priorities" value={taskFilters.priority} onChange={v => setTaskFilter('priority', v)} options={PRIORITY_OPTS.map(p => ({ value: p, label: p }))} />
            </div>
          )}

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase' }}>Weightage (%) *</label>
                  <input type="number" min={1} max={taskWeightRemaining} step="0.1"
                    value={newTaskWeight}
                    disabled={taskWeightageLocked}
                    onChange={e => { setNewTaskWeight(e.target.value); setAddErrors(er => ({ ...er, weight: '' })); }}
                    placeholder={taskWeightageLocked ? 'Fully allocated' : `up to ${taskWeightRemaining}`}
                    style={{ width: 90, background: theme.colors.mid, border: `1px solid ${addErrors.weight ? theme.colors.danger : theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                  {addErrors.weight && <span style={{ fontSize: 10, color: theme.colors.danger }}>{addErrors.weight}</span>}
                </div>
              </div>
              <div style={{ fontSize: 10, color: theme.colors.ash, marginTop: -4, marginBottom: 8 }}>
                {taskWeightageLocked
                  ? "This activity's weightage is fully allocated (100%) — lower another task's share first."
                  : `${taskWeightSum}% of 100% assigned so far, ${taskWeightRemaining}% remaining.`}
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
                <BtnPrimary style={{ fontSize: 11, padding: '6px 16px' }} onClick={handleAddTask} disabled={addingTask || taskWeightageLocked}>{addingTask ? 'Adding…' : 'Add Task'}</BtnPrimary>
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
                <TableHeadCell w={COL.assignee} center>Assignee</TableHeadCell>
                <TableHeadCell w={COL.due} center>Due Date</TableHeadCell>
                <TableHeadCell w={COL.priority} center>Priority</TableHeadCell>
                <TableHeadCell w={COL.status} center>Status</TableHeadCell>
              </TableHead>
            )}
            {!loadingTasks && visibleTasks.map(t => (
              <TaskItem
                key={t.taskId}
                task={t}
                activityRole={activity.myRole}
                myUserId={myUserId}
                allTasks={tasks}
                activityMembers={actMembers}
                suggestedAssignees={suggestedAssignees}
                onRefetch={async () => { await fetchTasks(); onRefetchPhase?.(); }}
                onRefetchProject={onRefetchProject}
              />
            ))}
            {!loadingTasks && tasks.length > 0 && !visibleTasks.length && (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '8px 0' }}>No tasks match the current filters.</div>
            )}
            {!loadingTasks && !tasks.length && (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '8px 0' }}>No tasks yet.</div>
            )}
          </TaskList>
        </ActivityBody>
      )}
    </>
  );
}
