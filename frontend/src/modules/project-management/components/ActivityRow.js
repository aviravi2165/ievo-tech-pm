import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import TaskItem from './TaskItem';
import UserSearchInput from './UserSearchInput';
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

function DueBadge({ start, end, status }) {
  if (!end || status === 'Completed') return null;
  const dt  = parseLocalDate(end);
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((dt - now) / 86400000);
  if (diff < 0)  return <span className="pm-late-tag">⚠ {Math.abs(diff)}d late</span>;
  if (diff <= 3) return <span className="pm-due-soon">Ends {diff === 0 ? 'today' : `in ${diff}d`}</span>;
  return (
    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
      {fmtDate(start)} → {fmtDate(end)}
    </span>
  );
}

export default function ActivityRow({ activity, myRole, allActivities = [], projectMembers = [], myUserId, onRefetchPhase, onRefetchProject }) {
  const [open,         setOpen]         = useState(false);
  const [tasks,        setTasks]        = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [panel,        setPanel]        = useState(null); // 'edit'|'deps'|'addtask'
  const [localStatus,  setLocalStatus]  = useState(activity.status);

  // Edit form state
  const [editStart,  setEditStart]  = useState(toInput(activity.plannedStart));
  const [editEnd,    setEditEnd]    = useState(toInput(activity.plannedEnd));
  const [editDesc,   setEditDesc]   = useState(activity.description || '');
  const [editOwner,  setEditOwner]  = useState(null); // UserSearchInput selected user
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  // Add task form
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPrio, setNewTaskPrio] = useState('Medium');
  const [newTaskDue,  setNewTaskDue]  = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [taskAssign,  setTaskAssign]  = useState(null); // optional initial assignee
  const [addErrors,   setAddErrors]   = useState({});

  const [depError, setDepError] = useState('');

  const canEdit = myRole === 'Manager';
  const canMember = myRole === 'Member';

  useEffect(() => { setLocalStatus(activity.status); }, [activity.status]);
  useEffect(() => {
    setEditStart(toInput(activity.plannedStart));
    setEditEnd(toInput(activity.plannedEnd));
    setEditDesc(activity.description || '');
  }, [activity.plannedStart, activity.plannedEnd, activity.description]);

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try { setTasks(await activityApi.getTasks(activity.activityId)); }
    catch { }
    finally { setLoadingTasks(false); }
  }, [activity.activityId]);

  useEffect(() => { if (open) fetchTasks(); }, [open, fetchTasks]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  const handleStatusChange = async (e) => {
    if (!canEdit && !canMember) return;
    const s = e.target.value, prev = localStatus;
    setLocalStatus(s);
    try { await activityApi.updateStatus(activity.activityId, s); onRefetchProject?.(); }
    catch { setLocalStatus(prev); }
  };

  // Edit activity save
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

  // Add task
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
        assigneeId:  taskAssign?.userId || null,
      });
      setNewTaskName(''); setNewTaskDue(''); setNewTaskDesc(''); setTaskAssign(null);
      setPanel(null); setAddErrors({});
      fetchTasks(); onRefetchProject?.();
    } catch { }
  };

  // Deps
  const otherActivities = allActivities.filter(a => a.activityId !== activity.activityId);
  const currentDeps = new Set((activity.dependsOn || []).map(Number));

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await activityApi.addDep(activity.activityId, depId); onRefetchPhase?.(); }
    catch (err) { setDepError(err?.response?.data?.error || 'Failed'); }
  };
  const handleRemoveDep = async (depId) => {
    try { await activityApi.removeDep(activity.activityId, depId); onRefetchPhase?.(); } catch {}
  };

  return (
    <div className="pm-activity">
      {/* ── Header ── */}
      <div className="pm-activity-header" onClick={() => setOpen(v => !v)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open?'rotate(90deg)':'none', transition:'transform 0.15s', flexShrink:0, color:'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <span className="pm-activity-name">{activity.name}</span>

        {activity.ownerName && (
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--mid)', padding: '1px 7px', borderRadius: 8, border: '1px solid var(--divider)', flexShrink: 0 }}>
            {activity.ownerName}
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
            style={{ background:'#fff', border:'1px solid var(--divider)', borderRadius:'var(--radius)', color:'var(--light)', fontSize:11, padding:'3px 6px', fontFamily:'inherit', outline:'none', flexShrink:0 }}>
            {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={localStatus} />}

        {canEdit && (
          <div style={{ display:'flex', gap:3, flexShrink:0 }} onClick={e => e.stopPropagation()}>
            <button className={`icon-btn ${panel==='edit'?'active':''}`} title="Edit dates / owner / description"
              onClick={() => togglePanel('edit')} style={{ width:26, height:26 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            {otherActivities.length > 0 && (
              <button className={`icon-btn ${panel==='deps'?'active':''}`} title="Dependencies"
                onClick={() => togglePanel('deps')} style={{ width:26, height:26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Edit panel ── */}
      {panel === 'edit' && canEdit && (
        <div style={{ padding:'12px 14px', borderTop:'1px solid var(--divider)', background:'#fafaf8' }}>
          <div style={{ fontSize:11, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Edit Activity</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-start', marginBottom:10 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Start Date *</label>
              <input type="date" value={editStart} onChange={e => { setEditStart(e.target.value); setEditErrors(er=>({...er,start:''})); }}
                style={{ background:'#fff', border:`1px solid ${editErrors.start?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
              {editErrors.start && <span style={{ fontSize:10, color:'#aa1010' }}>{editErrors.start}</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>End Date *</label>
              <input type="date" value={editEnd} onChange={e => { setEditEnd(e.target.value); setEditErrors(er=>({...er,end:''})); }}
                min={editStart || undefined}
                style={{ background:'#fff', border:`1px solid ${editErrors.end?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
              {editErrors.end && <span style={{ fontSize:10, color:'#aa1010' }}>{editErrors.end}</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:160 }}>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Owner (search users)</label>
              <UserSearchInput
                selectedUser={editOwner}
                onSelect={setEditOwner}
                placeholder={activity.ownerName ? `Current: ${activity.ownerName}` : 'Search to assign owner…'}
              />
            </div>
          </div>
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Description</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
              placeholder="Describe the activity's goal…"
              rows={2}
              style={{ width:'100%', background:'#fff', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'7px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical' }} />
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button className="pm-btn pm-btn-primary" style={{ fontSize:11, padding:'6px 16px' }} onClick={handleEditSave} disabled={editSaving}>{editSaving?'…':'Save'}</button>
            <button className="pm-btn pm-btn-ghost"   style={{ fontSize:11, padding:'6px 12px' }} onClick={() => { setPanel(null); setEditErrors({}); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Dependency panel ── */}
      {panel === 'deps' && canEdit && (
        <div style={{ padding:'10px 14px 12px', borderTop:'1px solid var(--divider)', background:'#fafaf8' }}>
          <div style={{ fontSize:11, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Activity Dependencies</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>This activity will be <strong>Blocked</strong> until selected activities are Completed.</div>
          {otherActivities.map(a => {
            const isSel = currentDeps.has(a.activityId);
            return (
              <div key={a.activityId} className={`pm-member-row ${isSel?'selected':''}`} style={{ marginBottom:4 }}>
                <span style={{ flex:1, fontSize:12, color:'var(--light)' }}>{a.name}</span>
                <StatusBadge status={a.status} />
                {isSel ? (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize:11, padding:'2px 8px', color:'#aa1010', borderColor:'rgba(170,16,16,.3)' }} onClick={() => handleRemoveDep(a.activityId)}>Remove</button>
                ) : (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize:11, padding:'2px 8px' }} onClick={() => handleAddDep(a.activityId)}>+ Add</button>
                )}
              </div>
            );
          })}
          {depError && <div style={{ color:'#aa1010', fontSize:11, marginTop:4 }}>{depError}</div>}
        </div>
      )}

      {/* ── Body ── */}
      {open && (
        <div className="pm-activity-body">
          {activity.description && panel !== 'edit' && (
            <p style={{ fontSize:12, color:'var(--muted)', margin:'8px 0', lineHeight:1.5 }}>{activity.description}</p>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'8px 0 6px' }}>
            <span style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Tasks ({tasks.length})
            </span>
            {canEdit && (
              <button className="pm-btn pm-btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}
                onClick={() => togglePanel('addtask')}>
                + Add Task
              </button>
            )}
          </div>

          {/* ── Add task form (inline, with all fields) ── */}
          {panel === 'addtask' && canEdit && (
            <div style={{ background:'#fafaf8', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:10 }}>
              <div style={{ fontSize:11, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>New Task</div>
              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Task Name *</label>
                <input value={newTaskName} onChange={e => { setNewTaskName(e.target.value); setAddErrors(er=>({...er,name:''})); }}
                  placeholder="What needs to be done?"
                  autoFocus
                  style={{ width:'100%', background:'#fff', border:`1px solid ${addErrors.name?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'7px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }}
                  onKeyDown={e => e.key==='Enter' && handleAddTask()} />
                {addErrors.name && <span style={{ fontSize:10, color:'#aa1010' }}>{addErrors.name}</span>}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:8 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Due Date *</label>
                  <input type="date" value={newTaskDue} onChange={e => { setNewTaskDue(e.target.value); setAddErrors(er=>({...er,due:''})); }}
                    style={{ background:'#fff', border:`1px solid ${addErrors.due?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
                  {addErrors.due && <span style={{ fontSize:10, color:'#aa1010' }}>{addErrors.due}</span>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Priority</label>
                  <select value={newTaskPrio} onChange={e => setNewTaskPrio(e.target.value)}
                    style={{ background:'#fff', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }}>
                    {PRIORITY_OPTS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ flex:1, minWidth:140, display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Assign To (optional)</label>
                  <UserSearchInput
                    selectedUser={taskAssign}
                    onSelect={setTaskAssign}
                    placeholder="Search to assign…"
                  />
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Notes (optional)</label>
                <textarea value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder="Any context or acceptance criteria…"
                  rows={2}
                  style={{ width:'100%', background:'#fff', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'7px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical' }} />
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="pm-btn pm-btn-primary" style={{ fontSize:11, padding:'6px 16px' }} onClick={handleAddTask}>Add Task</button>
                <button className="pm-btn pm-btn-ghost"   style={{ fontSize:11, padding:'6px 10px' }} onClick={() => { setPanel(null); setAddErrors({}); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="pm-task-list">
            {loadingTasks && <div style={{ color:'var(--muted)', fontSize:12, padding:'8px 0' }}>Loading…</div>}
            {!loadingTasks && tasks.map(t => (
              <TaskItem
                key={t.taskId}
                task={t}
                myRole={myRole}
                myUserId={myUserId}
                allTasks={tasks}
                onRefetch={fetchTasks}
                onRefetchProject={onRefetchProject}
              />
            ))}
            {!loadingTasks && !tasks.length && (
              <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>No tasks yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
