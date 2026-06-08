import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import TaskItem from './TaskItem';
import { activityApi, taskApi } from '../api/projectApi';

const ACTIVITY_STATUSES = ['To Do','In Progress','Completed','Blocked'];

export default function ActivityRow({ activity, myRole, phaseId }) {
  const [open,    setOpen]    = useState(false);
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPrio, setNewTaskPrio] = useState('Medium');

  const canEdit = myRole === 'Manager';

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try { setTasks(await activityApi.getTasks(activity.activityId)); } catch { /**/ }
    finally { setLoading(false); }
  }, [activity.activityId]);

  useEffect(() => { if (open) fetchTasks(); }, [open, fetchTasks]);

  const handleStatusChange = async (e) => {
    if (!canEdit) return;
    try { await activityApi.updateStatus(activity.activityId, e.target.value); } catch { /**/ }
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    try {
      await activityApi.createTask(activity.activityId, { name: newTaskName.trim(), priority: newTaskPrio });
      setNewTaskName(''); setShowAddTask(false);
      fetchTasks();
    } catch { /**/ }
  };

  return (
    <div className="pm-activity">
      <div className="pm-activity-header" onClick={() => setOpen(v => !v)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.15s', flexShrink:0, color:'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="pm-activity-name">{activity.name}</span>
        {activity.isOverdue && <OverdueBadge />}
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:180 }}>
          <ProgressBar value={activity.progress || 0} />
        </div>
        {canEdit ? (
          <select value={activity.status} onClick={e=>e.stopPropagation()} onChange={handleStatusChange}
            style={{ background:'var(--bg)', border:'1px solid var(--divider)', borderRadius:'var(--radius)', color:'var(--light)', fontSize:11, padding:'3px 6px' }}>
            {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={activity.status} />}
      </div>

      {open && (
        <div className="pm-activity-body">
          {activity.description && (
            <p style={{ fontSize:12, color:'var(--muted)', margin:'8px 0', lineHeight:1.5 }}>{activity.description}</p>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'8px 0 6px' }}>
            <span style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Tasks ({tasks.length})
            </span>
            {canEdit && (
              <button className="pm-btn pm-btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}
                onClick={() => setShowAddTask(v=>!v)}>
                + Add Task
              </button>
            )}
          </div>

          {showAddTask && (
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              <input className="pm-field input" value={newTaskName} onChange={e=>setNewTaskName(e.target.value)}
                placeholder="Task name…" autoFocus
                style={{ flex:1, background:'var(--charcoal)', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12 }}
                onKeyDown={e => e.key==='Enter' && handleAddTask()} />
              <select value={newTaskPrio} onChange={e=>setNewTaskPrio(e.target.value)}
                style={{ background:'var(--charcoal)', border:'1px solid var(--divider)', borderRadius:'var(--radius)', color:'var(--light)', fontSize:12, padding:'6px 8px' }}>
                {['Low','Medium','High','Critical'].map(p=><option key={p}>{p}</option>)}
              </select>
              <button className="pm-btn pm-btn-primary" style={{padding:'6px 12px'}} onClick={handleAddTask}>Add</button>
              <button className="pm-btn pm-btn-ghost"   style={{padding:'6px 10px'}} onClick={()=>setShowAddTask(false)}>✕</button>
            </div>
          )}

          {loading && <div style={{ color:'var(--muted)', fontSize:12, padding:'8px 0' }}>Loading tasks…</div>}
          {!loading && tasks.map(t => (
            <TaskItem key={t.taskId} task={t} myRole={myRole} onRefetch={fetchTasks} allTasks={tasks} />
          ))}
          {!loading && !tasks.length && (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>No tasks yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
