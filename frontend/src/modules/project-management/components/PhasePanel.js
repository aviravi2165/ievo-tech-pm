import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronRight, ChevronUp, ChevronDown, ArrowRight, RotateCcw, Trash2, Users } from 'lucide-react';
import StatusBadge, { InactiveBadge } from './StatusBadge';
import ProgressBar from './ProgressBar';
import DelayBadge from './DelayBadge';
import ActivityRow from './ActivityRow';
import UserSearchInput from './UserSearchInput';
import { phaseApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { GroupRow, RowActions, GROUP_COL, TableHead, TableHeadCell } from '../styles/Table.styles';
import { PhaseName, PhaseBody } from '../styles/PhasePanel.styles';
import {
  DepBadge, IconBtn, IconBtnDanger, EditPanel, EditPanelTitle, BtnPrimary, BtnGhost,
} from '../styles/shared.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect, FilterSelect } from '../../shared/components/TableControls';

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
  const [panel,       setPanel]       = useState(null); // 'dates'|'deps'|'addact'

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

  // Phase members — this panel didn't exist at all before: the backend
  // endpoints (phaseApi.getMembers/addMember/updateMemberRole/removeMember)
  // were fully implemented but nothing in the frontend ever called them,
  // so a Phase Manager could only be added indirectly via the project
  // Members tab's expandable per-phase role editor, with no way to see or
  // manage a phase's roster from the phase row itself.
  const [phaseMembers,  setPhaseMembers]  = useState([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberSearch,  setMemberSearch]  = useState(null);
  const [memberError,   setMemberError]   = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Employee');

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

  // ── Phase member management ──────────────────────────────────────────────────
  const fetchPhaseMembers = useCallback(async () => {
    setMemberLoading(true);
    try { setPhaseMembers(await phaseApi.getMembers(phase.phaseId)); }
    catch { }
    finally { setMemberLoading(false); }
  }, [phase.phaseId]);

  const handleAddPhaseMember = async () => {
    if (!memberSearch) return;
    setMemberError('');
    try {
      await phaseApi.addMember(phase.phaseId, memberSearch.userId, newMemberRole);
      setMemberSearch(null);
      setNewMemberRole('Employee');
      await fetchPhaseMembers();
    } catch (err) {
      setMemberError(err?.response?.data?.error || 'Failed to add member.');
    }
  };

  const handlePhaseMemberRoleChange = async (uid, role) => {
    try { await phaseApi.updateMemberRole(phase.phaseId, uid, role); await fetchPhaseMembers(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to change role.')); }
  };

  const handleRemovePhaseMember = async (uid) => {
    try { await phaseApi.removeMember(phase.phaseId, uid); await fetchPhaseMembers(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
  };

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
              onClick={e => { e.stopPropagation(); togglePanel('deps'); }} style={{ cursor:'pointer', flexShrink:0 }}>
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

        {/* Grid column 2: Manager — a Phase has a Manager/roster, not a
            single task-style assignee, hence "Manager" not "Assignee".
            Shows the Phase's own Manager(s) when explicitly set; falls
            back to the project Manager(s) when nothing's been explicitly
            added at the phase level yet — which is the common case —
            since a project Manager already has full authority over every
            phase per roleService's inheritance rule, so they genuinely
            ARE the effective manager here. Clicking it opens a Phase
            Members panel — this didn't exist anywhere in the UI before
            despite the backend fully supporting it. */}
        <div style={{ overflow:'hidden', cursor: canEdit && !isInactive ? 'pointer' : 'default' }}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('members'); if (panel !== 'members') fetchPhaseMembers(); } : undefined}
          title={(canEdit && !isInactive) ? 'Click to manage phase members' : undefined}
        >
          {(() => {
            const projectManagerNames = projectMembers.filter(m => m.role === 'Manager').map(m => m.name).join(', ');
            const label = phase.managerNames || projectManagerNames;
            if (!label) return phase.memberCount > 0
              ? <span style={{ fontSize:10, color:theme.colors.ash }}>{phase.memberCount} member{phase.memberCount !== 1 ? 's' : ''}</span>
              : null;
            return (
              <span style={{ fontSize:10, color: phase.managerNames ? theme.colors.onyx : theme.colors.ash, fontWeight: phase.managerNames ? 600 : 400, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}
                title={phase.managerNames ? label : `${label} (project Manager — no Phase-specific Manager set)`}>
                {label}
              </span>
            );
          })()}
        </div>

        {/* Grid column 3: Dates — the actual planned date range AND the
            delay warning together, not one replacing the other. Clicking
            it opens the same edit panel the old dedicated "Edit dates"
            icon opened. */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, overflow:'hidden', cursor: canEdit && !isInactive ? 'pointer' : 'default' }}
          onClick={(canEdit && !isInactive) ? (e) => { e.stopPropagation(); togglePanel('dates'); } : undefined}
          title={(canEdit && !isInactive) ? 'Click to edit dates' : undefined}
        >
          <span style={{ fontSize:10, color:theme.colors.ash, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{dateRange}</span>
          {phase.delayDays > 0 && <DelayBadge days={phase.delayDays} label="Late by" />}
        </div>

        {/* Grid column 4: Progress — BUG-030: this used to be crammed into
            the Name cluster (column 1); Status already had its own column,
            Progress now matches it and ProjectListPage's own dedicated
            Progress column. */}
        <div style={{ overflow:'hidden' }} onClick={e => e.stopPropagation()}>
          <ProgressBar value={phase.progress || 0} />
        </div>

        {/* Grid column 5: Status */}
        <div style={{ overflow:'hidden' }}>
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
        <RowActions onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              {!isInactive && (
                <IconBtn active={panel==='members'} title="Add Manager / Viewer / member"
                  onClick={() => { togglePanel('members'); if (panel !== 'members') fetchPhaseMembers(); }} style={{width:20,height:20}}>
                  <Users size={14} strokeWidth={2} />
                </IconBtn>
              )}
              {!isInactive && otherPhases.length > 0 && (
                <IconBtn active={panel==='deps'} title="Manage prerequisites"
                  onClick={() => togglePanel('deps')} style={{width:20,height:20}}>
                  <ArrowRight size={14} strokeWidth={2} />
                </IconBtn>
              )}
              <div style={{ width:1, height:16, background:theme.colors.border, margin:'0 1px', flexShrink:0 }} />
              {isInactive ? (
                <IconBtn title="Reactivate" onClick={handleReactivate} style={{width:20,height:20}}>
                  <RotateCcw size={14} strokeWidth={2} />
                </IconBtn>
              ) : (
                <IconBtnDanger title="Delete" onClick={handleDelete} style={{width:20,height:20}}>
                  <Trash2 size={14} strokeWidth={2} />
                </IconBtnDanger>
              )}
            </>
          )}
        </RowActions>
      </GroupRow>

      {/* ── Date edit panel ── */}
      {panel === 'dates' && canEdit && (
        <div style={{ padding:'12px 18px 14px', borderTop:`1px solid ${theme.colors.border}`, background:theme.colors.greige }}>
          <EditPanelTitle style={{ marginBottom:10 }}>Phase Dates</EditPanelTitle>
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
      )}

      {/* ── Phase Members panel — new; didn't exist before. Same
          add-with-role / promote-demote / remove pattern as Activity's
          Members panel. ── */}
      {panel === 'members' && canEdit && (
        <div style={{ padding: '12px 18px 14px', borderTop: `1px solid ${theme.colors.border}`, background: theme.colors.greige }}>
          <EditPanelTitle>Phase Members</EditPanelTitle>
          <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 10 }}>
            A Phase Manager has full management of this phase and everything under it. Employees can be added to activities within it; Viewers get read-only access.
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Add as</label>
            <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)}
              style={{ background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'4px 8px', color:theme.colors.onyx, fontSize:11, fontFamily:'inherit', outline:'none' }}>
              <option value="Manager">Manager — full management of this phase</option>
              <option value="Employee">Employee — can be assigned within this phase</option>
              <option value="Viewer">Viewer — read-only access to this phase</option>
            </select>
          </div>

          {projectMembers.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', marginBottom: 5 }}>Add from project members</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {projectMembers
                  .filter(pm => !phaseMembers.find(fm => String(fm.userId) === String(pm.userId)))
                  .map(pm => (
                    <BtnGhost key={pm.userId} style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={async () => {
                        try { await phaseApi.addMember(phase.phaseId, pm.userId, newMemberRole); await fetchPhaseMembers(); }
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
              excludeUserIds={phaseMembers.map(m => m.userId)}
              placeholder="Search users to add…" />
            <BtnPrimary style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
              onClick={handleAddPhaseMember} disabled={!memberSearch}>
              Add
            </BtnPrimary>
          </div>
          {memberError && <div style={{ color: theme.colors.danger, fontSize: 11, marginBottom: 8 }}>{memberError}</div>}

          {memberLoading && <div style={{ fontSize: 12, color: theme.colors.ash }}>Loading…</div>}
          {!memberLoading && phaseMembers.map(m => (
            <div key={m.userId} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', marginBottom: 4, border:`1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: 'rgba(46, 40, 35, 0.06)' }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background: theme.colors.mid, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color: theme.colors.onyx, flexShrink: 0 }}>{initials(m.name)}</div>
              {/* name/email both truncate — an email is one unbreakable
                  token, so without a shrink+ellipsis guard a long one
                  forces this whole flex row wider than the panel and
                  pushes the role select + Remove button out of view. */}
              <span style={{ flex: 1, minWidth: 60, fontSize: 12, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</span>
              <span style={{ fontSize: 11, color: theme.colors.ash, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>{m.email}</span>
              <select value={m.role} onChange={e => handlePhaseMemberRoleChange(m.userId, e.target.value)}
                style={{ background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'3px 6px', color:theme.colors.onyx, fontSize:11, fontFamily:'inherit', outline:'none' }}>
                <option value="Manager">Manager</option>
                <option value="Employee">Employee</option>
                <option value="Viewer">Viewer</option>
              </select>
              {String(m.userId) !== String(myUserId) && (
                <BtnGhost style={{ fontSize: 11, padding: '2px 8px', color: theme.colors.danger, borderColor: 'rgba(168,93,77,.35)' }}
                  onClick={() => handleRemovePhaseMember(m.userId)}>Remove</BtnGhost>
              )}
            </div>
          ))}
          {!memberLoading && phaseMembers.length === 0 && (
            <div style={{ fontSize: 12, color: theme.colors.ash, fontStyle: 'italic' }}>No phase-specific members yet — the project's Manager(s) have full authority here by default.</div>
          )}
        </div>
      )}

      {/* ── Dependency panel — viewable by anyone, editable by Manager only ── */}
      {panel === 'deps' && (
        <div style={{ padding:'12px 18px 14px', borderTop:`1px solid ${theme.colors.border}`, background:theme.colors.greige }}>
          <EditPanelTitle style={{ marginBottom:6 }}>Phase Prerequisites</EditPanelTitle>
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

          {/* Add via dropdown — Manager only */}
          {canEdit && (
            otherPhases.filter(p => !currentDeps.has(p.phaseId)).length > 0 ? (
              <select defaultValue="" onChange={e => { if (e.target.value) { handleAddDep(Number(e.target.value)); e.target.value = ""; } }}
                style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'6px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }}>
                <option value="">+ Add a predecessor phase…</option>
                {otherPhases.filter(p => !currentDeps.has(p.phaseId)).map(p => (
                  <option key={p.phaseId} value={p.phaseId}>{p.name} ({p.status})</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize:12, color:theme.colors.ash }}>All phases already added as prerequisites.</div>
            )
          )}

          {depError && <div style={{ color:theme.colors.danger, fontSize:11, marginTop:6 }}>{depError}</div>}
        </div>
      )}

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
                <>
                  <SortSelect
                    value={actSortKey} onChange={setActSortKey} dir={actSortDir} onToggleDir={toggleActSortDir}
                    options={[
                      { value:'name', label:'Name' }, { value:'start', label:'Start' },
                      { value:'end', label:'End' }, { value:'status', label:'Status' },
                    ]}
                  />
                  <FilterSelect placeholder="All statuses" value={actFilters.status} onChange={v => setActFilter('status', v)} options={activityStatusOptions} />
                </>
              )}
              {canEdit && !isInactive && (
                <BtnGhost style={{ padding:'4px 12px', fontSize:11 }}
                  onClick={() => togglePanel('addact')}>
                  + Add Activity
                </BtnGhost>
              )}
            </div>
          </div>

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
          {/* paddingLeft:41 — Activity's GroupRow (level=1) has padding-
              left 25 (10 + 1*15), THEN an 11px chevron + 5px gap before
              its name text (25+11+5=41). The previous fix used 25 (the
              row's raw padding-left) without accounting for the chevron —
              that's what was still visibly misaligned: it matched where
              the CHEVRON starts, not where the actual name text starts. */}
          {/* Navy gradient below — Activity's own color family, distinct
              from Phase's copper (the default TableHead gradient, used
              unchanged by the top-level Phase header above), so each
              level's header visibly matches its own row/body tint. */}
          {!loading && activities.length > 0 && (
            <TableHead style={{ marginBottom:2, borderRadius:6, paddingLeft:41, background:`linear-gradient(90deg, ${theme.colors.white} 0%, ${theme.colors.navyTint}40 100%)` }}>
              <TableHeadCell>Activity</TableHeadCell>
              <TableHeadCell w={GROUP_COL.manager}>Manager</TableHeadCell>
              <TableHeadCell w={GROUP_COL.dates}>Dates</TableHeadCell>
              <TableHeadCell w={GROUP_COL.progress} center>Progress</TableHeadCell>
              <TableHeadCell w={GROUP_COL.status}>Status</TableHeadCell>
            </TableHead>
          )}
          {!loading && visibleActivities.map(act => (
            <ActivityRow
              key={act.activityId}
              activity={act}
              allActivities={activities}
              projectMembers={projectMembers}
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
