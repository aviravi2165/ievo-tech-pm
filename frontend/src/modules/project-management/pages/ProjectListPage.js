import { useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import OverdueBadge from '../components/OverdueBadge';
import ProjectFormModal from '../components/ProjectFormModal';
import { useProjectList } from '../hooks/useProject';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectListPage({ onSelectProject }) {
  const { projects, loading, error, refetch } = useProjectList();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pm-wrap">
      <div className="pm-topbar">
        <h1>Projects</h1>
        <input
          placeholder="Search projects…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--charcoal)', border: '1px solid var(--divider)',
            borderRadius: 'var(--radius)', padding: '6px 12px', color: 'var(--light)',
            fontSize: 12, width: 200,
          }}
        />
        <div className="pm-topbar-actions">
          <button className="pm-btn pm-btn-primary" onClick={() => setShowCreate(true)}>
            + New Project
          </button>
        </div>
      </div>

      <div className="pm-list">
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading projects…</div>}
        {error   && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        {!loading && !filtered.length && (
          <div className="pm-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <p>{search ? 'No projects match your search.' : 'No projects yet. Create one to get started.'}</p>
          </div>
        )}

        <div className="pm-list-grid">
          {filtered.map(p => (
            <div key={p.projectId} className="pm-card" onClick={() => onSelectProject(p.projectId)}>
              <div className="pm-card-name">{p.name}</div>
              <div className="pm-card-meta">
                {p.ownerName && <span>Owner: {p.ownerName}</span>}
                {p.plannedStart && <span> · {fmtDate(p.plannedStart)} → {fmtDate(p.plannedEnd)}</span>}
              </div>
              <div style={{ marginBottom: 12 }}>
                <ProgressBar value={p.progress || 0} />
              </div>
              <div className="pm-card-footer">
                <StatusBadge status={p.status} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.phaseCount} phase{p.phaseCount !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.memberCount} member{p.memberCount !== 1 ? 's' : ''}</span>
                <span style={{
                  fontSize: 11, color: 'var(--muted)',
                  background: 'var(--charcoal)', padding: '2px 8px', borderRadius: 10,
                }}>{p.myRole}</span>
                {p.isOverdue && <OverdueBadge />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <ProjectFormModal
          onClose={() => setShowCreate(false)}
          onCreated={(project) => { setShowCreate(false); refetch(); onSelectProject(project.projectId); }}
        />
      )}
    </div>
  );
}
