import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import TaskItem from './TaskItem';
import UserSearchInput from './UserSearchInput';
import ChatButton from './ChatButton';
import { activityApi } from '../api/projectApi';

const ACTIVITY_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];
const PRIORITY_OPTS = ['Low', 'Medium', 'High', 'Critical'];

function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return null;
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

function DueBadge({ start, end, status }) {
  if (!end || status === 'Completed') return null;
  const dt  = parseLocalDate(end);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - now) / 86400000);
  if (diff < 0)  return <span className="pm-late-tag">⚠ {Math.abs(diff)}d late</span>;
  if (diff <= 3) return <span className="pm-due-soon">Ends {diff === 0 ? 'today' : `in ${diff}d`}</span>;
  return (
    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
      {fmtDate(start)} → {fmtDate(end)}
    </span>
  );
}

export default function ActivityRow({
  activity, myRole, allActivities = [], projectMembers = [], myUserId, onRefetchPhase, onRefetchProject
}) {
  const [open,             setOpen]             = useState(false);
  const [tasks,            setTasks]            = useState([]);
  const [loadingTasks,     setLoadingTasks]     = useState(false);
  const [panel,            setPanel]            = useState(null); // 'edit'|'deps'|'addtask'|'members'
  const [localStatus,      setLocalStatus]      = useState(activity.status);

  // Activity members state
  const [actMembers,       setActMembers]       = useState([]);
  const [memberLoading,    setMemberLoading]    = useState(false);
  const [memberSearch,     setMemberSearch]     = useState(null);
  const [memberError,      setMemberError]      = useState('');

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
  const [newTaskDesc,  setNewTaskDesc]  = useState('');
  const [newTaskDeps,  setNewTaskDeps]  = useState([]); // selected dependency taskIds
  // Task assignees chosen at creation (picked from actMembers or searched fresh)
  const [taskAssignees, setTaskAssignees] = useState([]); // [{ userId, name }]
  const [taskAssignSearch, setTaskAssignSearch] = useState(null);
  const [addErrors,    setAddErrors]    = useState({});

  const [depError, setDepError] = useState('');

  const canEdit   = myRole === 'Manager';
  const canMember = myRole === 'Member';

  useEffect(() => { setLocalStatus(activity.status); }, [activity.status]);
  useEffect(() => {
    setEditStart(toInput(activity.plannedStart));
    setEditEnd(toInput(activity.plannedEnd));
    setEditDesc(activity.description || '');
  }, [activity.plannedStart, activity.plannedEnd, activity.description]);

  // ── Fetch tasks ─────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try { setTasks(await activityApi.getTasks(activity.activityId)); }
    catch { }
    finally { setLoadingTasks(false); }
  }, [activity.activityId]);

  // ── Fetch activity members ──────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    setMemberLoading(true);
    try { setActMembers(await activityApi.getMembers(activity.activityId)); }
    catch { }
    finally { setMemberLoading(false); }
  }, [activity.activityId]);

  // Fetch both when opened
  useEffect(() => {
    if (open) {
      fetchTasks();
      fetchMembers();
    }
  }, [open, fetchTasks, fetchMembers]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  // ── Status change ────────────────────────────────────────────────────────────
  const handleStatusChange = async (e) => {
    if (!canEdit && !canMember) return;
    const s = e.target.value, prev = localStatus;
    setLocalStatus(s);
    try { await activityApi.updateStatus(activity.activityId, s); onRefetchProject?.(); }
    catch { setLocalStatus(prev); }
  };

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
    } catch { }
    finally { setEditSaving(false); }
  };

  // ── Activity member management ───────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!memberSearch) return;
    setMemberError('');
    try {
      await activityApi.addMember(activity.activityId, memberSearch.userId);
      setMemberSearch(null);
      await fetchMembers();
    } catch (err) {
      setMemberError(err?.response?.data?.error || 'Failed to add member.');
    }
  };

  const handleRemoveMember = async (uid) => {
    try { await activityApi.removeMember(activity.activityId, uid); await fetchMembers(); } catch {}
  };

  // ── Add task ─────────────────────────────────────────────────────────────────
  // Assignees selected at task creation → each gets a Pending assignment request.
  const handleAddTask = async () => {
    const errs = {};
    if (!newTaskName.trim()) errs.name = 'Task name required';
    if (!newTaskDue)         errs.due  = 'Due date is required';
    if (Object.keys(errs).length) { setAddErrors(errs); return; }
    try {
      await activityApi.createTask(activity.activityId, {
        name:        newTaskName.trim(),
        priority:    newTaskPrio,
        dueDate:     newTaskDue,
        description: newTaskDesc || null,
        // Send assignment requests to all chosen assignees immediately on creation
        assigneeIds: taskAssignees.map(a => a.userId),
      });
      setNewTaskName(''); setNewTaskDue(''); setNewTaskDesc('');
      setTaskAssignees([]); setTaskAssignSearch(null); setNewTaskDeps([]);
      setPanel(null); setAddErrors({});
      fetchTasks(); onRefetchProject?.();
    } catch { }
  };

  // ── Activity dependencies ────────────────────────────────────────────────────
  const otherActivities = allActivities.filter(a => a.activityId !== activity.activityId);
  const currentDeps = new Set((activity.dependsOn || []).map(Number));

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await activityApi.addDep(activity.activityId, depId); onRefetchPhase?.(); }
    catch (err) { setDepError(err?.response?.data?.error || 'Cannot add — would create a cycle.'); }
  };
  const handleRemoveDep = async (depId) => {
    try { await activityApi.removeDep(activity.activityId, depId); onRefetchPhase?.(); } catch {}
  };

  const isBlocked = activity.status === 'Blocked';

  return (
    <div className="pm-activity">
      {/* ── Header ── */}
      <div className="pm-activity-header" onClick={() => setOpen(v => !v)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, color: 'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <span className="pm-activity-name" style={{ opacity: isBlocked ? 0.5 : 1 }}>
          {activity.name}
        </span>

        {activity.memberCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--mid)', padding: '1px 7px', borderRadius: 8, border: '1px solid var(--divider)', flexShrink: 0 }}>
            {activity.memberCount} {activity.memberCount === 1 ? 'member' : 'members'}
          </span>
        )}

        {activity.ownerName && (
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--mid)', padding: '1px 7px', borderRadius: 8, border: '1px solid var(--divider)', flexShrink: 0 }}>
            {activity.ownerName}
          </span>
        )}

        {(canEdit || canMember) && (
          <span onClick={e => e.stopPropagation()}>
            <ChatButton kind="activity" id={activity.activityId} label="Group Chat" />
          </span>
        )}

        <DueBadge start={activity.plannedStart} end={activity.plannedEnd} status={activity.status} />

        {activity.dependsOn?.length > 0 && (
          <span className="pm-dep-badge" title={`Depends on ${activity.dependsOn.length} activity`}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            {activity.dependsOn.length}
          </span>
        )}
        {activity.isOverdue && <OverdueBadge />}

        <div style={{ minWidth: 140, flexShrink: 0 }}>
          <ProgressBar value={activity.progress || 0} />
        </div>

        {(canEdit || canMember) ? (
          <select value={localStatus} onClick={e => e.stopPropagation()} onChange={handleStatusChange}
            style={{ background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '3px 6px', fontFamily: 'inherit', outline: 'none', flexShrink: 0 }}>
            {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={localStatus} />}

        {canEdit && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {/* Edit dates/desc */}
            <button className={`icon-btn ${panel === 'edit' ? 'active' : ''}`} title="Edit activity"
              onClick={() => togglePanel('edit')} style={{ width: 26, height: 26 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            {/* Members */}
            <button className={`icon-btn ${panel === 'members' ? 'active' : ''}`} title="Activity members"
              onClick={() => { togglePanel('members'); if (panel !== 'members') fetchMembers(); }} style={{ width: 26, height: 26 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </button>
            {/* Dependencies */}
            {otherActivities.length > 0 && (
              <button className={`icon-btn ${panel === 'deps' ? 'active' : ''}`} title="Dependencies"
                onClick={() => togglePanel('deps')} style={{ width: 26, height: 26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Edit activity panel ── */}
      {panel === 'edit' && canEdit && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--divider)', background: '#fafaf8' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Edit Activity</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Start Date *</label>
              <input type="date" value={editStart} onChange={e => { setEditStart(e.target.value); setEditErrors(er => ({ ...er, start: '' })); }}
                style={{ background: '#fff', border: `1px solid ${editErrors.start ? '#aa1010' : 'var(--divider)'}`, borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              {editErrors.start && <span style={{ fontSize: 10, color: '#aa1010' }}>{editErrors.start}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>End Date *</label>
              <input type="date" value={editEnd} min={editStart || undefined} onChange={e => { setEditEnd(e.target.value); setEditErrors(er => ({ ...er, end: '' })); }}
                style={{ background: '#fff', border: `1px solid ${editErrors.end ? '#aa1010' : 'var(--divider)'}`, borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              {editErrors.end && <span style={{ fontSize: 10, color: '#aa1010' }}>{editErrors.end}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Owner (search users)</label>
              <UserSearchInput selectedUser={editOwner} onSelect={setEditOwner}
                placeholder={activity.ownerName ? `Current: ${activity.ownerName}` : 'Search to assign owner…'} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Description</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
              placeholder="Describe the activity's goal…" rows={2}
              style={{ width: '100%', background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pm-btn pm-btn-primary" style={{ fontSize: 11, padding: '6px 16px' }} onClick={handleEditSave} disabled={editSaving}>{editSaving ? '…' : 'Save'}</button>
            <button className="pm-btn pm-btn-ghost"   style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { setPanel(null); setEditErrors({}); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Activity Members panel ── */}
      {panel === 'members' && canEdit && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--divider)', background: '#fafaf8' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
            Activity Members
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
            These users can be assigned to tasks within this activity. Task assignees are automatically added here on acceptance.
          </div>

          {/* Quick-pick from project members */}
          {projectMembers.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 5 }}>Add from project members</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {projectMembers
                  .filter(pm => !actMembers.find(am => String(am.userId) === String(pm.userId)))
                  .map(pm => (
                    <button key={pm.userId} className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={async () => {
                        try { await activityApi.addMember(activity.activityId, pm.userId); await fetchMembers(); } catch {}
                      }}>
                      + {pm.name || pm.email}
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          {/* Search users outside project */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <UserSearchInput selectedUser={memberSearch} onSelect={setMemberSearch}
              excludeUserIds={actMembers.map(m => m.userId)}
              placeholder="Search users to add…" />
            <button className="pm-btn pm-btn-primary" style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
              onClick={handleAddMember} disabled={!memberSearch}>
              Add
            </button>
          </div>
          {memberError && <div style={{ color: '#aa1010', fontSize: 11, marginBottom: 8 }}>{memberError}</div>}

          {/* Current members */}
          {memberLoading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>}
          {!memberLoading && actMembers.map(m => (
            <div key={m.userId} className="pm-member-row selected" style={{ marginBottom: 4 }}>
              <div className="pm-avatar" style={{ flexShrink: 0 }}>{initials(m.name)}</div>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--light)' }}>{m.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email}</span>
              <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: '#aa1010', borderColor: 'rgba(170,16,16,.3)' }}
                onClick={() => handleRemoveMember(m.userId)}>Remove</button>
            </div>
          ))}
          {!memberLoading && actMembers.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No members yet.</div>
          )}
        </div>
      )}

      {/* ── Dependency panel ── */}
      {panel === 'deps' && canEdit && (
        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--divider)', background: '#fafaf8' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Activity Dependencies</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            This activity is <strong>Blocked</strong> until all selected predecessor activities are Completed.
            Circular dependencies are automatically prevented.
          </div>
          {otherActivities.map(a => {
            const isSel = currentDeps.has(a.activityId);
            return (
              <div key={a.activityId} className={`pm-member-row ${isSel ? 'selected' : ''}`} style={{ marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--light)' }}>{a.name}</span>
                <StatusBadge status={a.status} />
                {isSel ? (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: '#aa1010', borderColor: 'rgba(170,16,16,.3)' }}
                    onClick={() => handleRemoveDep(a.activityId)}>Remove</button>
                ) : (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => handleAddDep(a.activityId)}>+ Add</button>
                )}
              </div>
            );
          })}
          {depError && <div style={{ color: '#aa1010', fontSize: 11, marginTop: 4 }}>{depError}</div>}
        </div>
      )}

      {/* ── Body: tasks + add task ── */}
      {open && (
        <div className="pm-activity-body">
          {activity.description && panel !== 'edit' && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0', lineHeight: 1.5 }}>{activity.description}</p>
          )}

          {isBlocked && (
            <div style={{ background: '#fff4e0', border: '1px solid #f0c419', borderRadius: 'var(--radius)', padding: '6px 12px', marginBottom: 10, fontSize: 11, color: '#7a5c00' }}>
              🔒 This activity is blocked. Resolve its dependencies before adding or updating tasks.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 6px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Tasks ({tasks.length})
            </span>
            {canEdit && !isBlocked && (
              <button className="pm-btn pm-btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => togglePanel('addtask')}>
                + Add Task
              </button>
            )}
          </div>

          {/* ── Add task form ── */}
          {panel === 'addtask' && canEdit && (
            <div style={{ background: '#fafaf8', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>New Task</div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Task Name *</label>
                <input value={newTaskName} onChange={e => { setNewTaskName(e.target.value); setAddErrors(er => ({ ...er, name: '' })); }}
                  placeholder="What needs to be done?" autoFocus
                  style={{ width: '100%', background: '#fff', border: `1px solid ${addErrors.name ? '#aa1010' : 'var(--divider)'}`, borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()} />
                {addErrors.name && <span style={{ fontSize: 10, color: '#aa1010' }}>{addErrors.name}</span>}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Due Date *</label>
                  <input type="date" value={newTaskDue} onChange={e => { setNewTaskDue(e.target.value); setAddErrors(er => ({ ...er, due: '' })); }}
                    style={{ background: '#fff', border: `1px solid ${addErrors.due ? '#aa1010' : 'var(--divider)'}`, borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                  {addErrors.due && <span style={{ fontSize: 10, color: '#aa1010' }}>{addErrors.due}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Priority</label>
                  <select value={newTaskPrio} onChange={e => setNewTaskPrio(e.target.value)}
                    style={{ background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}>
                    {PRIORITY_OPTS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Assignee picker — quick-pick from activity members + search */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                  Assign To (optional — sends assignment request)
                </label>

                {/* Quick-pick chips from activity members */}
                {actMembers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                    {actMembers.map(m => {
                      const already = taskAssignees.some(a => String(a.userId) === String(m.userId));
                      return (
                        <button key={m.userId} type="button"
                          className={`pm-btn ${already ? 'pm-btn-primary' : 'pm-btn-ghost'}`}
                          style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => {
                            if (already) setTaskAssignees(prev => prev.filter(a => String(a.userId) !== String(m.userId)));
                            else setTaskAssignees(prev => [...prev, { userId: m.userId, name: m.name }]);
                          }}>
                          {already ? '✓ ' : ''}{m.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Also allow searching outside activity members */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <UserSearchInput selectedUser={taskAssignSearch} onSelect={setTaskAssignSearch}
                    excludeUserIds={taskAssignees.map(a => a.userId)}
                    placeholder="Search users outside activity…" />
                  <button type="button" className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '6px 10px', flexShrink: 0 }}
                    onClick={() => {
                      if (!taskAssignSearch) return;
                      setTaskAssignees(prev => [...prev, { userId: taskAssignSearch.userId, name: taskAssignSearch.name || taskAssignSearch.email }]);
                      setTaskAssignSearch(null);
                    }} disabled={!taskAssignSearch}>
                    + Add
                  </button>
                </div>

                {/* Show selected assignees */}
                {taskAssignees.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                    {taskAssignees.map(a => (
                      <span key={a.userId} style={{ fontSize: 11, background: 'var(--mid)', border: '1px solid var(--divider)', borderRadius: 12, padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {a.name}
                        <button type="button" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                          onClick={() => setTaskAssignees(prev => prev.filter(x => String(x.userId) !== String(a.userId)))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Notes (optional)</label>
                <textarea value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder="Any context or acceptance criteria…" rows={2}
                  style={{ width: '100%', background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button className="pm-btn pm-btn-primary" style={{ fontSize: 11, padding: '6px 16px' }} onClick={handleAddTask}>Add Task</button>
                <button className="pm-btn pm-btn-ghost"   style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => { setPanel(null); setAddErrors({}); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Task list ── */}
          <div className="pm-task-list">
            {loadingTasks && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '8px 0' }}>Loading…</div>}
            {!loadingTasks && tasks.map(t => (
              <TaskItem
                key={t.taskId}
                task={t}
                myRole={myRole}
                myUserId={myUserId}
                allTasks={tasks}
                activityMembers={actMembers}
                onRefetch={fetchTasks}
                onRefetchProject={onRefetchProject}
              />
            ))}
            {!loadingTasks && !tasks.length && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No tasks yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}