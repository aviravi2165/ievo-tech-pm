import { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import OverdueBadge from './OverdueBadge';
import UserSearchInput from './UserSearchInput';
import ChatButton from './ChatButton';
import { taskApi } from '../api/projectApi';

// Statuses: To Do / Ongoing / Complete / Blocked (renamed from In Progress / Done)
const STATUS_OPTIONS = ['To Do', 'Ongoing', 'Complete', 'Blocked'];

// Badge shown per request status alongside an assignee's name
const REQUEST_BADGE = {
  Pending:  { color: '#a85f00', bg: '#fff3dc', label: 'Pending'  },
  Accepted: { color: '#1a6e36', bg: '#e8faf0', label: 'Accepted' },
  Declined: { color: '#7b1d1d', bg: '#fdecea', label: 'Declined' },
};

function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

function DueDateBadge({ dueDate, status }) {
  if (!dueDate || status === 'Complete') return null;
  const dt   = parseLocalDate(dueDate);
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - now) / 86400000);
  if (diff < 0)  return <span className="pm-late-tag">⚠ {Math.abs(diff)}d late</span>;
  if (diff <= 2) return <span className="pm-due-soon">Due {diff === 0 ? 'today' : `in ${diff}d`}</span>;
  return <span style={{ fontSize: 11, color: 'var(--muted)' }}>Due {fmtDate(dueDate)}</span>;
}

function Avatars({ assignees = [] }) {
  if (!assignees.length) return <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Unassigned</span>;
  return (
    <div className="pm-assignees">
      {assignees.slice(0, 4).map(a => (
        <div key={a.userId} className="pm-avatar" title={`${a.name} (${a.requestStatus || 'Accepted'})`}>
          {initials(a.name)}
        </div>
      ))}
      {assignees.length > 4 && <div className="pm-avatar">+{assignees.length - 4}</div>}
    </div>
  );
}

/**
 * TaskItem — aligned with the new assignment-request flow.
 *
 * Assignment is now via requests (Pending → Accepted / Declined) not direct inserts.
 * allRequests  — every request for this task (including Pending and Declined) for the manager's view
 * assignees    — only Accepted requests (rendered as confirmed participants)
 * activityMembers — members of the parent activity; task assignees are picked from this list
 *                   (or a new user can be selected, which auto-adds them to the activity on accept)
 */
export default function TaskItem({ task, myRole, myUserId, allTasks = [], activityMembers = [], onRefetch, onRefetchProject }) {
  // Check if current user has an accepted request for this task
  const isAssigned = (task.assignees || []).some(a => String(a.userId) === String(myUserId));
  const canManager = myRole === 'Manager';
  const canMember  = myRole === 'Member' && isAssigned;
  const canEdit    = canManager || canMember;
  const canStatus  = canEdit || (myRole === 'Member' && isAssigned);

  const [localStatus,  setLocalStatus]  = useState(task.status);
  const [panel,        setPanel]        = useState(null); // 'assign'|'deps'|'date'|'desc'|null
  const [editName,     setEditName]     = useState(task.name);
  const [editingName,  setEditingName]  = useState(false);
  const [editDue,      setEditDue]      = useState(toInput(task.dueDate));
  const [editDesc,     setEditDesc]     = useState(task.description || '');
  const [depError,     setDepError]     = useState('');
  const [assignSearch, setAssignSearch] = useState(null);
  const [assignError,  setAssignError]  = useState('');

  useEffect(() => { setLocalStatus(task.status); }, [task.status]);
  useEffect(() => { setEditDue(toInput(task.dueDate)); }, [task.dueDate]);
  useEffect(() => { setEditDesc(task.description || ''); }, [task.description]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  // ── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = async (e) => {
    const s = e.target.value;
    const prev = localStatus;
    setLocalStatus(s);
    try {
      await taskApi.updateStatus(task.taskId, s);
      onRefetch?.(); onRefetchProject?.();
    } catch { setLocalStatus(prev); }
  };

  // ── Name edit ──────────────────────────────────────────────────────────────
  const handleNameSave = async () => {
    if (!editName.trim()) return;
    try { await taskApi.update(task.taskId, { name: editName }); onRefetch?.(); setEditingName(false); } catch {}
  };

  // ── Due date save ──────────────────────────────────────────────────────────
  const handleDueSave = async () => {
    if (!editDue) return;
    try { await taskApi.update(task.taskId, { dueDate: editDue }); onRefetch?.(); setPanel(null); } catch {}
  };

  // ── Description save ───────────────────────────────────────────────────────
  const handleDescSave = async () => {
    try { await taskApi.update(task.taskId, { description: editDesc }); onRefetch?.(); setPanel(null); } catch {}
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(`Delete task "${task.name}"?`)) return;
    try { await taskApi.delete(task.taskId); onRefetch?.(); onRefetchProject?.(); } catch {}
  };

  // ── Assignment requests ────────────────────────────────────────────────────
  // allRequests includes Pending, Accepted, Declined — so the manager can see
  // who declined and re-assign. assignees (Accepted only) are the confirmed participants.
  const allRequests = task.allRequests || [];
  const requestedIds = new Set(allRequests.map(r => String(r.userId)));

  // Activity member IDs for filtering the search to only show activity members
  const activityMemberIds = new Set(activityMembers.map(m => String(m.userId)));

  const handleSendRequest = async () => {
    if (!assignSearch) return;
    setAssignError('');
    try {
      await taskApi.sendRequest(task.taskId, assignSearch.userId);
      setAssignSearch(null);
      onRefetch?.();
    } catch (err) {
      setAssignError(err?.response?.data?.error || 'Failed to send request.');
    }
  };

  const handleRemoveRequest = async (uid) => {
    try { await taskApi.removeRequest(task.taskId, uid); onRefetch?.(); } catch {}
  };

  // ── Dependencies ───────────────────────────────────────────────────────────
  const currentDeps = new Set((task.dependsOn || []).map(Number));
  const otherTasks  = allTasks.filter(t => t.taskId !== task.taskId);

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await taskApi.addDep(task.taskId, depId); onRefetch?.(); }
    catch (err) { setDepError(err?.response?.data?.error || 'Cannot add dependency — would create a deadlock or cycle.'); }
  };
  const handleRemoveDep = async (depId) => {
    try { await taskApi.removeDep(task.taskId, depId); onRefetch?.(); } catch {}
  };

  return (
    <div className="pm-task">
      {/* ── Main row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Task name */}
          {editingName ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                autoFocus
                style={{ flex: 1, background: '#fff', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: '4px 8px', color: 'var(--light)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setEditingName(false); setEditName(task.name); } }} />
              <button className="pm-btn pm-btn-primary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={handleNameSave}>✓</button>
              <button className="pm-btn pm-btn-ghost"   style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => { setEditingName(false); setEditName(task.name); }}>✕</button>
            </div>
          ) : (
            <div className="pm-task-name" style={{ textDecoration: localStatus === 'Complete' ? 'line-through' : 'none', opacity: localStatus === 'Complete' ? 0.5 : 1 }}>
              {task.name}
            </div>
          )}

          {/* Meta row */}
          <div className="pm-task-meta">
            <PriorityBadge priority={task.priority} />
            <DueDateBadge dueDate={task.dueDate} status={localStatus} />
            {task.isOverdue && localStatus !== 'Complete' && <OverdueBadge />}
            {task.estimatedHours && <span>{task.estimatedHours}h est.</span>}
            <Avatars assignees={task.assignees} />
            {(canEdit || isAssigned) && <ChatButton kind="task" id={task.taskId} />}
            {task.dependsOn?.length > 0 && (
              <span className="pm-dep-badge">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                {task.dependsOn.length} dep
              </span>
            )}
            {task.description && (
              <span style={{ fontSize: 10, color: 'var(--muted)', border: '1px solid var(--divider)', borderRadius: 8, padding: '0 6px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={task.description}>
                {task.description.length > 28 ? `${task.description.slice(0, 28)}…` : task.description}
              </span>
            )}
          </div>

          {task.description && panel !== 'desc' && (
            <div style={{ marginTop: 5, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, borderLeft: '2px solid var(--divider)', paddingLeft: 8 }}>
              {task.description}
            </div>
          )}
        </div>

        {/* Action area */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canStatus ? (
            <select value={localStatus} onChange={handleStatusChange}
              style={{ background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '3px 6px', fontFamily: 'inherit', outline: 'none' }}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          ) : <StatusBadge status={localStatus} />}

          {canEdit && (
            <>
              <button className={`icon-btn ${panel === 'desc' ? 'active' : ''}`} title="Description" onClick={() => togglePanel('desc')} style={{ width: 26, height: 26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </button>
              <button className={`icon-btn ${panel === 'date' ? 'active' : ''}`} title="Due date" onClick={() => togglePanel('date')} style={{ width: 26, height: 26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </button>
            </>
          )}
          {canManager && (
            <>
              <button className={`icon-btn ${panel === 'assign' ? 'active' : ''}`} title="Assign" onClick={() => togglePanel('assign')} style={{ width: 26, height: 26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
              {otherTasks.length > 0 && (
                <button
                  className={`pm-btn pm-btn-ghost ${panel === 'deps' ? 'active' : ''}`}
                  title="Add or remove task dependencies"
                  onClick={() => togglePanel('deps')}
                  style={{ fontSize: 10, padding: '2px 8px', color: panel === 'deps' ? 'var(--gold)' : 'var(--muted)', borderColor: panel === 'deps' ? 'var(--gold)' : undefined }}>
                  ⟶ Dep
                </button>
              )}
              <button className="icon-btn" title="Rename" onClick={() => setEditingName(true)} style={{ width: 26, height: 26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button className="icon-btn danger" title="Delete" onClick={handleDelete} style={{ width: 26, height: 26 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Description panel ── */}
      {panel === 'desc' && canEdit && (
        <div className="pm-sub-panel" style={{ marginTop: 8 }}>
          <div className="pm-sub-panel-title">Task Notes / Description</div>
          <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
            placeholder="Add context, acceptance criteria, links, notes…" rows={4}
            style={{ width: '100%', background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '8px 10px', color: 'var(--light)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="pm-btn pm-btn-primary" style={{ fontSize: 11, padding: '5px 14px' }} onClick={handleDescSave}>Save</button>
            <button className="pm-btn pm-btn-ghost"   style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setPanel(null); setEditDesc(task.description || ''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Due date panel ── */}
      {panel === 'date' && canEdit && (
        <div className="pm-sub-panel" style={{ marginTop: 8 }}>
          <div className="pm-sub-panel-title">Due Date <span style={{ color: '#aa1010' }}>*</span></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
              style={{ background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '6px 10px', color: 'var(--light)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <button className="pm-btn pm-btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={handleDueSave} disabled={!editDue}>Save</button>
            <button className="pm-btn pm-btn-ghost"   style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setPanel(null)}>Cancel</button>
          </div>
          {!editDue && <div style={{ color: '#aa1010', fontSize: 11, marginTop: 4 }}>Due date is required.</div>}
        </div>
      )}

      {/* ── Assignee / request panel ── */}
      {panel === 'assign' && canManager && (
        <div className="pm-sub-panel" style={{ marginTop: 8 }}>
          <div className="pm-sub-panel-title">Task Assignees</div>
          <div className="pm-sub-panel-hint">
            Select from activity members below, or search any user — they'll be added to the activity automatically when they accept.
          </div>

          {/* Quick-pick from activity members */}
          {activityMembers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {activityMembers
                .filter(m => !requestedIds.has(String(m.userId)))
                .map(m => (
                  <button key={m.userId} className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={async () => {
                      setAssignError('');
                      try { await taskApi.sendRequest(task.taskId, m.userId); onRefetch?.(); }
                      catch (err) { setAssignError(err?.response?.data?.error || 'Failed'); }
                    }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--mid)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--gold)' }}>
                      {initials(m.name)}
                    </span>
                    {m.name}
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>+ Request</span>
                  </button>
                ))
              }
            </div>
          )}

          {/* Search outside activity members */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <UserSearchInput
              selectedUser={assignSearch}
              onSelect={setAssignSearch}
              excludeUserIds={[...requestedIds]}
              placeholder="Search users outside activity…"
            />
            <button className="pm-btn pm-btn-primary" style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
              onClick={handleSendRequest} disabled={!assignSearch}>
              Send Request
            </button>
          </div>
          {assignError && <div style={{ color: '#aa1010', fontSize: 11, marginBottom: 8 }}>{assignError}</div>}

          {/* All requests with status badges */}
          {allRequests.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No assignment requests sent yet.</div>
          )}
          {allRequests.map(r => {
            const badge = REQUEST_BADGE[r.requestStatus] || REQUEST_BADGE.Pending;
            return (
              <div key={r.userId} className="pm-member-row selected" style={{ marginBottom: 4 }}>
                <div className="pm-avatar" style={{ flexShrink: 0 }}>{initials(r.name)}</div>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--light)' }}>{r.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, borderRadius: 8, padding: '2px 8px', flexShrink: 0 }}>
                  {badge.label}
                </span>
                <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: '#aa1010', borderColor: 'rgba(170,16,16,.3)', flexShrink: 0 }}
                  onClick={() => handleRemoveRequest(r.userId)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dependency panel ── */}
      {panel === 'deps' && canManager && (
        <div className="pm-sub-panel" style={{ marginTop: 8 }}>
          <div className="pm-sub-panel-title">Prerequisites — Tasks that must complete first</div>
          <div className="pm-sub-panel-hint">
            This task auto-<strong>Blocks</strong> when a dep is added (if that dep isn't Complete yet).
            It auto-<strong>unblocks</strong> once all predecessors reach Complete — no manual action needed.
          </div>
          {otherTasks.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No other tasks in this activity.</div>
            : otherTasks.map(t => {
              const isSel = currentDeps.has(t.taskId);
              return (
                <div key={t.taskId} className={`pm-member-row ${isSel ? 'selected' : ''}`} style={{ marginBottom: 4 }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--light)' }}>{t.name}</span>
                  <StatusBadge status={t.status} />
                  {isSel ? (
                    <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: '#aa1010', borderColor: 'rgba(170,16,16,.3)' }}
                      onClick={() => handleRemoveDep(t.taskId)}>✕ Remove</button>
                  ) : (
                    <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => handleAddDep(t.taskId)}>＋ Add</button>
                  )}
                </div>
              );
            })
          }
          {task.dependsOn?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--divider)' }}>
              ⟶ Blocked by {task.dependsOn.length} predecessor task{task.dependsOn.length > 1 ? 's' : ''}
            </div>
          )}
          {depError && <div style={{ color: '#aa1010', fontSize: 11, marginTop: 6 }}>{depError}</div>}
        </div>
      )}
    </div>
  );
}