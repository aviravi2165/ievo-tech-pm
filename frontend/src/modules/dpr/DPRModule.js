import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { reportApi } from '../project-management/api/projectApi';
import ReportTab from '../project-management/components/ReportTab';

/**
 * DPRModule — Daily Progress Report. A cross-project view of the same Report
 * chats the project page's Report tab shows. Lists every project report the
 * viewer can see (admin = all; others = only projects they've been added to),
 * filterable by project, and shows the selected project's report chat.
 */
export default function DPRModule() {
  const theme = useTheme();
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    reportApi.listDpr()
      .then(list => { setProjects(list); if (list[0]) setSelected(list[0]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: theme.colors.greige }}>
      {/* ── Left: project filter list ── */}
      <div style={{ width: 260, minWidth: 200, flexShrink: 0, borderRight: `1px solid ${theme.colors.border}`, display: 'flex', flexDirection: 'column', background: theme.colors.white }}>
        <div style={{ padding: '12px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ fontFamily: theme.font.display, fontSize: 14, fontWeight: 800, color: theme.colors.onyx, marginBottom: 8 }}>Daily Progress Reports</div>
          <input
            placeholder="Filter projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', fontSize: 12, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading && <div style={{ padding: 12, color: theme.colors.ash, fontSize: 12 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 12, color: theme.colors.ash, fontSize: 12 }}>
              {projects.length === 0 ? 'No project reports available to you yet.' : 'No projects match your filter.'}
            </div>
          )}
          {filtered.map(p => (
            <button key={p.projectId} type="button" onClick={() => setSelected(p)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4,
                border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer', fontFamily: 'inherit',
                background: selected?.projectId === p.projectId ? `${theme.colors.espresso}14` : 'transparent',
              }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</div>
              <div style={{ fontSize: 10, color: theme.colors.ash }}>
                {p.memberCount} member{p.memberCount !== 1 ? 's' : ''}{p.conversationId ? '' : ' · not started'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: selected project's report chat (reuses the same ReportTab) ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {selected
          ? <ReportTab key={selected.projectId} projectId={selected.projectId} projectName={selected.name} />
          : <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Select a project to view its report.</div>}
      </div>
    </div>
  );
}
