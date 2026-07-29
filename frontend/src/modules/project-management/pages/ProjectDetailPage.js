import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronLeft, LayoutGrid, RotateCcw } from 'lucide-react';
import StatusBadge, { InactiveBadge } from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import OverdueBadge from '../components/OverdueBadge';
import DelayBadge from '../components/DelayBadge';
import PhasePanel from '../components/PhasePanel';
import MemberManager from '../components/MemberManager';
import ParticipantsPanel from '../components/ParticipantsPanel';
import AuditLog from '../components/AuditLog';
import ProjectAnalytics from '../components/ProjectAnalytics';
import { useProject } from '../hooks/useProject';
import { useProjectAnalytics } from '../hooks/useProjectAnalytics';
import { aggregateAssignees } from '../utils/aggregateAssignees';
import { projectApi, phaseApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { Table, TableHead, TableHeadCell, GROUP_COL } from '../styles/Table.styles';
import {
  Detail, DetailHeader, DetailTitle, DetailSub, DetailTabs, Tab, DetailBody,
} from '../styles/ProjectDetailPage.styles';
import {
  Wrap, IconBtn, BtnPrimary, BtnGhost, EditPanel, EditPanelTitle, Empty, DepBadge, MemberRow,
} from '../styles/shared.styles';

// Audit tab is visible to ALL members (Managers see full log, others read-only)
const TABS = ['Phases', 'Analytics', 'Participants', 'Audit'];

function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return '—';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectDetailPage({ projectId, onBack, currentUser }) {
  const theme = useTheme();
  const { project, phases, loading, error, refetch } = useProject(projectId);
  const [tab,          setTab]          = useState('Phases');
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseStart, setNewPhaseStart] = useState('');
  const [newPhaseEnd,   setNewPhaseEnd]   = useState('');
  const [phaseErrors,   setPhaseErrors]   = useState({});
  const [addingPhase,   setAddingPhase]   = useState(false);

  // Inline Participants popover off the header badge — same ParticipantsPanel
  // used at Phase/Activity level, instead of just jumping to the Members tab.
  const [membersOpen,  setMembersOpen]  = useState(false);
  const membersRef = useRef(null);

  useEffect(() => {
    if (!membersOpen) return;
    const handler = (e) => { if (membersRef.current && !membersRef.current.contains(e.target)) setMembersOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [membersOpen]);

  // Project-wide Assignees roll-up — reuses the same fetch-everything hook
  // the Analytics tab uses, gated on the popover actually being open so it
  // doesn't fetch every project's full task tree on every page load.
  const { tasks: allProjectTasks, loading: assigneesLoading } = useProjectAnalytics(project?.projectId, phases, membersOpen);

  const myRole  = project?.myRole;
  const canEdit = myRole === 'Manager';
  const myUserId = currentUser?.userId;
  const isProjectInactive = project?.isActive === false;

  const handleReorder = async (phaseId, direction) => {
    try { await phaseApi.reorder(phaseId, direction); refetch(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to reorder phase.')); }
  };

  const handleAddPhase = async () => {
    const errs = {};
    if (!newPhaseName.trim()) errs.name  = 'Name required';
    if (!newPhaseStart)       errs.start = 'Start date required';
    if (!newPhaseEnd)         errs.end   = 'End date required';
    if (newPhaseStart && newPhaseEnd && newPhaseEnd < newPhaseStart) errs.end = 'End must be after start';
    if (Object.keys(errs).length) { setPhaseErrors(errs); return; }
    if (addingPhase) return; // already in flight — the disabled button below should already stop this, but guard the handler itself too
    setAddingPhase(true);
    try {
      await projectApi.createPhase(projectId, {
        name:         newPhaseName.trim(),
        plannedStart: newPhaseStart,
        plannedEnd:   newPhaseEnd,
      });
      setNewPhaseName(''); setNewPhaseStart(''); setNewPhaseEnd('');
      setShowAddPhase(false); setPhaseErrors({});
      refetch();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to add phase.')); }
    finally { setAddingPhase(false); }
  };

  // BUG-029: previously the only "Reactivate" control visible anywhere on
  // this page belonged to a Phase row (PhasePanel.js), which reactivates
  // that phase, not the project — leaving the project itself still
  // INACTIVE with no explanation. projectApi.reactivate already existed
  // and worked (used on ProjectListPage), it just wasn't wired up here.
  const handleReactivateProject = async () => {
    try { await projectApi.reactivate(projectId); refetch(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to reactivate project.')); }
  };

  // ── Project Managers (passed to ParticipantsPanel's Managers section) ─────────
  const handleAddProjectManager = async (userId) => {
    await projectApi.addMember(projectId, { userId, role: 'Manager' });
    refetch();
  };
  const handleRemoveProjectManager = async (uid) => {
    try { await projectApi.removeMember(projectId, uid); refetch(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
  };

  // ── Project Viewers — the ONLY level Viewer can be added at; shown
  // read-only at every Phase/Activity panel underneath. ─────────────────────
  const handleAddProjectViewer = async (userId) => {
    await projectApi.addMember(projectId, { userId, role: 'Viewer' });
    refetch();
  };
  const handleRemoveProjectViewer = async (uid) => {
    try { await projectApi.removeMember(projectId, uid); refetch(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove viewer.')); }
  };

  if (loading) return (
    <Wrap>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:theme.colors.ash }}>
        Loading project…
      </div>
    </Wrap>
  );

  if (error || !project) return (
    <Wrap>
      <div style={{ padding:24, color:theme.colors.danger }}>
        {error || 'Project not found.'}{' '}
        <BtnGhost onClick={onBack} style={{ marginLeft:8 }}>← Back</BtnGhost>
      </div>
    </Wrap>
  );

  // ── Project-level Participants panel data ──────────────────────────────────
  const projectManagerRows = (project.members || []).filter(m => m.role === 'Manager');
  const projectViewerRows  = (project.members || []).filter(m => m.role === 'Viewer');
  // Legacy 'Member' role — no longer an addable tier anywhere; existing rows
  // (like a project member added before this redesign) merge into Assignees
  // below instead of just disappearing from view.
  const legacyMemberRows = (project.members || []).filter(m => m.role !== 'Manager' && m.role !== 'Viewer');
  const managerQuickAddPool = (project.members || [])
    .filter(m => m.role !== 'Manager')
    .map(m => ({ userId: m.userId, name: m.name, email: m.email }));
  const viewerQuickAddPool = legacyMemberRows.map(m => ({ userId: m.userId, name: m.name, email: m.email }));
  const mergedProjectAssignees = (() => {
    const map = new Map(aggregateAssignees(allProjectTasks).map(a => [String(a.userId), a]));
    legacyMemberRows.forEach(m => {
      const key = String(m.userId);
      if (!map.has(key)) map.set(key, { userId: m.userId, name: m.name, taskCount: 0 });
    });
    return [...map.values()].sort((a, b) => b.taskCount - a.taskCount);
  })();

  return (
    <Detail>
      {/* ── Header ── */}
      <DetailHeader>
        <IconBtn onClick={onBack} title="Back to projects">
          <ChevronLeft size={18} strokeWidth={2.2} />
        </IconBtn>

        {/* Plain block stack (title / owner+dates / description), not a
            single flex-wrap row — a width:100% flex item was relied on to
            force the description onto its own line below Owner, but that's
            fragile: it only reliably wraps when the item is the actual next
            flex sibling with no competing basis, and broke down into the
            description rendering inline with (or visually ahead of) the
            Owner/dates line depending on available width. Three explicit
            blocks stack top-to-bottom unconditionally, no wrap ambiguity. */}
        <div style={{ flex:'1 1 220px', minWidth:180 }}>
          <DetailTitle title={project.name}>{project.name}</DetailTitle>
          <DetailSub>
            {project.ownerName && <span>Owner: {project.ownerName}</span>}
            {project.plannedStart && <span> · {fmtDate(project.plannedStart)} → {fmtDate(project.plannedEnd)}</span>}
            {project.isOverdue && <> · <OverdueBadge days={project.overdueDays} /></>}
          </DetailSub>
          {project.description && (
            // Previously always clamped to 1 line with no way to read the
            // rest — no tooltip, no expand, the text was just gone.
            // Click-to-expand toggles the clamp off entirely; native
            // title= tooltip covers the collapsed state too, so the full
            // text is reachable either way.
            <div
              onClick={() => setDescExpanded(v => !v)}
              title={descExpanded ? 'Click to collapse' : project.description}
              style={{
                marginTop:3, color:theme.colors.ash, fontSize:11, fontStyle:'italic',
                maxWidth:600, cursor:'pointer',
                ...(descExpanded
                  ? { whiteSpace:'pre-wrap' }
                  : { overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }),
              }}
            >
              <span style={{ fontStyle:'normal', fontWeight:600, marginRight:4 }}>Description:</span>
              {project.description}
            </div>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ minWidth:160 }}>
            <ProgressBar value={project.progress || 0} />
          </div>
          <DelayBadge days={project.delayDays} label="Delayed by" />
          <StatusBadge status={project.status} />
          {isProjectInactive && <InactiveBadge />}
          {isProjectInactive && myRole === 'Manager' && (
            <IconBtn title="Reactivate project" onClick={handleReactivateProject} style={{ width:26, height:26 }}>
              <RotateCcw size={13} strokeWidth={2} />
            </IconBtn>
          )}
          {project.isSuperAdmin && (
            <DepBadge as="span" title="You're not a member of this project — you have manage access via admin oversight." style={{ background: theme.colors.warning, color: '#fff' }}>
              Admin access
            </DepBadge>
          )}
          {/* Clicking this opens the same ParticipantsPanel used at Phase/
              Activity level (Project Managers / Assignees / Viewers), not
              a one-off popup — the Members tab is still there for the full
              hierarchical view. */}
          <div style={{ position: 'relative' }} ref={membersRef}>
            <DepBadge
              as="button"
              type="button"
              onClick={() => setMembersOpen(v => !v)}
              title="View / manage project participants"
              style={{ padding:'3px 10px', borderRadius:12, cursor:'pointer', border:'none', fontFamily:'inherit' }}
            >
              Participants · {project.members?.length || 0}
            </DepBadge>

            {membersOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                width: 360, background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
                borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
                boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
                maxHeight: 460, overflowY: 'auto',
              }}>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom: 4 }}>
                  <BtnGhost onClick={() => setMembersOpen(false)} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
                </div>
                <ParticipantsPanel
                  levelLabel="Project"
                  inheritedGroups={[]}
                  managers={projectManagerRows}
                  managersLoading={false}
                  canEditManagers={canEdit}
                  onAddManager={handleAddProjectManager}
                  onRemoveManager={handleRemoveProjectManager}
                  managerQuickAddPool={managerQuickAddPool}
                  excludeUserIdsForSearch={(project.members || []).map(m => m.userId)}
                  myUserId={myUserId}
                  assigneesLoading={assigneesLoading}
                  assignees={mergedProjectAssignees}
                  viewerGroup={{
                    people: projectViewerRows,
                    editable: canEdit,
                    loading: false,
                    onAdd: handleAddProjectViewer,
                    onRemove: handleRemoveProjectViewer,
                    quickAddPool: viewerQuickAddPool,
                  }}
                />
                <BtnGhost onClick={() => { setMembersOpen(false); setTab('Participants'); }} style={{ fontSize:11, marginTop:4, width:'100%' }}>
                  Open full Participants tab →
                </BtnGhost>
              </div>
            )}
          </div>
        </div>
      </DetailHeader>

      {/* ── Tabs ── */}
      <DetailTabs>
        {TABS.map(t => (
          <Tab key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
            {t === 'Phases'  && <span style={{ marginLeft:5, opacity:.6, fontSize:11 }}>({phases.length})</span>}
            {t === 'Participants' && <span style={{ marginLeft:5, opacity:.6, fontSize:11 }}>({project.members?.length||0})</span>}
          </Tab>
        ))}
      </DetailTabs>

      {/* ── Body ── */}
      <DetailBody>

        {/* ── Phases tab ── */}
        {tab === 'Phases' && (
          <>
            {canEdit && !isProjectInactive && (
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:4 }}>
                <BtnPrimary onClick={() => setShowAddPhase(v => !v)}>
                  {showAddPhase ? '✕ Cancel' : '+ Add Phase'}
                </BtnPrimary>
              </div>
            )}

            {showAddPhase && (
              <EditPanel style={{ marginTop: 0, padding: '16px 18px', marginBottom: 12 }}>
                <EditPanelTitle style={{ marginBottom: 12 }}>New Phase</EditPanelTitle>
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Phase Name <span style={{ color:theme.colors.espresso }}>*</span></label>
                  <input value={newPhaseName} onChange={e => { setNewPhaseName(e.target.value); setPhaseErrors(er=>({...er,name:''})); }}
                    placeholder="e.g. Design, Development, QA…"
                    autoFocus
                    style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${phaseErrors.name?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'8px 12px', color:theme.colors.onyx, fontSize:13, fontFamily:'inherit', outline:'none' }}
                    onKeyDown={e => e.key==='Enter' && handleAddPhase()} />
                  {phaseErrors.name && <div style={{ fontSize:11, color:theme.colors.danger, marginTop:3 }}>{phaseErrors.name}</div>}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Start Date <span style={{ color:theme.colors.espresso }}>*</span></label>
                    <input type="date" value={newPhaseStart} onChange={e => { setNewPhaseStart(e.target.value); setPhaseErrors(er=>({...er,start:''})); }}
                      style={{ background:theme.colors.mid, border:`1px solid ${phaseErrors.start?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'7px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
                    {phaseErrors.start && <span style={{ fontSize:10, color:theme.colors.danger }}>{phaseErrors.start}</span>}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>End Date <span style={{ color:theme.colors.espresso }}>*</span></label>
                    <input type="date" value={newPhaseEnd} onChange={e => { setNewPhaseEnd(e.target.value); setPhaseErrors(er=>({...er,end:''})); }}
                      min={newPhaseStart||undefined}
                      style={{ background:theme.colors.mid, border:`1px solid ${phaseErrors.end?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'7px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
                    {phaseErrors.end && <span style={{ fontSize:10, color:theme.colors.danger }}>{phaseErrors.end}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <BtnPrimary onClick={handleAddPhase} disabled={addingPhase}>{addingPhase ? 'Adding…' : 'Add Phase'}</BtnPrimary>
                  <BtnGhost onClick={() => { setShowAddPhase(false); setPhaseErrors({}); }}>Cancel</BtnGhost>
                </div>
              </EditPanel>
            )}

            {!phases.length && (
              <Empty>
                <LayoutGrid size={38} strokeWidth={1.2} />
                <p>No phases yet. Add one to structure this project.</p>
              </Empty>
            )}

            {/* One shared table for the whole Phase → Activity → Task tree —
                each level still fetches/manages its own children exactly as
                before (PhasePanel renders ActivityRow renders TaskItem);
                only the rendered markup is flat table rows now instead of
                each level being its own bordered card. */}
            {phases.length > 0 && (
              <Table>
                {/* Phase's OWN column set — a Phase has no single assignee
                    or priority (those are Task-only concepts), so this
                    header only claims the fields a Phase row actually
                    carries: a Manager, a date range, and a status. Activity
                    and Task rows get their own matching headers placed
                    right where THEIR rows start (inside PhasePanel.js /
                    ActivityRow.js), not squeezed into this one. */}
                {/* Real same-size invisible spacer (13px chevron + 5px gap,
                    same flex layout as the row) instead of a hand-tuned
                    paddingLeft number — see the Participants header below
                    for why that approach kept drifting off by a few px. */}
                <TableHead>
                  <TableHeadCell>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:13, height:13, flexShrink:0 }} />
                      Name
                    </span>
                  </TableHeadCell>
                  {/* Participants/Dates/Status/Progress are all centered —
                      header text-align:center + cell justifyContent:center
                      within the same fixed-width grid column, the one
                      technique that's actually held up under verification
                      (Progress). Name/Activity/Task stay left-aligned since
                      they carry the expand chevron. */}
                  <TableHeadCell w={GROUP_COL.manager} center>Participants</TableHeadCell>
                  <TableHeadCell w={GROUP_COL.dates} center>Dates</TableHeadCell>
                  {/* BUG-030: Progress used to be crammed inside the Name
                      cell's cluster with no header of its own — it now gets
                      a dedicated column matching Status and matching
                      ProjectListPage's own Progress column. */}
                  <TableHeadCell w={GROUP_COL.progress} center>Progress</TableHeadCell>
                  <TableHeadCell w={GROUP_COL.status} center>Status</TableHeadCell>
                  {/* No trailing spacer needed anymore — RowActions is
                      position:absolute now, so it never consumes flex
                      layout space and can't affect where these columns
                      land regardless of how many action icons any given
                      row shows. */}
                </TableHead>
                {phases.map(ph => (
                  <PhasePanel
                    key={ph.phaseId}
                    phase={ph}
                    projectId={projectId}
                    allPhases={phases}
                    projectMembers={project.members || []}
                    myUserId={myUserId}
                    onReorder={handleReorder}
                    onRefetchProject={refetch}
                  />
                ))}
              </Table>
            )}
          </>
        )}

        {/* ── Analytics tab ── */}
        {tab === 'Analytics' && (
          <ProjectAnalytics
            project={project}
            phases={phases}
            active={tab === 'Analytics'}
          />
        )}

        {/* ── Members tab ── */}
        {tab === 'Participants' && (
          canEdit
            ? <MemberManager projectId={projectId} members={project.members || []} myRole={project.myRole} myUserId={myUserId} onRefetch={refetch} />
            : (
              <div>
                {(project.members || []).map(m => (
                  <MemberRow key={m.userId} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize:12, color:theme.colors.onyx, flex:1 }}>{m.name}</div>
                    <DepBadge as="span" style={{ padding:'2px 10px' }}>{m.role}</DepBadge>
                  </MemberRow>
                ))}
              </div>
            )
        )}

        {/* ── Audit tab — visible to all members ── */}
        {tab === 'Audit' && <AuditLog projectId={projectId} />}
      </DetailBody>
    </Detail>
  );
}
