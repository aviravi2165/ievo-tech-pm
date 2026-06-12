import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import TaskItem from './TaskItem';
import { activityApi } from '../api/projectApi';

const ACTIVITY_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];

export default function ActivityRow({ activity, myRole, phaseId, allActivities = [], onRefetchPhase, onRefetchProject }) {
  const [open,         setOpen]         = useState(false);
  const [tasks,        setTasks]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [showAddTask,  setShowAddTask]  = useState(false);
  const [newTaskName,  setNewTaskName]  = useState('');
  const [newTaskPrio,  setNewTaskPrio]  = useState('Medium');
  const [localStatus,  setLocalStatus]  = useState(activity.status);
  const [showDeps,     setShowDeps]     = useState(false);
  const [depError,     setDepError]     = useState('');

  const canEdit = myRole === 'Manager';

  useEffect(() => { setLocalStatus(activity.status); }, [activity.status]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try { setTasks(await activityApi.getTasks(activity.activityId)); }
    catch { /**/ }
    finally { setLoading(false); }
  }, [activity.activityId]);

  useEffect(() => { if (open) fetchTasks(); }, [open, fetchTasks]);

  const handleStatusChange = async (e) => {
    if (!canEdit) return;
    const newStatus = e.target.value;
    setLocalStatus(newStatus);
    try {
      await activityApi.updateStatus(activity.activityId, newStatus);
      onRefetchProject?.();
    } catch {
      setLocalStatus(activity.status);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    try {
      await activityApi.createTask(activity.activityId, { name: newTaskName.trim(), priority: newTaskPrio });
      setNewTaskName(''); setShowAddTask(false);
      fetchTasks();
      onRefetchProject?.(); // update progress
    } catch { /**/ }
  };

  // ── Dependencies
  const otherActivities = allActivities.filter(a => a.activityId !== activity.activityId);
  const currentDeps = new Set((activity.dependsOn || []).map(Number));

  const handleAddDep = async (dependsOnId) => {
    setDepError('');
    try {
      await activityApi.addDep(activity.activityId, dependsOnId);
      onRefetchPhase?.();
    } catch (err) {
      setDepError(err?.response?.data?.error || 'Failed to add dependency');
    }
  };

  const handleRemoveDep = async (dependsOnId) => {
    try {
      await activityApi.removeDep(activity.activityId, dependsOnId);
      onRefetchPhase?.();
    } catch { /**/ }
  };

  return (
    <div className="pm-activity">
      <div className="pm-activity-header" onClick={() => setOpen(v => !v)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, color: 'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <span className="pm-activity-name">{activity.name}</span>

        {activity.dependsOn?.length > 0 && (
          <span className="pm-dep-badge" title={`Depends on ${activity.dependsOn.length} activity`}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
            {activity.dependsOn.length} dep
          </span>
        )}

        {activity.isOverdue && <OverdueBadge />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
          <ProgressBar value={activity.progress || 0} />
        </div>

        {canEdit ? (
          <select value={localStatus} onClick={e => e.stopPropagation()} onChange={handleStatusChange}
            style={{ background: 'var(--bg)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '3px 6px' }}>
            {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={localStatus} />}

        {canEdit && otherActivities.length > 0 && (
          <button className="icon-btn" title="Manage dependencies"
            onClick={e => { e.stopPropagation(); setShowDeps(v => !v); }}
            style={{ width: 24, height: 24, flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        )}
      </div>

      {/* Activity dependency panel */}
      {showDeps && canEdit && (
        <div style={{
          padding: '8px 14px 10px',
          borderTop: '1px solid var(--divider)',
          background: 'rgba(201,169,110,0.03)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
            Activity Dependencies
          </div>
          {otherActivities.map(a => {
            const isSelected = currentDeps.has(a.activityId);
            return (
              <div key={a.activityId} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', marginBottom: 3,
                background: isSelected ? 'rgba(201,169,110,0.1)' : 'var(--bg)',
                border: `1px solid ${isSelected ? 'var(--gold-dim)' : 'var(--divider)'}`,
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--light)' }}>{a.name}</span>
                <StatusBadge status={a.status} />
                {isSelected ? (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => handleRemoveDep(a.activityId)}>Remove</button>
                ) : (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
                    onClick={() => handleAddDep(a.activityId)}>+ Dep</button>
                )}
              </div>
            );
          })}
          {depError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{depError}</div>}
        </div>
      )}

      {open && (
        <div className="pm-activity-body">
          {activity.description && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0', lineHeight: 1.5 }}>{activity.description}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 6px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Tasks ({tasks.length})
            </span>
            {canEdit && (
              <button className="pm-btn pm-btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setShowAddTask(v => !v)}>
                + Add Task
              </button>
            )}
          </div>

          {showAddTask && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <input value={newTaskName} onChange={e => setNewTaskName(e.target.value)}
                placeholder="Task name…" autoFocus
                style={{ flex: 1, minWidth: 120, background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--light)', fontSize: 12 }}
                onKeyDown={e => e.key === 'Enter' && handleAddTask()} />
              <select value={newTaskPrio} onChange={e => setNewTaskPrio(e.target.value)}
                style={{ background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 12, padding: '6px 8px' }}>
                {['Low', 'Medium', 'High', 'Critical'].map(p => <option key={p}>{p}</option>)}
              </select>
              <button className="pm-btn pm-btn-primary" style={{ padding: '6px 12px' }} onClick={handleAddTask}>Add</button>
              <button className="pm-btn pm-btn-ghost"   style={{ padding: '6px 10px' }} onClick={() => setShowAddTask(false)}>✕</button>
            </div>
          )}

          {/* Task list — scrollable */}
          <div className="pm-task-list">
            {loading && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '8px 0' }}>Loading tasks…</div>}
            {!loading && tasks.map(t => (
              <TaskItem
                key={t.taskId}
                task={t}
                myRole={myRole}
                allTasks={tasks}
                onRefetch={fetchTasks}
                onRefetchProject={onRefetchProject}
              />
            ))}
            {!loading && !tasks.length && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No tasks yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}