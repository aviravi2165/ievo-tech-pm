import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import ActivityRow from './ActivityRow';
import { phaseApi } from '../api/projectApi';

const PHASE_STATUSES = ['To Do','In Progress','Completed','Blocked'];

export default function PhasePanel({ phase, myRole, projectId }) {
  const [open,       setOpen]       = useState(false);
  const [activities, setActivities] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [showAdd,    setShowAdd]    = useState(false);
  const [newActName, setNewActName] = useState('');

  const canEdit = myRole === 'Manager';

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try { setActivities(await phaseApi.getActivities(phase.phaseId)); } catch { /**/ }
    finally { setLoading(false); }
  }, [phase.phaseId]);

  useEffect(() => { if (open) fetchActivities(); }, [open, fetchActivities]);

  const handleStatusChange = async (e) => {
    if (!canEdit) return;
    try { await phaseApi.updateStatus(phase.phaseId, e.target.value); } catch { /**/ }
  };

  const handleAddActivity = async () => {
    if (!newActName.trim()) return;
    try {
      await phaseApi.createActivity(phase.phaseId, { name: newActName.trim() });
      setNewActName(''); setShowAdd(false);
      fetchActivities();
    } catch { /**/ }
  };

  return (
    <div className="pm-phase">
      <div className="pm-phase-header" onClick={() => setOpen(v => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.15s', flexShrink:0, color:'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <span className="pm-phase-name">{phase.name}</span>

        {phase.dependsOn?.length > 0 && (
          <span className="pm-dep-badge">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
            {phase.dependsOn.length} dep
          </span>
        )}

        {phase.isOverdue && <OverdueBadge />}

        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:200, marginLeft:'auto' }}>
          <ProgressBar value={phase.progress || 0} />
        </div>

        {canEdit ? (
          <select value={phase.status} onClick={e => e.stopPropagation()} onChange={handleStatusChange}
            style={{ background:'var(--bg)', border:'1px solid var(--divider)', borderRadius:'var(--radius)', color:'var(--light)', fontSize:11, padding:'4px 8px' }}>
            {PHASE_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={phase.status} />}
      </div>

      {open && (
        <div className="pm-phase-body" style={{ paddingTop:12 }}>
          {phase.description && (
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom:12, lineHeight:1.5 }}>{phase.description}</p>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Activities ({activities.length})
            </span>
            {canEdit && (
              <button className="pm-btn pm-btn-ghost" style={{ padding:'4px 12px', fontSize:11 }}
                onClick={() => setShowAdd(v=>!v)}>
                + Add Activity
              </button>
            )}
          </div>

          {showAdd && (
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              <input value={newActName} onChange={e=>setNewActName(e.target.value)} placeholder="Activity name…" autoFocus
                style={{ flex:1, background:'var(--charcoal)', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'7px 10px', color:'var(--light)', fontSize:12 }}
                onKeyDown={e => e.key==='Enter' && handleAddActivity()} />
              <button className="pm-btn pm-btn-primary" style={{padding:'7px 14px'}} onClick={handleAddActivity}>Add</button>
              <button className="pm-btn pm-btn-ghost"   style={{padding:'7px 10px'}} onClick={()=>setShowAdd(false)}>✕</button>
            </div>
          )}

          {loading && <div style={{ color:'var(--muted)', fontSize:12 }}>Loading…</div>}
          {!loading && activities.map(act => (
            <ActivityRow key={act.activityId} activity={act} myRole={myRole} phaseId={phase.phaseId} />
          ))}
          {!loading && !activities.length && (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>No activities yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
