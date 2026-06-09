import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import ActivityRow from './ActivityRow';
import { phaseApi, projectApi } from '../api/projectApi';

const PHASE_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];

export default function PhasePanel({ phase, myRole, projectId, allPhases = [], onReorder, onRefetchProject }) {
  const [open,       setOpen]       = useState(false);
  const [activities, setActivities] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [showAdd,    setShowAdd]    = useState(false);
  const [newActName, setNewActName] = useState('');
  const [localStatus, setLocalStatus] = useState(phase.status);
  const [showDeps,   setShowDeps]   = useState(false);
  const [depError,   setDepError]   = useState('');

  const canEdit = myRole === 'Manager';

  // Sync local status when phase prop changes (e.g. after socket update)
  useEffect(() => { setLocalStatus(phase.status); }, [phase.status]);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try { setActivities(await phaseApi.getActivities(phase.phaseId)); }
    catch { /**/ }
    finally { setLoading(false); }
  }, [phase.phaseId]);

  useEffect(() => { if (open) fetchActivities(); }, [open, fetchActivities]);

  // ── Status change — update local immediately, then refetch project for progress
  const handleStatusChange = async (e) => {
    if (!canEdit) return;
    const newStatus = e.target.value;
    setLocalStatus(newStatus);
    try {
      await phaseApi.updateStatus(phase.phaseId, newStatus);
      onRefetchProject?.();   // recompute project progress
    } catch {
      setLocalStatus(phase.status); // rollback on error
    }
  };

  const handleAddActivity = async () => {
    if (!newActName.trim()) return;
    try {
      await phaseApi.createActivity(phase.phaseId, { name: newActName.trim() });
      setNewActName(''); setShowAdd(false);
      fetchActivities();
    } catch { /**/ }
  };

  // ── Dependencies
  const otherPhases = allPhases.filter(p => p.phaseId !== phase.phaseId);
  const currentDeps = new Set((phase.dependsOn || []).map(Number));

  const handleAddDep = async (dependsOnId) => {
    setDepError('');
    try {
      await phaseApi.addDep(phase.phaseId, dependsOnId);
      onRefetchProject?.();
    } catch (err) {
      setDepError(err?.response?.data?.error || 'Failed to add dependency');
    }
  };

  const handleRemoveDep = async (dependsOnId) => {
    try {
      await phaseApi.removeDep(phase.phaseId, dependsOnId);
      onRefetchProject?.();
    } catch { /**/ }
  };

  return (
    <div className="pm-phase">
      <div className="pm-phase-header" onClick={() => setOpen(v => !v)}>
        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, color: 'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <span className="pm-phase-name">{phase.name}</span>

        {/* Dep badge */}
        {phase.dependsOn?.length > 0 && (
          <span className="pm-dep-badge" title={`Depends on ${phase.dependsOn.length} phase(s)`}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
            {phase.dependsOn.length} dep
          </span>
        )}

        {phase.isOverdue && <OverdueBadge />}

        {/* Reorder buttons */}
        {canEdit && onReorder && (
          <div style={{ display: 'flex', gap: 2, marginLeft: 4 }} onClick={e => e.stopPropagation()}>
            <button className="icon-btn" title="Move up"
              onClick={() => onReorder(phase.phaseId, 'up')}
              style={{ width: 22, height: 22 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            <button className="icon-btn" title="Move down"
              onClick={() => onReorder(phase.phaseId, 'down')}
              style={{ width: 22, height: 22 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, marginLeft: 'auto' }}>
          <ProgressBar value={phase.progress || 0} />
        </div>

        {canEdit ? (
          <select
            value={localStatus}
            onClick={e => e.stopPropagation()}
            onChange={handleStatusChange}
            style={{ background: 'var(--bg)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '4px 8px' }}>
            {PHASE_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={localStatus} />}

        {/* Dep toggle button */}
        {canEdit && (
          <button className="icon-btn" title="Manage dependencies"
            onClick={e => { e.stopPropagation(); setShowDeps(v => !v); }}
            style={{ width: 26, height: 26, flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dependency panel */}
      {showDeps && canEdit && (
        <div style={{
          padding: '10px 18px 12px',
          borderTop: '1px solid var(--divider)',
          background: 'rgba(201,169,110,0.04)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
            Phase Dependencies
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            This phase will be <strong style={{ color: 'var(--light)' }}>Blocked</strong> until all selected phases are Completed.
          </div>
          {otherPhases.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No other phases in this project.</div>
          )}
          {otherPhases.map(p => {
            const isSelected = currentDeps.has(p.phaseId);
            return (
              <div key={p.phaseId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', marginBottom: 4,
                background: isSelected ? 'rgba(201,169,110,0.1)' : 'var(--charcoal)',
                border: `1px solid ${isSelected ? 'var(--gold-dim)' : 'var(--divider)'}`,
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--light)' }}>{p.name}</span>
                <StatusBadge status={p.status} />
                {isSelected ? (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => handleRemoveDep(p.phaseId)}>
                    Remove
                  </button>
                ) : (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => handleAddDep(p.phaseId)}>
                    + Add
                  </button>
                )}
              </div>
            );
          })}
          {depError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{depError}</div>}
        </div>
      )}

      {open && (
        <div className="pm-phase-body" style={{ paddingTop: 12 }}>
          {phase.description && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>{phase.description}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Activities ({activities.length})
            </span>
            {canEdit && (
              <button className="pm-btn pm-btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }}
                onClick={() => setShowAdd(v => !v)}>
                + Add Activity
              </button>
            )}
          </div>

          {showAdd && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input value={newActName} onChange={e => setNewActName(e.target.value)}
                placeholder="Activity name…" autoFocus
                style={{ flex: 1, background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)', fontSize: 12 }}
                onKeyDown={e => e.key === 'Enter' && handleAddActivity()} />
              <button className="pm-btn pm-btn-primary" style={{ padding: '7px 14px' }} onClick={handleAddActivity}>Add</button>
              <button className="pm-btn pm-btn-ghost"   style={{ padding: '7px 10px' }} onClick={() => setShowAdd(false)}>✕</button>
            </div>
          )}

          {loading && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</div>}
          {!loading && activities.map(act => (
            <ActivityRow
              key={act.activityId}
              activity={act}
              myRole={myRole}
              phaseId={phase.phaseId}
              allActivities={activities}
              onRefetchPhase={fetchActivities}
              onRefetchProject={onRefetchProject}
            />
          ))}
          {!loading && !activities.length && (
            <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No activities yet.</div>
          )}
        </div>
      )}
    </div>
  );
}