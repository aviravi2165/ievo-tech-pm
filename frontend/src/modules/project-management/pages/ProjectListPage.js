import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { FolderKanban, RotateCcw, Trash2 } from 'lucide-react';
import StatusBadge, { InactiveBadge, statusLabel } from '../components/StatusBadge';
import EmptyStateHint from '../components/EmptyStateHint';
import ProgressBar from '../components/ProgressBar';
import OverdueBadge from '../components/OverdueBadge';
import ProjectFormModal from '../components/ProjectFormModal';
import { useProjectList } from '../hooks/useProject';
import { projectApi } from '../api/projectApi';
import { Table, TableHead, TableHeadCell, ListRow, Cell } from '../styles/Table.styles';
import { Topbar, TopbarH1, TopbarActions, List } from '../styles/ProjectListPage.styles';
import { Wrap, Empty, BtnPrimary, BtnGhost, DepBadge, IconBtn, IconBtnDanger } from '../styles/shared.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect, FilterSelect, FilterToggle } from '../../shared/components/TableControls';

const COL = { owner: 105, dates: 140, progress: 100, status: 96, role: 74, actions: 28 };

function parseLocalDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}

function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return '—';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectListPage({ onSelectProject, onOpenTemplates }) {
  const theme = useTheme();
  const {
    projects, total, search, setSearch, hasMore,
    loading, loadingMore, error, loadMore, refetch,
  } = useProjectList();
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Debounced search box — types locally into its own state, only pushes
  // to the hook (which fires a new server request) after a short pause.
  // Without this, every keystroke would fire its own paginated fetch.
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput, setSearch]);

  const isAdminView = projects.some(p => p.isSuperAdmin);

  // UI-only sort/filter over the currently-loaded page of projects — the
  // server-side "Load more" pagination above is unaffected; sorting/
  // filtering just reorders/narrows whatever's already been fetched.
  const statusOptions = useMemo(() => (
    [...new Set(projects.map(p => p.status).filter(Boolean))].map(s => ({ value: s, label: statusLabel(s) }))
  ), [projects]);

  const { items: visibleProjects, sortKey, setSortKey, sortDir, toggleSortDir, filters, setFilter } = useSortFilter(projects, {
    sorters: {
      name:     (a, b) => (a.name || '').localeCompare(b.name || ''),
      start:    (a, b) => (parseLocalDate(a.plannedStart)?.getTime() ?? 0) - (parseLocalDate(b.plannedStart)?.getTime() ?? 0),
      end:      (a, b) => (parseLocalDate(a.plannedEnd)?.getTime() ?? 0) - (parseLocalDate(b.plannedEnd)?.getTime() ?? 0),
      progress: (a, b) => (a.progress || 0) - (b.progress || 0),
    },
    defaultSortKey: 'name',
    filters: {
      status:  { predicate: (p, v) => p.status === v },
      active:  { predicate: (p, v) => (v === 'active' ? p.isActive !== false : p.isActive === false) },
      overdue: { predicate: (p) => !!p.isOverdue },
    },
  });

  // Lets a dashboard tile ("Overdue Projects") land here PRE-filtered
  // instead of dumping the user on the unfiltered list and making them
  // re-apply it — dispatched by AdminDashboard.js's navigateToProjectsFiltered,
  // same 'CustomEvent + small delay' pattern as onSelectProject/open-project.
  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {};
      if (detail.overdue) setFilter('overdue', true);
      if (detail.status)  setFilter('status', detail.status);
      if (detail.active)  setFilter('active', detail.active);
    };
    window.addEventListener('pm-project-list-filter', handler);
    return () => window.removeEventListener('pm-project-list-filter', handler);
  }, [setFilter]);

  const handleDelete = async (e, project) => {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    try {
      const { action } = await projectApi.delete(project.projectId);
      if (action === 'deactivated') alert('This project still has phases — it was deactivated instead of deleted.');
      refetch();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to delete project');
    }
  };

  const handleReactivate = async (e, project) => {
    e.stopPropagation();
    try { await projectApi.reactivate(project.projectId); refetch(); } catch {}
  };

  return (
    <Wrap>
      <Topbar>
        <TopbarH1>Projects</TopbarH1>
        {isAdminView && (
          <DepBadge as="span" title="You're seeing every project in the org, not just ones you're a member of." style={{ background: theme.colors.warning, color: '#fff' }}>
            Admin view — all projects
          </DepBadge>
        )}
        <input
          placeholder="Search projects…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{
            background: theme.colors.greige, border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm, padding: '6px 12px', color: theme.colors.onyx,
            fontSize: 12, width: 200, outline: 'none',
          }}
        />
        <FilterToggle open={showFilters} onClick={() => setShowFilters(v => !v)}
          active={!!(filters.status || filters.active || filters.overdue)} title="Sort & filter projects" />
        <TopbarActions>
          <BtnGhost onClick={onOpenTemplates}>Templates</BtnGhost>
          <BtnPrimary onClick={() => setShowCreate(true)}>
            + New Project
          </BtnPrimary>
        </TopbarActions>
      </Topbar>

      {showFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 20px', background: theme.colors.greige, borderBottom: `1px solid ${theme.colors.border}` }}>
          <SortSelect
            value={sortKey} onChange={setSortKey} dir={sortDir} onToggleDir={toggleSortDir}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'start', label: 'Start Date' },
              { value: 'end', label: 'End Date' },
              { value: 'progress', label: 'Progress' },
            ]}
          />
          <FilterSelect
            placeholder="All statuses" value={filters.status} onChange={v => setFilter('status', v)}
            options={statusOptions}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.colors.ash, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.active === 'active'} onChange={e => setFilter('active', e.target.checked ? 'active' : null)} />
            Active only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.colors.ash, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!filters.overdue} onChange={e => setFilter('overdue', e.target.checked || null)} />
            Overdue only
          </label>
        </div>
      )}

      <List>
        {loading && <div style={{ color: theme.colors.ash, fontSize: 13 }}>Loading projects…</div>}
        {error   && <div style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</div>}

        {!loading && !visibleProjects.length && (
          <Empty>
            <FolderKanban size={44} strokeWidth={1.2} />
            <p>{search ? 'No projects match your search.' : projects.length ? 'No projects match the current filters.' : 'No projects yet. Create one to get started.'}</p>
          </Empty>
        )}

        {visibleProjects.length > 0 && (
          <Table>
            {/* cols is required now that TableHead is CSS Grid — without
                it, this defaulted silently to the Phase/Activity table's
                5-column GROUP_GRID_COLS template while actually rendering
                7 columns of completely different widths, which is why
                this page's header (and by extension its row alignment)
                broke when TableHead was converted to grid. This page's
                rows (ListRow/Cell) are still flexbox, not grid — that's
                fine, both layout modes agree on exact pixel widths for a
                fixed-width column, they just need to be told the SAME
                widths, which this cols string now does. */}
            <TableHead cols={`minmax(120px, 1fr) ${COL.owner}px ${COL.dates}px ${COL.progress}px ${COL.status}px ${COL.role}px ${COL.actions}px`}>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Owner</TableHeadCell>
              <TableHeadCell>Duration</TableHeadCell>
              <TableHeadCell center>Progress</TableHeadCell>
              <TableHeadCell center>Status</TableHeadCell>
              <TableHeadCell center>Role</TableHeadCell>
              <TableHeadCell />
            </TableHead>

            {visibleProjects.map(p => (
              <ListRow key={p.projectId} onClick={() => onSelectProject(p.projectId)} style={{ minHeight: 36, padding: '5px 10px' }}>
                {/* Explicit 2-line stack (title row, meta row) rather than
                    packing name+badges+meta all inline on one line — an
                    unconstrained flex row of text spans doesn't reliably
                    shrink/wrap, which is what caused rows to overflow their
                    fixed height and visually bleed into the row below. */}
                <Cell style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={p.name}>
                      {p.name}
                    </span>
                    {p.isActive === false && <InactiveBadge />}
                    {p.isOverdue && <OverdueBadge days={p.overdueDays} />}
                  </div>
                  <span style={{ fontSize: 9, color: theme.colors.ashLight }}>
                    {p.phaseCount} phase{p.phaseCount !== 1 ? 's' : ''} · {p.memberCount} member{p.memberCount !== 1 ? 's' : ''}
                  </span>
                </Cell>

                <Cell w={COL.owner}>
                  <span style={{ fontSize: 10, color: theme.colors.ash, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.ownerName || '—'}
                  </span>
                </Cell>

                <Cell w={COL.dates}>
                  <span style={{ fontSize: 9.5, color: theme.colors.ash, whiteSpace: 'nowrap' }}>
                    {p.plannedStart ? `${fmtDate(p.plannedStart)} → ${fmtDate(p.plannedEnd)}` : '—'}
                  </span>
                </Cell>

                <Cell w={COL.progress} center>
                  <ProgressBar value={p.progress || 0} />
                </Cell>

                <Cell w={COL.status} center style={{ flexDirection: 'column', gap: 2 }}>
                  <StatusBadge status={p.status} />
                  <EmptyStateHint emptyState={p.emptyState} theme={theme} />
                </Cell>

                <Cell w={COL.role} center>
                  <DepBadge as="span">{p.myRole}</DepBadge>
                </Cell>

                <Cell w={COL.actions} onClick={e => e.stopPropagation()}>
                  {p.myRole === 'Manager' && (
                    p.isActive === false ? (
                      <IconBtn title="Reactivate project" onClick={(e) => handleReactivate(e, p)} style={{ width: 26, height: 26 }}>
                        <RotateCcw size={13} strokeWidth={2} />
                      </IconBtn>
                    ) : (
                      <IconBtnDanger title="Delete project" onClick={(e) => handleDelete(e, p)} style={{ width: 26, height: 26 }}>
                        <Trash2 size={13} strokeWidth={2} />
                      </IconBtnDanger>
                    )
                  )}
                </Cell>
              </ListRow>
            ))}
          </Table>
        )}

        {hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
            <BtnGhost onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Load more (${total - projects.length} remaining)`}
            </BtnGhost>
          </div>
        )}
      </List>

      {showCreate && (
        <ProjectFormModal
          onClose={() => setShowCreate(false)}
          onCreated={(project) => { setShowCreate(false); refetch(); onSelectProject(project.projectId); }}
        />
      )}
    </Wrap>
  );
}
