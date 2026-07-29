import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronRight, ChevronUp, ChevronDown, ArrowRight, RotateCcw, Trash2, Users } from 'lucide-react';
import StatusBadge, { InactiveBadge } from './StatusBadge';
import ProgressBar from './ProgressBar';
import ScheduleBadge from './ScheduleBadge';
import ActivityRow from './ActivityRow';
import ParticipantsPanel from './ParticipantsPanel';
import { aggregateAssignees } from '../utils/aggregateAssignees';
import { phaseApi, activityApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { GroupRow, RowActions, GROUP_COL, TableHead, TableHeadCell } from '../styles/Table.styles';
import { PhaseName, PhaseBody } from '../styles/PhasePanel.styles';
import {
  DepBadge, IconBtn, IconBtnDanger, EditPanel, EditPanelTitle, BtnPrimary, BtnGhost,
} from '../styles/shared.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect, FilterSelect, FilterToggle } from '../../shared/components/TableControls';
import FloatingPopover from '../../shared/components/FloatingPopover';

function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtRange(start, end) {
  const s = parseLocalDate(start), e = parseLocalDate(end);
  if (!s && !e) return null;
  const fmt = d => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${s ? fmt(s) : '?'} → ${e ? fmt(e) : '?'}`;
}
function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }


export default function PhasePanel({ phase, projectId, allPhases = [], projectMembers = [], myUserId, onReorder, onRefetchProject }) {
  const theme = useTheme();
  const [open,        setOpen]        = useState(false);
  const [activities,  setActivities]  = useState([]);
  const [loading,     setLoading]     = useState(false);
  // Same fix as ActivityRow's hasLoadedTasksRef / useProject's
  // hasLoadedRef — every action anywhere below this phase re-triggers
  // fetchActivities (directly, and via the project-level socket refetch),
  // and setLoading(true) unconditionally on every one of those calls
  // flashed the activities list to empty/"Loading…" on every single
  // action, reading as the list "rolling back" even though the data was
  // always correct underneath. Only the true first load shows loading.
  const hasLoadedActivitiesRef = useRef(false);
  const [panel,       setPanel]       = useState(null); // 'dates'|'deps'|'addact'|'members'
  // Participants panel is a floating popup (matches the Project-level
  // popup's exact pattern in ProjectDetailPage.js) rather than an
  // inline-expanding block — click-outside closes it the same way.
  const participantsRef = useRef(null);
  // Dependency popup — same floating-popup treatment as Participants,
  // instead of an inline block that pushed every row below it down. Two
  // different elements can open it (the dep-count badge next to the name,
  // and the "manage prerequisites" icon in the actions column), so the
  // anchor is whichever one was actually clicked rather than a fixed ref.
  const [depsAnchorEl, setDepsAnchorEl] = useState(null);
  // Dates edit popup — single trigger (the Dates cell), so a plain ref works.
  const datesRef = useRef(null);

  // Date edit
  const [editStart,   setEditStart]   = useState(toInput(phase.plannedStart));
  const [editEnd,     setEditEnd]     = useState(toInput(phase.plannedEnd));
  const [dateErrors,  setDateErrors]  = useState({});
  const [dateSaving,  setDateSaving]  = useState(false);

  // Add activity
  const [newActName,  setNewActName]  = useState('');
  const [newActStart, setNewActStart] = useState('');
  const [newActEnd,   setNewActEnd]   = useState('');
  const [actErrors,   setActErrors]   = useState({});
  const [addingAct,   setAddingAct]   = useState(false);

  // Deps
  const [depError,    setDepError]    = useState('');

  // Phase managers — "Phase Members" as a generic assignable tier doesn't
  // exist anymore; this list is specifically who's an explicit MANAGER of
  // this phase. Regular team members get access by being assigned to a
  // task somewhere under this phase (see phaseAssignees below, rolled up
  // from every activity's tasks), not by being pre-added here.
  const [phaseMembers,  setPhaseMembers]  = useState([]);
  const [memberLoading, setMemberLoading] = useState(false);

  // Phase-wide assignee roll-up — every task assignee across every
  // Activity under this Phase, deduplicated by user. Fetched only when the
  // Participants panel is opened (not on every Phase expand), since it
  // means pulling every Activity's task list, not just the Activities
  // themselves.
  const [phaseAssignees,        setPhaseAssignees]        = useState([]);
  const [assigneesLoading,      setAssigneesLoading]      = useState(false);
  const hasLoadedAssigneesRef = useRef(false);

  // phase.myRole is the user's EFFECTIVE role on THIS phase (explicit
  // phase-level row, else inherited from their project role — computed
  // server-side by roleService). Previously this was gated on the flat
  // project-level myRole prop, so a Phase Manager who was only a plain
  // project Member never saw management controls for their own phase even
  // though the backend already authorized the action.
  const canEdit = phase.myRole === 'Manager';

  useEffect(() => {
    setEditStart(toInput(phase.plannedStart));
    setEditEnd(toInput(phase.plannedEnd));
  }, [phase.plannedStart, phase.plannedEnd]);

  const fetchActivities = useCallback(async () => {
    if (!hasLoadedActivitiesRef.current) setLoading(true);
    try { setActivities(await phaseApi.getActivities(phase.phaseId)); }
    catch { }
    finally { hasLoadedActivitiesRef.current = true; setLoading(false); }
  }, [phase.phaseId]);

  useEffect(() => { if (open) fetchActivities(); }, [open, fetchActivities]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  // UI-only sort/filter over this phase's already-loaded activities list.
  const activityStatusOptions = [...new Set(activities.map(a => a.status).filter(Boolean))].map(s => ({ value: s, label: s }));
  const {
    items: visibleActivities, sortKey: actSortKey, setSortKey: setActSortKey,
    sortDir: actSortDir, toggleSortDir: toggleActSortDir, filters: actFilters, setFilter: setActFilter,
  } = useSortFilter(activities, {
    sorters: {
      name:   (a, b) => (a.name || '').localeCompare(b.name || ''),
      start:  (a, b) => (parseLocalDate(a.plannedStart)?.getTime() ?? 0) - (parseLocalDate(b.plannedStart)?.getTime() ?? 0),
      end:    (a, b) => (parseLocalDate(a.plannedEnd)?.getTime() ?? 0) - (parseLocalDate(b.plannedEnd)?.getTime() ?? 0),
      status: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    defaultSortKey: 'name',
    filters: {
      status: { predicate: (a, v) => a.status === v },
      active: { predicate: (a, v) => (v === 'active' ? a.isActive !== false : a.isActive === false) },
    },
  });

  // ── Phase manager management (passed to ParticipantsPanel) ────────────────────
  const fetchPhaseMembers = useCallback(async () => {
    setMemberLoading(true);
    try { setPhaseMembers(await phaseApi.getMembers(phase.phaseId)); }
    catch { }
    finally { setMemberLoading(false); }
  }, [phase.phaseId]);

  // Fetched as soon as the Phase expands (not lazily on Participants-panel
  // click) — each child ActivityRow needs this list right away for its own
  // "Phase Managers" inherited section, and a Phase has to be expanded to
  // see its Activities in the first place, so there's no case where this
  // fetch would be wasted. Must be declared AFTER fetchPhaseMembers itself
  // (const/useCallback — referencing it earlier in the file throws a
  // temporal-dead-zone ReferenceError, which is exactly what happened here
  // the first time).
  useEffect(() => { if (open) fetchPhaseMembers(); }, [open, fetchPhaseMembers]);

  useEffect(() => {
    if (panel !== 'members') return;
    const handler = (e) => { if (participantsRef.current && !participantsRef.current.contains(e.target)) setPanel(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panel]);

  // Always adds as 'Manager' — Viewer is project-only now (see
  // ParticipantsPanel.js), there's no role choice left to make at Phase level.
  const handleAddManager = async (userId) => {
    await phaseApi.addMember(phase.phaseId, userId, 'Manager');
    await fetchPhaseMembers();
  };
  const handleRemoveManager = async (uid) => {
    try { await phaseApi.removeMember(phase.phaseId, uid); await fetchPhaseMembers(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
  };

  // Fetches every Activity under this Phase (reusing fetchActivities'
  // cache if already loaded) then every one of THEIR tasks in parallel, and
  // aggregates the assignees. Guarded so opening the panel twice doesn't
  // re-fetch.
  const fetchPhaseAssignees = useCallback(async () => {
    if (hasLoadedAssigneesRef.current) return;
    setAssigneesLoading(true);
    try {
      const acts = hasLoadedActivitiesRef.current ? activities : await phaseApi.getActivities(phase.phaseId);
      const taskLists = await Promise.all(acts.map(a => activityApi.getTasks(a.activityId).catch(() => [])));
      setPhaseAssignees(aggregateAssignees(taskLists.flat()));
      hasLoadedAssigneesRef.current = true;
    } catch { }
    finally { setAssigneesLoading(false); }
  }, [phase.phaseId, activities]);

  const handleDateSave = async () => {
    const errs = {};
    if (!editStart) errs.start = 'Start date required';
    if (!editEnd)   errs.end   = 'End date required';
    if (editStart && editEnd && editEnd < editStart) errs.end = 'End must be after start';
    if (Object.keys(errs).length) { setDateErrors(errs); return; }
    setDateSaving(true);
    try {
      await phaseApi.update(phase.phaseId, { plannedStart: editStart, plannedEnd: editEnd });
      onRefetchProject?.();
      setPanel(null); setDateErrors({});
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to save phase dates.')); }
    finally { setDateSaving(false); }
  };

  const handleAddActivity = async () => {
    const errs = {};
    if (!newActName.trim()) errs.name  = 'Name required';
    if (!newActStart)       errs.start = 'Start date required';
    if (!newActEnd)         errs.end   = 'End date required';
    if (newActStart && newActEnd && newActEnd < newActStart) errs.end = 'End must be after start';
    if (Object.keys(errs).length) { setActErrors(errs); return; }
    if (addingAct) return;
    setAddingAct(true);
    try {
      await phaseApi.createActivity(phase.phaseId, {
        name:         newActName.trim(),
        plannedStart: newActStart,
        plannedEnd:   newActEnd,
      });
      setNewActName(''); setNewActStart(''); setNewActEnd(''); setActErrors({});
      setPanel(null);
      fetchActivities();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to add activity.')); }
    finally { setAddingAct(false); }
  };

  // Deps
  const otherPhases = allPhases.filter(p => p.phaseId !== phase.phaseId);
  // An inactive phase is archived, not progressing toward "Completed" — it
  // would never satisfy the "auto-blocks until it completes" contract, so
  // picking one as a prerequisite would deadlock this phase permanently.
  // Only offer active phases as NEW candidates; an already-selected
  // inactive dep (set before it went inactive) still shows as a removable
  // chip so it isn't silently hidden.
  const addablePhases = otherPhases.filter(p => p.isActive !== false);
  const currentDeps = new Set((phase.dependsOn || []).map(Number));

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await phaseApi.addDep(phase.phaseId, depId); onRefetchProject?.(); }
    catch (err) { setDepError(apiErrorMessage(err, 'Cannot add — would create a cycle.')); }
  };
  const handleRemoveDep = async (depId) => {
    try { await phaseApi.removeDep(phase.phaseId, depId); onRefetchProject?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove dependency.')); }
  };

  const dateRange = fmtRange(phase.plannedStart, phase.plannedEnd);
  const isInactive = phase.isActive === false;

  // ── Participants panel data ────────────────────────────────────────────────
  const projectManagerPeople = projectMembers.filter(m => m.role === 'Manager').map(m => ({ userId: m.userId, name: m.name }));
  const projectManagerIds = new Set(projectManagerPeople.map(p => String(p.userId)));
  const projectViewerPeople = projectMembers.filter(m => m.role === 'Viewer').map(m => ({ userId: m.userId, name: m.name }));
  const inheritedGroups = [{ label: 'Project Managers', people: projectManagerPeople }];
  // Only 'Manager' rows are "this Phase's managers" now — Viewer is
  // project-only (see ParticipantsPanel.js), so any Employee/Member/Viewer
  // row here is legacy (pre-dates this redesign, or was auto-added via
  // task-accept) and gets merged into Assignees below instead. Also
  // excludes anyone already an inherited Project Manager — a real explicit
  // Phase-Manager row can still exist for them in the DB (harmless, same
  // rank), but showing it here too is exactly the "why is Yash listed
  // twice" confusion; the DB row isn't touched, just not re-displayed.
  const panelManagers = phaseMembers.filter(m => m.role === 'Manager' && !projectManagerIds.has(String(m.userId)));
  const explicitManagerIds = new Set(panelManagers.map(m => String(m.userId)));
  // Add-candidates exclude anyone who ALREADY has Manager access here via
  // inheritance — offering them is pointless, they already have full scope
  // ("if someone has project level access he should not be included to add
  // as phase manager"). Project Managers and this Phase's own existing
  // Managers are both excluded; a project Viewer or plain Member is still
  // a valid promote-to-Phase-Manager candidate.
  const quickAddPool = projectMembers
    .filter(m => m.role !== 'Manager')
    .map(m => ({ userId: m.userId, name: m.name, email: m.email }))
    .filter(p => !explicitManagerIds.has(String(p.userId)));

  // Legacy/auto-added non-Manager rows merged into the Assignees display
  // even if they have zero current tasks — these predate "members" being
  // removed as an addable tier (or Viewer moving to project-only), or come
  // from the task-accept auto-add; either way they're real access someone
  // granted, and hiding them entirely (Assignees is otherwise purely
  // task-derived) would silently make them disappear from every view.
  const legacyAssigneeStubs = phaseMembers
    .filter(m => m.role !== 'Manager')
    .map(m => ({ userId: m.userId, name: m.name }));
  const mergedPhaseAssignees = (() => {
    const map = new Map(phaseAssignees.map(a => [String(a.userId), a]));
    legacyAssigneeStubs.forEach(m => {
      const key = String(m.userId);
      if (!map.has(key)) map.set(key, { userId: m.userId, name: m.name, taskCount: 0 });
    });
    return [...map.values()].sort((a, b) => b.taskCount - a.taskCount);
  })();

  const handleDelete = async () => {
    if (!window.confirm(`Delete phase "${phase.name}"?`)) return;
    try {
      const { action } = await phaseApi.delete(phase.phaseId);
      if (action === 'deactivated') alert('This phase still has activities — it was deactivated instead of deleted.');
      onRefetchProject?.();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to delete phase.')); }
  };

  const handleReactivate = async () => {
    try { await phaseApi.reactivate(phase.phaseId); onRefetchProject?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to reactivate phase.')); }
  };

  // Only reachable while the phase is already deactivated (the button
  // itself only renders in that state) — permanently removes it. The
  // backend additionally requires every Activity under it to already be
  // permanently deleted first (working from the leaf up avoids the
  // dependency-resolution bug a cascading delete would risk — see
  // phaseService.hardDeletePhase's comment), so a 409 here means there's
  // still live work underneath that needs clearing first.
  const handleHardDelete = async () => {
    if (!window.confirm(`Permanently delete phase "${phase.name}"? This cannot be undone.`)) return;
    try { await phaseApi.hardDelete(phase.phaseId); onRefetchProject?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to permanently delete phase.')); }
  };

  return (
    <>
      {/* ── Group-header row (table row, level 0) ── */}
      <GroupRow level={0} onClick={() => setOpen(v => !v)}>

        {/* Grid column 1 (the "1fr" track) — chevron, name, dep badge,
            reorder arrows, progress bar and inactive badge are all packed
            into ONE wrapping element now, since CSS Grid places children
            positionally: this whole cluster must be a single grid item
            occupying column 1, not several separate top-level children
            (which is what a flex "spacer" used to sort out — grid doesn't
            have or need that concept). overflow:hidden + min-width:0 so
            this cluster can actually shrink instead of forcing the track
            wider than its 1fr share. */}
        <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden', minWidth:0 }}>
          <ChevronRight size={13} strokeWidth={2.5}
            style={{ transform:open?'rotate(90deg)':'none', transition:'transform 0.15s', flexShrink:0, color:theme.colors.ash }} />

          {/* min-width:70 (not 0) — same latent bug TaskName had: with no
              floor, this shrinkable element can compress all the way to
              invisible under space pressure instead of just truncating. */}
          <PhaseName style={{ flex:'0 1 auto', maxWidth:220, minWidth:70 }} title={phase.name}>{phase.name}</PhaseName>

          {/* Dependency badge — same spot TaskName puts its own dependsOn
              badge, not forced into a column that otherwise has nothing to
              do with dependencies. */}
          {phase.dependsOn?.length > 0 && (
            <DepBadge title={`Depends on ${phase.dependsOn.length} phase(s)`}
              onClick={e => { e.stopPropagation(); setDepsAnchorEl(e.currentTarget); togglePanel('deps'); }} style={{ cursor:'pointer', flexShrink:0 }}>
              <ArrowRight size={10} strokeWidth={2.5} />
              {phase.dependsOn.length}
            </DepBadge>
          )}

          {/* Reorder — only when canEdit. */}
          {canEdit && onReorder && !isInactive && (
            <div style={{ display:'flex', gap:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
              <IconBtn title="Move up"   onClick={() => onReorder(phase.phaseId,'up')}   style={{width:22,height:22}}><ChevronUp size={11} strokeWidth={2.5} /></IconBtn>
              <IconBtn title="Move down" onClick={() => onReorder(phase.phaseId,'down')} style={{width:22,height:22}}><ChevronDown size={11} strokeWidth={2.5} /></IconBtn>
            </div>
          )}

          {isInactive && <InactiveBadge />}
        </div>

        {/* Grid column 2: Participants — used to show manager names
            in-cell directly (truncated, italic-vs-bold to distinguish
            inherited from explicit); replaced with a plain icon + label
            that opens ParticipantsPanel as a floating popup (matching the
            Project-level popup's exact style), which does that
            distinguishing with real section headers instead of font-style.
            Viewable by anyone, editable (Managers section) by a Manager
            only. position:relative wrapper + participantsRef is what the
            click-outside-to-close effect above targets. */}
        <div style={{ position: 'relative', display:'flex', justifyContent:'center' }} ref={participantsRef}>
          {/* Icon only, centered — same centering technique as the Progress
              column (already confirmed working: header text-align:center +
              cell justifyContent:center within the same fixed-width grid
              column, no offset math needed either side). */}
          <div style={{ cursor: !isInactive ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={!isInactive ? (e) => { e.stopPropagation(); togglePanel('members'); if (panel !== 'members') { fetchPhaseMembers(); fetchPhaseAssignees(); } } : undefined}
            title={!isInactive ? 'View / manage participants' : undefined}
          >
            <Users size={14} strokeWidth={2} style={{ color: theme.colors.ash }} />
          </div>

          <FloatingPopover anchorRef={participantsRef} open={panel === 'members'} width={360}>
            <div onClick={e => e.stopPropagation()} style={{
              background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
              borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
              boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
              overflowY: 'visible',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 4 }}>
                <span />
                <BtnGhost onClick={() => setPanel(null)} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
              </div>
              <ParticipantsPanel
                levelLabel="Phase"
                inheritedGroups={inheritedGroups}
                managers={panelManagers}
                managersLoading={memberLoading}
                canEditManagers={canEdit}
                onAddManager={handleAddManager}
                onRemoveManager={handleRemoveManager}
                managerQuickAddPool={quickAddPool}
                excludeUserIdsForSearch={[...panelManagers.map(m => m.userId), ...projectManagerIds]}
                myUserId={myUserId}
                assigneesLoading={assigneesLoading}
                assignees={mergedPhaseAssignees}
                viewerGroup={{ people: projectViewerPeople, editable: false }}
              />
            </div>
          </FloatingPopover>
        </div>

        {/* Grid column 3: Dates — the actual planned date range AND the
            delay warning together, not one replacing the other. Clicking
            it opens the same edit panel the old dedicated "Edit dates"
            icon opened. */}
        <div ref={datesRef} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, overflow:'hidden', cursor: canEdit && !isInactive ? 'pointer' : 'default' }}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('dates'); } : undefined}
          title={(canEdit && !isInactive) ? 'Click to edit dates' : undefined}
        >
          <span style={{ fontSize:10, color:theme.colors.ash, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{dateRange}</span>
          <ScheduleBadge isOverdue={phase.isOverdue} overdueDays={phase.overdueDays} delayDays={phase.delayDays} delayLabel="Late by" />
        </div>

        {/* Grid column 4: Progress — BUG-030: this used to be crammed into
            the Name cluster (column 1); Status already had its own column,
            Progress now matches it and ProjectListPage's own dedicated
            Progress column. */}
        <div style={{ overflow:'hidden', display:'flex', justifyContent:'center' }} onClick={e => e.stopPropagation()}>
          <ProgressBar value={phase.progress || 0} />
        </div>

        {/* Grid column 5: Status */}
        <div style={{ overflow:'hidden', display:'flex', justifyContent:'center' }}>
          <StatusBadge status={phase.status} />
        </div>

        {/* Grid column 6 (max-content track): action buttons — always
            visible. "Edit dates" icon removed: clicking the Dates cell
            above opens the same panel. "Members" icon was ALSO removed in
            an earlier pass in favor of clicking the Manager cell text —
            that turned out to make adding a Manager/Viewer here not
            discoverable at all, so it's back as an explicit icon;
            clicking the Manager cell still works too, this is in addition
            to it, not instead of it. */}
        <RowActions data-row-actions onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              {/* Members icon removed — redundant now that the Participants
                  cell (grid column 2) opens the same panel, viewable by
                  anyone and not just Managers. */}
              {!isInactive && otherPhases.length > 0 && (
                <IconBtn active={panel==='deps'} title="Manage prerequisites"
                  onClick={e => { setDepsAnchorEl(e.currentTarget); togglePanel('deps'); }} style={{width:20,height:20}}>
                  <ArrowRight size={14} strokeWidth={2} />
                </IconBtn>
              )}
              <div style={{ width:1, height:16, background:theme.colors.border, margin:'0 1px', flexShrink:0 }} />
              {isInactive ? (
                <>
                  <IconBtn title="Reactivate" onClick={handleReactivate} style={{width:20,height:20}}>
                    <RotateCcw size={14} strokeWidth={2} />
                  </IconBtn>
                  {/* Only reachable once already deactivated — matches the
                      chat module's disable-then-delete convention. */}
                  <IconBtnDanger title="Delete permanently" onClick={handleHardDelete} style={{width:20,height:20}}>
                    <Trash2 size={14} strokeWidth={2} />
                  </IconBtnDanger>
                </>
              ) : (
                <IconBtnDanger title="Delete" onClick={handleDelete} style={{width:20,height:20}}>
                  <Trash2 size={14} strokeWidth={2} />
                </IconBtnDanger>
              )}
            </>
          )}
        </RowActions>
      </GroupRow>

      {/* ── Date edit popup — floating popover, same treatment as
          Participants/Dependencies. ── */}
      <FloatingPopover anchorRef={datesRef} open={panel === 'dates' && canEdit} onClose={() => { setPanel(null); setDateErrors({}); }} width={340}>
        <div onClick={e => e.stopPropagation()} style={{
          background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
          borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
          boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
          overflowY: 'visible',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
            <EditPanelTitle style={{ marginBottom:0 }}>Phase Dates</EditPanelTitle>
            <BtnGhost onClick={() => { setPanel(null); setDateErrors({}); }} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Start Date <span style={{ color:theme.colors.espresso }}>*</span></label>
              <input type="date" value={editStart} onChange={e => { setEditStart(e.target.value); setDateErrors(er=>({...er,start:''})); }}
                style={{ background:theme.colors.mid, border:`1px solid ${dateErrors.start?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'6px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
              {dateErrors.start && <span style={{ fontSize:10, color:theme.colors.danger }}>{dateErrors.start}</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>End Date <span style={{ color:theme.colors.espresso }}>*</span></label>
              <input type="date" value={editEnd} onChange={e => { setEditEnd(e.target.value); setDateErrors(er=>({...er,end:''})); }}
                min={editStart||undefined}
                style={{ background:theme.colors.mid, border:`1px solid ${dateErrors.end?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'6px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
              {dateErrors.end && <span style={{ fontSize:10, color:theme.colors.danger }}>{dateErrors.end}</span>}
            </div>
            <BtnPrimary style={{ padding:'7px 16px' }} onClick={handleDateSave} disabled={dateSaving}>{dateSaving?'…':'Save'}</BtnPrimary>
            <BtnGhost style={{ padding:'7px 12px' }} onClick={() => { setPanel(null); setDateErrors({}); }}>Cancel</BtnGhost>
          </div>
          <div style={{ fontSize:11, color:theme.colors.ash, marginTop:6 }}>Dates appear on the Timeline once saved.</div>
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
            <EditPanelTitle>Phase Prerequisites</EditPanelTitle>
            <BtnGhost onClick={() => setPanel(null)} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
          </div>
          <div style={{ fontSize:11, color:theme.colors.ash, marginBottom:10 }}>
            {canEdit
              ? <>Selecting a predecessor auto-<strong>blocks</strong> this phase until it completes, then auto-unblocks.</>
              : 'This phase is blocked until the phases below complete.'}
          </div>

          {/* Existing dep chips */}
          {currentDeps.size > 0 ? (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
              {[...currentDeps].map(depId => {
                const ph = otherPhases.find(p => p.phaseId === depId);
                if (!ph) return null;
                return (
                  <span key={depId} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:12, padding:'2px 8px 2px 10px', maxWidth:'100%' }}>
                    <span style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={ph.name}>{ph.name}</span>
                    {canEdit && (
                      <button type="button" onClick={() => handleRemoveDep(depId)}
                        style={{ background:'none', border:'none', color:theme.colors.ash, cursor:'pointer', fontSize:14, lineHeight:1, padding:0 }}>×</button>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize:12, color:theme.colors.ash, marginBottom: canEdit ? 8 : 0 }}>No prerequisites set.</div>
          )}

          {/* Add via dropdown — Manager only. Inactive phases are excluded
              (see addablePhases above) — they'd never complete, so
              selecting one would deadlock this phase forever. */}
          {canEdit && (
            addablePhases.filter(p => !currentDeps.has(p.phaseId)).length > 0 ? (
              <select defaultValue="" onChange={e => { if (e.target.value) { handleAddDep(Number(e.target.value)); e.target.value = ""; } }}
                style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'6px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }}>
                <option value="">+ Add a predecessor phase…</option>
                {addablePhases.filter(p => !currentDeps.has(p.phaseId)).map(p => (
                  <option key={p.phaseId} value={p.phaseId}>{p.name} ({p.status})</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize:12, color:theme.colors.ash }}>All eligible phases already added as prerequisites.</div>
            )
          )}

          {depError && <div style={{ color:theme.colors.danger, fontSize:11, marginTop:6 }}>{depError}</div>}
        </div>
      </FloatingPopover>

      {/* ── Body ── */}
      {open && (
        <PhaseBody style={{ paddingTop:12 }}>
          {phase.description && (
            <p style={{ fontSize:12, color:theme.colors.ash, marginBottom:12, lineHeight:1.5 }}>{phase.description}</p>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:11, color:theme.colors.ash, textTransform:'uppercase', letterSpacing:'.06em' }}>
              Activities ({visibleActivities.length}{visibleActivities.length !== activities.length ? ` of ${activities.length}` : ''})
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {activities.length > 0 && (
                <FilterToggle open={panel === 'sortfilter'} onClick={() => togglePanel('sortfilter')}
                  active={!!(actFilters.status || actFilters.active)} title="Sort & filter activities" />
              )}
              {canEdit && !isInactive && (
                <BtnGhost style={{ padding:'4px 12px', fontSize:11 }}
                  onClick={() => togglePanel('addact')}>
                  + Add Activity
                </BtnGhost>
              )}
            </div>
          </div>

          {panel === 'sortfilter' && activities.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:8, padding:'8px 10px', background:theme.colors.greige, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm }}>
              <SortSelect
                value={actSortKey} onChange={setActSortKey} dir={actSortDir} onToggleDir={toggleActSortDir}
                options={[
                  { value:'name', label:'Name' }, { value:'start', label:'Start' },
                  { value:'end', label:'End' }, { value:'status', label:'Status' },
                ]}
              />
              <FilterSelect placeholder="All statuses" value={actFilters.status} onChange={v => setActFilter('status', v)} options={activityStatusOptions} />
            </div>
          )}

          {/* ── Add activity form (with dates required) ── */}
          {panel === 'addact' && canEdit && (
            <EditPanel style={{ marginTop:0, marginBottom:10 }}>
              <EditPanelTitle>New Activity</EditPanelTitle>
              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Name <span style={{ color:theme.colors.espresso }}>*</span></label>
                <input value={newActName} onChange={e => { setNewActName(e.target.value); setActErrors(er=>({...er,name:''})); }}
                  placeholder="Activity name…"
                  autoFocus
                  style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${actErrors.name?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'7px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }}
                  onKeyDown={e => e.key==='Enter' && handleAddActivity()} />
                {actErrors.name && <span style={{ fontSize:10, color:theme.colors.danger }}>{actErrors.name}</span>}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Start Date <span style={{ color:theme.colors.espresso }}>*</span></label>
                  <input type="date" value={newActStart} onChange={e => { setNewActStart(e.target.value); setActErrors(er=>({...er,start:''})); }}
                    style={{ background:theme.colors.mid, border:`1px solid ${actErrors.start?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'6px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
                  {actErrors.start && <span style={{ fontSize:10, color:theme.colors.danger }}>{actErrors.start}</span>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>End Date <span style={{ color:theme.colors.espresso }}>*</span></label>
                  <input type="date" value={newActEnd} onChange={e => { setNewActEnd(e.target.value); setActErrors(er=>({...er,end:''})); }}
                    min={newActStart||undefined}
                    style={{ background:theme.colors.mid, border:`1px solid ${actErrors.end?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'6px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
                  {actErrors.end && <span style={{ fontSize:10, color:theme.colors.danger }}>{actErrors.end}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <BtnPrimary style={{ fontSize:11, padding:'6px 16px' }} onClick={handleAddActivity} disabled={addingAct}>{addingAct ? 'Adding…' : 'Add'}</BtnPrimary>
                <BtnGhost style={{ fontSize:11, padding:'6px 12px' }} onClick={() => { setPanel(null); setActErrors({}); }}>Cancel</BtnGhost>
              </div>
            </EditPanel>
          )}

          {loading && <div style={{ color:theme.colors.ash, fontSize:12 }}>Loading…</div>}

          {/* Activity's OWN column header — same reasoning as the Phase
              header above: an Activity has no single assignee or priority
              either, so it gets the same Manager/Dates/Status set, shown
              right where its rows actually start instead of being implied
              by a header three levels away at the top of the page. */}
          {/* paddingLeft:25 — Activity's GroupRow (level=1) has real
              structural padding-left 25 (10 + 1*15); that part IS a fact
              about the row's own layout, not a guess, so it's kept as a
              number. The chevron-sized offset ON TOP of that uses the same
              invisible-spacer trick as the Participants header (see
              ProjectDetailPage.js's Phase header) instead of also being a
              hand-tuned number — that's what kept this drifting by a few
              px in earlier passes: it matched where the CHEVRON starts,
              not where the actual name text starts. */}
          {/* Navy gradient below — Activity's own color family, distinct
              from Phase's copper (the default TableHead gradient, used
              unchanged by the top-level Phase header above), so each
              level's header visibly matches its own row/body tint. */}
          {!loading && activities.length > 0 && (
            <TableHead style={{ marginBottom:2, borderRadius:6, paddingLeft:25, background:`linear-gradient(90deg, ${theme.colors.white} 0%, ${theme.colors.navyTint}40 100%)` }}>
              <TableHeadCell>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:11, height:11, flexShrink:0 }} />
                  Activity
                </span>
              </TableHeadCell>
              {/* Centered — see the Phase header in ProjectDetailPage.js
                  for the reasoning. */}
              <TableHeadCell w={GROUP_COL.manager} center>Participants</TableHeadCell>
              <TableHeadCell w={GROUP_COL.dates} center>Dates</TableHeadCell>
              <TableHeadCell w={GROUP_COL.progress} center>Progress</TableHeadCell>
              <TableHeadCell w={GROUP_COL.status} center>Status</TableHeadCell>
            </TableHead>
          )}
          {!loading && visibleActivities.map(act => (
            <ActivityRow
              key={act.activityId}
              activity={act}
              allActivities={activities}
              projectMembers={projectMembers}
              phaseManagers={panelManagers}
              myUserId={myUserId}
              onRefetchPhase={fetchActivities}
              onRefetchProject={onRefetchProject}
            />
          ))}
          {!loading && activities.length > 0 && !visibleActivities.length && (
            <div style={{ fontSize:12, color:theme.colors.ash, padding:'8px 0' }}>No activities match the current filters.</div>
          )}
          {/* BUG-031: this used to stay visible even while the Add
              Activity form above was open, reading as contradictory
              ("no activities yet" directly above an open add-activity
              form). panel !== 'addact' hides it while that form is open. */}
          {!loading && !activities.length && panel !== 'addact' && (
            <div style={{ fontSize:12, color:theme.colors.ash, padding:'8px 0' }}>No activities yet.</div>
          )}
        </PhaseBody>
      )}
    </>
  );
}
