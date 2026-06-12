import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import OverdueBadge from './OverdueBadge';
import ActivityRow from './ActivityRow';
import { phaseApi } from '../api/projectApi';

const PHASE_STATUSES = ['To Do', 'In Progress', 'Completed', 'Blocked'];

function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}
function fmtRange(start, end) {
  const s = parseLocalDate(start), e = parseLocalDate(end);
  if (!s && !e) return null;
  const fmt = d => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${s ? fmt(s) : '?'} → ${e ? fmt(e) : '?'}`;
}

function DueBadge({ start, end, status }) {
  if (!end || status === 'Completed') return null;
  const dt  = parseLocalDate(end);
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((dt - now) / 86400000);
  if (diff < 0)  return <span className="pm-late-tag">⚠ {Math.abs(diff)}d late</span>;
  if (diff <= 5) return <span className="pm-due-soon">Ends {diff === 0 ? 'today' : `in ${diff}d`}</span>;
  return null;
}

export default function PhasePanel({ phase, myRole, projectId, allPhases = [], projectMembers = [], myUserId, onReorder, onRefetchProject }) {
  const [open,        setOpen]        = useState(false);
  const [activities,  setActivities]  = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [panel,       setPanel]       = useState(null); // 'dates'|'deps'|'addact'
  const [localStatus, setLocalStatus] = useState(phase.status);

  // Date edit
  const [editStart,   setEditStart]   = useState(toInput(phase.plannedStart));
  const [editEnd,     setEditEnd]     = useState(toInput(phase.plannedEnd));
  const [dateErrors,  setDateErrors]  = useState({});
  const [dateSaving,  setDateSaving]  = useState(false);

  // Add activity
  const [newActName,  setNewActName]  = useState('');
  const [newActStart, setNewActStart] = useState('');
  const [newActEnd,   setNewActEnd]   = useState('');
  const [actErrors,   setActErrors]   = useState({});

  // Deps
  const [depError,    setDepError]    = useState('');

  const canEdit = myRole === 'Manager';

  useEffect(() => { setLocalStatus(phase.status); }, [phase.status]);
  useEffect(() => {
    setEditStart(toInput(phase.plannedStart));
    setEditEnd(toInput(phase.plannedEnd));
  }, [phase.plannedStart, phase.plannedEnd]);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try { setActivities(await phaseApi.getActivities(phase.phaseId)); }
    catch { }
    finally { setLoading(false); }
  }, [phase.phaseId]);

  useEffect(() => { if (open) fetchActivities(); }, [open, fetchActivities]);

  const togglePanel = (p) => setPanel(v => v === p ? null : p);

  const handleStatusChange = async (e) => {
    const s = e.target.value, prev = localStatus;
    setLocalStatus(s);
    try { await phaseApi.updateStatus(phase.phaseId, s); onRefetchProject?.(); }
    catch { setLocalStatus(prev); }
  };

  const handleDateSave = async () => {
    const errs = {};
    if (!editStart) errs.start = 'Start date required';
    if (!editEnd)   errs.end   = 'End date required';
    if (editStart && editEnd && editEnd < editStart) errs.end = 'End must be after start';
    if (Object.keys(errs).length) { setDateErrors(errs); return; }
    setDateSaving(true);
    try {
      await phaseApi.update(phase.phaseId, { plannedStart: editStart, plannedEnd: editEnd });
      onRefetchProject?.();
      setPanel(null); setDateErrors({});
    } catch { }
    finally { setDateSaving(false); }
  };

  const handleAddActivity = async () => {
    const errs = {};
    if (!newActName.trim()) errs.name  = 'Name required';
    if (!newActStart)       errs.start = 'Start date required';
    if (!newActEnd)         errs.end   = 'End date required';
    if (newActStart && newActEnd && newActEnd < newActStart) errs.end = 'End must be after start';
    if (Object.keys(errs).length) { setActErrors(errs); return; }
    try {
      await phaseApi.createActivity(phase.phaseId, {
        name:         newActName.trim(),
        plannedStart: newActStart,
        plannedEnd:   newActEnd,
      });
      setNewActName(''); setNewActStart(''); setNewActEnd(''); setActErrors({});
      setPanel(null);
      fetchActivities();
    } catch { }
  };

  // Deps
  const otherPhases = allPhases.filter(p => p.phaseId !== phase.phaseId);
  const currentDeps = new Set((phase.dependsOn || []).map(Number));

  const handleAddDep = async (depId) => {
    setDepError('');
    try { await phaseApi.addDep(phase.phaseId, depId); onRefetchProject?.(); }
    catch (err) { setDepError(err?.response?.data?.error || 'Failed'); }
  };
  const handleRemoveDep = async (depId) => {
    try { await phaseApi.removeDep(phase.phaseId, depId); onRefetchProject?.(); } catch {}
  };

  const dateRange = fmtRange(phase.plannedStart, phase.plannedEnd);

  return (
    <div className="pm-phase">
      {/* ── Header ── */}
      <div className="pm-phase-header" onClick={() => setOpen(v => !v)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform:open?'rotate(90deg)':'none', transition:'transform 0.15s', flexShrink:0, color:'var(--muted)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <span className="pm-phase-name">{phase.name}</span>

        {dateRange && (
          <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{dateRange}</span>
        )}

        <DueBadge start={phase.plannedStart} end={phase.plannedEnd} status={phase.status} />

        {phase.dependsOn?.length > 0 && (
          <span className="pm-dep-badge" title={`Depends on ${phase.dependsOn.length} phase(s)`}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            {phase.dependsOn.length} dep
          </span>
        )}
        {phase.isOverdue && <OverdueBadge />}

        {canEdit && onReorder && (
          <div style={{ display:'flex', gap:2 }} onClick={e => e.stopPropagation()}>
            <button className="icon-btn" title="Move up"   onClick={() => onReorder(phase.phaseId,'up')}   style={{width:22,height:22}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg></button>
            <button className="icon-btn" title="Move down" onClick={() => onReorder(phase.phaseId,'down')} style={{width:22,height:22}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
          </div>
        )}

        <div style={{ minWidth:180, marginLeft:'auto' }}>
          <ProgressBar value={phase.progress || 0} />
        </div>

        {canEdit ? (
          <select value={localStatus} onClick={e => e.stopPropagation()} onChange={handleStatusChange}
            style={{ background:'#fff', border:'1px solid var(--divider)', borderRadius:'var(--radius)', color:'var(--light)', fontSize:11, padding:'4px 8px', fontFamily:'inherit', outline:'none' }}>
            {PHASE_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : <StatusBadge status={localStatus} />}

        {canEdit && (
          <div style={{ display:'flex', gap:3 }} onClick={e => e.stopPropagation()}>
            <button className={`icon-btn ${panel==='dates'?'active':''}`} title="Edit phase dates"
              onClick={() => togglePanel('dates')} style={{width:26,height:26}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            <button className={`icon-btn ${panel==='deps'?'active':''}`} title="Manage dependencies"
              onClick={() => togglePanel('deps')} style={{width:26,height:26}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* ── Date edit panel ── */}
      {panel === 'dates' && canEdit && (
        <div style={{ padding:'12px 18px 14px', borderTop:'1px solid var(--divider)', background:'#fafaf8' }}>
          <div style={{ fontSize:11, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Phase Dates</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Start Date *</label>
              <input type="date" value={editStart} onChange={e => { setEditStart(e.target.value); setDateErrors(er=>({...er,start:''})); }}
                style={{ background:'#fff', border:`1px solid ${dateErrors.start?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
              {dateErrors.start && <span style={{ fontSize:10, color:'#aa1010' }}>{dateErrors.start}</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>End Date *</label>
              <input type="date" value={editEnd} onChange={e => { setEditEnd(e.target.value); setDateErrors(er=>({...er,end:''})); }}
                min={editStart||undefined}
                style={{ background:'#fff', border:`1px solid ${dateErrors.end?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
              {dateErrors.end && <span style={{ fontSize:10, color:'#aa1010' }}>{dateErrors.end}</span>}
            </div>
            <button className="pm-btn pm-btn-primary" style={{ padding:'7px 16px' }} onClick={handleDateSave} disabled={dateSaving}>{dateSaving?'…':'Save'}</button>
            <button className="pm-btn pm-btn-ghost"   style={{ padding:'7px 12px' }} onClick={() => { setPanel(null); setDateErrors({}); }}>Cancel</button>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Dates appear on the Timeline once saved.</div>
        </div>
      )}

      {/* ── Dependency panel ── */}
      {panel === 'deps' && canEdit && (
        <div style={{ padding:'12px 18px 14px', borderTop:'1px solid var(--divider)', background:'#fafaf8' }}>
          <div style={{ fontSize:11, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>Phase Dependencies</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>This phase is <strong>Blocked</strong> until all selected phases are Completed.</div>
          {otherPhases.length === 0 && <div style={{ fontSize:12, color:'var(--muted)' }}>No other phases.</div>}
          {otherPhases.map(p => {
            const isSel = currentDeps.has(p.phaseId);
            return (
              <div key={p.phaseId} className={`pm-member-row ${isSel?'selected':''}`} style={{ marginBottom:4 }}>
                <span style={{ flex:1, fontSize:12, color:'var(--light)' }}>{p.name}</span>
                <StatusBadge status={p.status} />
                {isSel ? (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize:11, padding:'2px 8px', color:'#aa1010', borderColor:'rgba(170,16,16,.3)' }} onClick={() => handleRemoveDep(p.phaseId)}>Remove</button>
                ) : (
                  <button className="pm-btn pm-btn-ghost" style={{ fontSize:11, padding:'2px 8px' }} onClick={() => handleAddDep(p.phaseId)}>+ Add</button>
                )}
              </div>
            );
          })}
          {depError && <div style={{ color:'#aa1010', fontSize:11, marginTop:4 }}>{depError}</div>}
        </div>
      )}

      {/* ── Body ── */}
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
                onClick={() => togglePanel('addact')}>
                + Add Activity
              </button>
            )}
          </div>

          {/* ── Add activity form (with dates required) ── */}
          {panel === 'addact' && canEdit && (
            <div style={{ background:'#fafaf8', border:'1px solid var(--divider)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:10 }}>
              <div style={{ fontSize:11, color:'var(--gold)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>New Activity</div>
              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Name *</label>
                <input value={newActName} onChange={e => { setNewActName(e.target.value); setActErrors(er=>({...er,name:''})); }}
                  placeholder="Activity name…"
                  autoFocus
                  style={{ width:'100%', background:'#fff', border:`1px solid ${actErrors.name?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'7px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }}
                  onKeyDown={e => e.key==='Enter' && handleAddActivity()} />
                {actErrors.name && <span style={{ fontSize:10, color:'#aa1010' }}>{actErrors.name}</span>}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>Start Date *</label>
                  <input type="date" value={newActStart} onChange={e => { setNewActStart(e.target.value); setActErrors(er=>({...er,start:''})); }}
                    style={{ background:'#fff', border:`1px solid ${actErrors.start?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
                  {actErrors.start && <span style={{ fontSize:10, color:'#aa1010' }}>{actErrors.start}</span>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>End Date *</label>
                  <input type="date" value={newActEnd} onChange={e => { setNewActEnd(e.target.value); setActErrors(er=>({...er,end:''})); }}
                    min={newActStart||undefined}
                    style={{ background:'#fff', border:`1px solid ${actErrors.end?'#aa1010':'var(--divider)'}`, borderRadius:'var(--radius)', padding:'6px 10px', color:'var(--light)', fontSize:12, fontFamily:'inherit', outline:'none' }} />
                  {actErrors.end && <span style={{ fontSize:10, color:'#aa1010' }}>{actErrors.end}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="pm-btn pm-btn-primary" style={{ fontSize:11, padding:'6px 16px' }} onClick={handleAddActivity}>Add</button>
                <button className="pm-btn pm-btn-ghost"   style={{ fontSize:11, padding:'6px 12px' }} onClick={() => { setPanel(null); setActErrors({}); }}>Cancel</button>
              </div>
            </div>
          )}

          {loading && <div style={{ color:'var(--muted)', fontSize:12 }}>Loading…</div>}
          {!loading && activities.map(act => (
            <ActivityRow
              key={act.activityId}
              activity={act}
              myRole={myRole}
              allActivities={activities}
              projectMembers={projectMembers}
              myUserId={myUserId}
              onRefetchPhase={fetchActivities}
              onRefetchProject={onRefetchProject}
            />
          ))}
          {!loading && !activities.length && (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>No activities yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
