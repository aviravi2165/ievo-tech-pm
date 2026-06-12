import { useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import OverdueBadge from '../components/OverdueBadge';
import PhasePanel from '../components/PhasePanel';
import MemberManager from '../components/MemberManager';
import AuditLog from '../components/AuditLog';
import TimelineView from '../components/TimelineView';
import { useProject } from '../hooks/useProject';
import { projectApi, phaseApi } from '../api/projectApi';

const TABS = ['Phases', 'Timeline', 'Members', 'Audit'];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectDetailPage({ projectId, onBack }) {
  const { project, phases, loading, error, refetch } = useProject(projectId);
  const [tab,         setTab]         = useState('Phases');
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');

  const myRole  = project?.myRole;
  const canEdit = myRole === 'Manager';

  const handleReorder = async (phaseId, direction) => {
    try {
      await phaseApi.reorder(phaseId, direction);
      refetch();
    } catch { /**/ }
  };

  const handleAddPhase = async () => {
    if (!newPhaseName.trim()) return;
    try {
      await projectApi.createPhase(projectId, { name: newPhaseName.trim() });
      setNewPhaseName(''); setShowAddPhase(false); refetch();
    } catch { /**/ }
  };

  if (loading) return (
    <div className="pm-wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
        Loading project…
      </div>
    </div>
  );

  if (error || !project) return (
    <div className="pm-wrap">
      <div style={{ padding: 24, color: 'var(--danger)' }}>
        {error || 'Project not found.'}{' '}
        <button className="pm-btn pm-btn-ghost" onClick={onBack} style={{ marginLeft: 8 }}>← Back</button>
      </div>
    </div>
  );

  return (
    <div className="pm-detail">
      {/* Header */}
      <div className="pm-detail-header">
        <button className="icon-btn" onClick={onBack} title="Back to projects">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pm-detail-title">{project.name}</div>
          <div className="pm-detail-sub">
            {project.ownerName && <span>Owner: {project.ownerName}</span>}
            {project.plannedStart && <span> · {fmtDate(project.plannedStart)} → {fmtDate(project.plannedEnd)}</span>}
            {project.isOverdue && <> · <OverdueBadge /></>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 160 }}>
            <ProgressBar value={project.progress || 0} />
          </div>
          <StatusBadge status={project.status} />
          <span style={{
            fontSize: 11, color: 'var(--muted)',
            background: 'var(--charcoal)', padding: '3px 10px',
            borderRadius: 12, border: '1px solid var(--divider)',
          }}>{myRole}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="pm-detail-tabs">
        {TABS
          .filter(t => t !== 'Audit' || canEdit)   // Audit only for Managers
          .map(t => (
            <button key={t} className={`pm-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t}
              {t === 'Phases'  && <span style={{ marginLeft: 6, opacity: .6, fontSize: 11 }}>({phases.length})</span>}
              {t === 'Members' && <span style={{ marginLeft: 6, opacity: .6, fontSize: 11 }}>({project.members?.length || 0})</span>}
            </button>
          ))}
      </div>

      {/* Body */}
      <div className="pm-detail-body">

        {/* ── Phases tab ── */}
        {tab === 'Phases' && (
          <>
            {canEdit && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button className="pm-btn pm-btn-primary" onClick={() => setShowAddPhase(v => !v)}>
                  + Add Phase
                </button>
              </div>
            )}

            {showAddPhase && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)}
                  placeholder="Phase name…" autoFocus
                  style={{ flex: 1, background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '8px 12px', color: 'var(--light)', fontSize: 13 }}
                  onKeyDown={e => e.key === 'Enter' && handleAddPhase()} />
                <button className="pm-btn pm-btn-primary" onClick={handleAddPhase}>Add</button>
                <button className="pm-btn pm-btn-ghost"   onClick={() => setShowAddPhase(false)}>✕</button>
              </div>
            )}

            {!phases.length && (
              <div className="pm-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                </svg>
                <p>No phases yet. Add one to structure this project.</p>
              </div>
            )}

            {phases.map(ph => (
              <PhasePanel
                key={ph.phaseId}
                phase={ph}
                myRole={myRole}
                projectId={projectId}
                allPhases={phases}
                onReorder={handleReorder}
                onRefetchProject={refetch}
              />
            ))}
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
            ? <MemberManager projectId={projectId} members={project.members || []} onRefetch={refetch} />
            : (
              <div>
                {(project.members || []).map(m => (
                  <div key={m.userId} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', background: 'var(--charcoal)',
                    border: '1px solid var(--divider)', borderRadius: 'var(--radius)', marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 13, color: 'var(--light)', flex: 1 }}>{m.name}</div>
                    <span style={{
                      fontSize: 11, color: 'var(--muted)',
                      background: 'var(--bg)', padding: '2px 10px',
                      borderRadius: 10, border: '1px solid var(--divider)',
                    }}>{m.role}</span>
                  </div>
                ))}
              </div>
            )
        )}

        {/* ── Audit tab (Manager only) ── */}
        {tab === 'Audit' && canEdit && <AuditLog projectId={projectId} />}
      </div>
    </div>
  );
}