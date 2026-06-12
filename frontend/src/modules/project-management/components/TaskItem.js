import { useState } from 'react';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import OverdueBadge from './OverdueBadge';
import { taskApi } from '../api/projectApi';

const STATUS_OPTIONS = ['To Do','In Progress','In Review','Done','Blocked'];

function Assignees({ assignees = [] }) {
  if (!assignees.length) return null;
  const initials = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div className="pm-assignees">
      {assignees.slice(0,4).map(a => (
        <div key={a.userId} className="pm-avatar" title={a.name}>{initials(a.name||'?')}</div>
      ))}
      {assignees.length > 4 && <div className="pm-avatar">+{assignees.length-4}</div>}
    </div>
  );
}

/**
 * TaskItem
 *
 * Bug fixes:
 * 1. Optimistic local status — select reflects immediately, no flicker
 * 2. onRefetchProject called after status change so progress bars update
 * 3. Rollback local status if API call fails
 */
export default function TaskItem({ task, myRole, onRefetch, onRefetchProject }) {
  const [editing,     setEditing]     = useState(false);
  const [editName,    setEditName]    = useState(task.name);
  const [saving,      setSaving]      = useState(false);
  const [localStatus, setLocalStatus] = useState(task.status);

  const canEdit   = myRole === 'Manager';
  const canStatus = myRole === 'Manager' || myRole === 'Member';

  const handleStatusChange = async (e) => {
    if (!canStatus) return;
    const newStatus = e.target.value;
    setLocalStatus(newStatus); // optimistic update
    try {
      await taskApi.updateStatus(task.taskId, newStatus);
      // Refetch task list AND project progress
      onRefetch?.();
      onRefetchProject?.();
    } catch {
      setLocalStatus(task.status); // rollback on error
    }
  };

  // Sync local status if parent refetches with new data
  // (task prop changes after onRefetch resolves)
  if (localStatus !== task.status && !canStatus) {
    setLocalStatus(task.status);
  }

  const handleEditSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await taskApi.update(task.taskId, { name: editName });
      onRefetch?.();
      setEditing(false);
    } catch { /**/ }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete task "${task.name}"?`)) return;
    try {
      await taskApi.delete(task.taskId);
      onRefetch?.();
      onRefetchProject?.();
    } catch { /**/ }
  };

  return (
    <div className="pm-task">
      <div className="pm-task-info">
        {editing ? (
          <div style={{ display:'flex', gap:6, marginBottom:4 }}>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              style={{ flex:1, background:'var(--charcoal)', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'4px 8px', color:'var(--light)', fontSize:13 }}
              onKeyDown={e => e.key==='Enter' && handleEditSave()}
              autoFocus
            />
            <button className="pm-btn pm-btn-primary" style={{padding:'4px 10px'}} onClick={handleEditSave} disabled={saving}>✓</button>
            <button className="pm-btn pm-btn-ghost"   style={{padding:'4px 10px'}} onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <div
            className="pm-task-name"
            style={{
              textDecoration: localStatus === 'Done' ? 'line-through' : 'none',
              opacity:        localStatus === 'Done' ? .5 : 1,
            }}
          >
            {task.name}
          </div>
        )}

        <div className="pm-task-meta">
          <PriorityBadge priority={task.priority} />
          {task.isOverdue && localStatus !== 'Done' && <OverdueBadge />}
          {task.dueDate && (
            <span>Due {new Date(task.dueDate).toLocaleDateString([], { day:'numeric', month:'short' })}</span>
          )}
          {task.estimatedHours && <span>{task.estimatedHours}h est.</span>}
          <Assignees assignees={task.assignees} />
          {task.dependsOn?.length > 0 && (
            <span className="pm-dep-badge">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
              {task.dependsOn.length} dep
            </span>
          )}
        </div>
      </div>

      <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
        {canStatus ? (
          <select
            value={localStatus}
            onChange={handleStatusChange}
            style={{
              background:'var(--charcoal)', border:'1px solid var(--divider)',
              borderRadius:'var(--radius)', color:'var(--light)', fontSize:11, padding:'3px 6px',
            }}
          >
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : (
          <StatusBadge status={localStatus} />
        )}

        {canEdit && (
          <>
            <button className="icon-btn" onClick={() => setEditing(true)} title="Edit name">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button className="icon-btn danger" onClick={handleDelete} title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}