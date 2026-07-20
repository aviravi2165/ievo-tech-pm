import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronLeft, LayoutGrid } from 'lucide-react';
import StatusBadge, { InactiveBadge } from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import OverdueBadge from '../components/OverdueBadge';
import DelayBadge from '../components/DelayBadge';
import PhasePanel from '../components/PhasePanel';
import MemberManager from '../components/MemberManager';
import UserSearchInput from '../components/UserSearchInput';
import AuditLog from '../components/AuditLog';
import TimelineView from '../components/TimelineView';
import { useProject } from '../hooks/useProject';
import { projectApi, phaseApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { Table, TableHead, TableHeadCell, GROUP_COL } from '../styles/Table.styles';
import {
  Detail, DetailHeader, DetailTitle, DetailSub, DetailTabs, Tab, DetailBody,
} from '../styles/ProjectDetailPage.styles';
import {
  Wrap, IconBtn, BtnPrimary, BtnGhost, EditPanel, EditPanelTitle, Empty, DepBadge, MemberRow,
} from '../styles/shared.styles';

const PROJECT_ROLES = ['Manager', 'Member', 'Viewer'];

// Audit tab is visible to ALL members (Managers see full log, others read-only)
const TABS = ['Phases', 'Timeline', 'Members', 'Audit'];

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
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseStart, setNewPhaseStart] = useState('');
  const [newPhaseEnd,   setNewPhaseEnd]   = useState('');
  const [phaseErrors,   setPhaseErrors]   = useState({});
  const [addingPhase,   setAddingPhase]   = useState(false);

  // Inline "add project member" popover off the header badge — same
  // add-with-role pattern as Phase/Activity member panels, instead of
  // just jumping to the Members tab.
  const [membersOpen,  setMembersOpen]  = useState(false);
  const [memberSearch, setMemberSearch] = useState(null);
  const [newMemberRole, setNewMemberRole] = useState('Member');
  const [memberError,  setMemberError]  = useState('');
  const [memberSaving, setMemberSaving] = useState(false);
  const membersRef = useRef(null);

  useEffect(() => {
    if (!membersOpen) return;
    const handler = (e) => { if (membersRef.current && !membersRef.current.contains(e.target)) setMembersOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [membersOpen]);

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

  const handleAddProjectMember = async () => {
    if (!memberSearch) return;
    setMemberError(''); setMemberSaving(true);
    try {
      await projectApi.addMember(projectId, { userId: memberSearch.userId, role: newMemberRole });
      setMemberSearch(null);
      setNewMemberRole('Member');
      refetch();
    } catch (err) {
      setMemberError(err?.response?.data?.error || 'Failed to add member.');
    } finally { setMemberSaving(false); }
  };

  const handleProjectMemberRoleChange = async (uid, role) => {
    try { await projectApi.updateMember(projectId, uid, { role }); refetch(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to change role.')); }
  };

  const handleRemoveProjectMember = async (uid, name) => {
    if (!window.confirm(`Remove ${name} from this project?`)) return;
    try { await projectApi.removeMember(projectId, uid); refetch(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
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

  return (
    <Detail>
      {/* ── Header ── */}
      <DetailHeader>
        <IconBtn onClick={onBack} title="Back to projects">
          <ChevronLeft size={18} strokeWidth={2.2} />
        </IconBtn>

        <div style={{ flex:'1 1 220px', minWidth:180 }}>
          <DetailTitle title={project.name}>{project.name}</DetailTitle>
          <DetailSub>
            {project.ownerName && <span>Owner: {project.ownerName}</span>}
            {project.plannedStart && <span> · {fmtDate(project.plannedStart)} → {fmtDate(project.plannedEnd)}</span>}
            {project.isOverdue && <> · <OverdueBadge /></>}
            {/* width:100% forces this onto its own line below the owner/date
                row (was previously just another wrapping flex item, so on
                wide screens with room to spare it rendered inline right
                after the dates with no separator — visually blending into
                the title above it, which read as the project name being
                shown twice). Italic + "Description:" label make it
                unambiguous that this is a separate field, not more title. */}
            {project.description && (
              <div style={{ width:'100%', marginTop:3, color:theme.colors.ash, fontSize:11, fontStyle:'italic', maxWidth:600, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>
                <span style={{ fontStyle:'normal', fontWeight:600, marginRight:4 }}>Description:</span>
                {project.description}
              </div>
            )}
          </DetailSub>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ minWidth:160 }}>
            <ProgressBar value={project.progress || 0} />
          </div>
          <DelayBadge days={project.delayDays} label="Delayed by" />
          <StatusBadge status={project.status} />
          {isProjectInactive && <InactiveBadge />}
          {project.isSuperAdmin && (
            <DepBadge as="span" title="You're not a member of this project — you have manage access via admin oversight." style={{ background: theme.colors.warning, color: '#fff' }}>
              Admin access
            </DepBadge>
          )}
          {/* Clicking this now opens an inline add-member popover right
              here (same pattern as the Phase/Activity member tags) instead
              of just jumping to the Members tab — the Members tab is still
              there for the full hierarchical view/management. */}
          <div style={{ position: 'relative' }} ref={membersRef}>
            <DepBadge
              as="button"
              type="button"
              onClick={() => setMembersOpen(v => !v)}
              title="Add / manage project members"
              style={{ padding:'3px 10px', borderRadius:12, cursor:'pointer', border:'none', fontFamily:'inherit' }}
            >
              {myRole} · {project.members?.length || 0} member{(project.members?.length || 0) !== 1 ? 's' : ''}
            </DepBadge>

            {membersOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                width: 340, background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
                borderTop: `2px solid ${theme.colors.espresso}`, borderRadius: theme.radius.sm,
                boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: '12px 14px',
              }}>
                <EditPanelTitle style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  Project Members
                  <BtnGhost onClick={() => setMembersOpen(false)} style={{ fontSize:11, padding:'2px 8px' }}>✕</BtnGhost>
                </EditPanelTitle>

                {canEdit && (
                  <>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                      <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Add as</label>
                      <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)}
                        style={{ background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'4px 8px', color:theme.colors.onyx, fontSize:11, fontFamily:'inherit', outline:'none' }}>
                        <option value="Manager">Manager — full project access</option>
                        <option value="Member">Member — can edit assigned tasks</option>
                        <option value="Viewer">Viewer — read-only</option>
                      </select>
                    </div>
                    <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                      <UserSearchInput selectedUser={memberSearch} onSelect={setMemberSearch}
                        excludeUserIds={(project.members || []).map(m => m.userId)}
                        placeholder="Search users to add…" />
                      <BtnPrimary style={{ fontSize:11, padding:'6px 12px', flexShrink:0 }}
                        onClick={handleAddProjectMember} disabled={!memberSearch || memberSaving}>
                        {memberSaving ? '…' : 'Add'}
                      </BtnPrimary>
                    </div>
                    {memberError && <div style={{ color: theme.colors.danger, fontSize: 11, marginBottom: 8 }}>{memberError}</div>}
                  </>
                )}

                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {(project.members || []).map(m => (
                    <div key={m.userId} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', marginBottom:4, border:`1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: 'rgba(46, 40, 35, 0.06)' }}>
                      <span style={{ flex:1, fontSize:12, color:theme.colors.onyx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</span>
                      {canEdit ? (
                        <>
                          <select value={m.role} onChange={e => handleProjectMemberRoleChange(m.userId, e.target.value)}
                            style={{ background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'3px 6px', color:theme.colors.onyx, fontSize:11, fontFamily:'inherit', outline:'none' }}>
                            {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {/* No self-removal — same guard as MemberManager's
                              full Members tab (and enforced server-side);
                              this quick popover was missed when that rule
                              was added and still offered the button. */}
                          {String(m.userId) !== String(myUserId) && (
                            <BtnGhost style={{ fontSize:11, padding:'2px 8px', color: theme.colors.danger, borderColor:'rgba(168,93,77,.35)' }}
                              onClick={() => handleRemoveProjectMember(m.userId, m.name)}>Remove</BtnGhost>
                          )}
                        </>
                      ) : (
                        <DepBadge as="span" style={{ padding:'2px 10px' }}>{m.role}</DepBadge>
                      )}
                    </div>
                  ))}
                  {(project.members || []).length === 0 && (
                    <div style={{ fontSize:12, color:theme.colors.ash, fontStyle:'italic' }}>No members yet.</div>
                  )}
                </div>

                <BtnGhost onClick={() => { setMembersOpen(false); setTab('Members'); }} style={{ fontSize:11, marginTop:8, width:'100%' }}>
                  Open full Members tab →
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
            {t === 'Members' && <span style={{ marginLeft:5, opacity:.6, fontSize:11 }}>({project.members?.length||0})</span>}
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
                  <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Phase Name *</label>
                  <input value={newPhaseName} onChange={e => { setNewPhaseName(e.target.value); setPhaseErrors(er=>({...er,name:''})); }}
                    placeholder="e.g. Design, Development, QA…"
                    autoFocus
                    style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${phaseErrors.name?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'8px 12px', color:theme.colors.onyx, fontSize:13, fontFamily:'inherit', outline:'none' }}
                    onKeyDown={e => e.key==='Enter' && handleAddPhase()} />
                  {phaseErrors.name && <div style={{ fontSize:11, color:theme.colors.danger, marginTop:3 }}>{phaseErrors.name}</div>}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>Start Date *</label>
                    <input type="date" value={newPhaseStart} onChange={e => { setNewPhaseStart(e.target.value); setPhaseErrors(er=>({...er,start:''})); }}
                      style={{ background:theme.colors.mid, border:`1px solid ${phaseErrors.start?theme.colors.danger:theme.colors.border}`, borderRadius:theme.radius.sm, padding:'7px 10px', color:theme.colors.onyx, fontSize:12, fontFamily:'inherit', outline:'none' }} />
                    {phaseErrors.start && <span style={{ fontSize:10, color:theme.colors.danger }}>{phaseErrors.start}</span>}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <label style={{ fontSize:10, color:theme.colors.ash, fontWeight:600, textTransform:'uppercase' }}>End Date *</label>
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
                {/* paddingLeft:28 — a Phase row starts with a 13px chevron
                    + 5px gap before its name text (10px base padding +
                    13 + 5 = 28), so "Name" needs the same offset to align
                    with the actual name text below it, not just the row's
                    raw padding-left (10). */}
                <TableHead style={{ paddingLeft:28 }}>
                  <TableHeadCell>Name</TableHeadCell>
                  <TableHeadCell w={GROUP_COL.manager}>Manager</TableHeadCell>
                  <TableHeadCell w={GROUP_COL.dates}>Dates</TableHeadCell>
                  <TableHeadCell w={GROUP_COL.status}>Status</TableHeadCell>
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

        {/* ── Timeline tab ── */}
        {tab === 'Timeline' && (
          <TimelineView
            phases={phases}
            projectStart={project.plannedStart}
            projectEnd={project.plannedEnd}
          />
        )}

        {/* ── Members tab ── */}
        {tab === 'Members' && (
          canEdit
            ? <MemberManager projectId={projectId} members={project.members || []} myRole={project.myRole} myUserId={myUserId} onRefetch={refetch} />
            : (
              <div>
                {(project.members || []).map(m => (
                  <MemberRow key={m.userId} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize:13, color:theme.colors.onyx, flex:1 }}>{m.name}</div>
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
