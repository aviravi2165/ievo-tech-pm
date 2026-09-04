import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react';
import { useTheme } from '@emotion/react';
import { FolderKanban, RotateCcw, Trash2, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import StatusBadge, { InactiveBadge, statusLabel } from '../components/StatusBadge';
import EmptyStateHint from '../components/EmptyStateHint';
import ProgressBar from '../components/ProgressBar';
import OverdueBadge from '../components/OverdueBadge';
import ProjectFormModal from '../components/ProjectFormModal';
import { useProjectList } from '../hooks/useProject';
import { projectApi, projectGroupApi } from '../api/projectApi';
import { Table, TableHead, TableHeadCell, ListRow, Cell } from '../styles/Table.styles';
import { Topbar, TopbarH1, TopbarActions, List } from '../styles/ProjectListPage.styles';
import { Wrap, Empty, BtnPrimary, BtnGhost, DepBadge, IconBtn, IconBtnDanger } from '../styles/shared.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect, FilterSelect, FilterToggle } from '../../shared/components/TableControls';
import HoverTip from '../../shared/components/HoverTip';

// Role column removed (#6). Added a narrow serial-number column (#2) at the
// front instead. dates widened slightly since it now carries a phrase
// ("3 weeks left") rather than a raw date range.
const COL = { sno: 40, owner: 105, dates: 120, progress: 100, status: 96, actions: 28 };
const GRID_COLS = `${COL.sno}px minmax(120px, 1fr) ${COL.owner}px ${COL.dates}px ${COL.progress}px ${COL.status}px ${COL.actions}px`;

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

// Duration column (#1): show the project's PLANNED duration in whole weeks
// (start → end), e.g. 1 Jun → 1 Aug ≈ "8 weeks". If it has run past its
// planned end and isn't finished yet, append the overrun, e.g.
// "8 weeks (4 days delay)". The actual dates go in the hover tooltip.
function durationInfo(plannedStart, plannedEnd, status) {
  if (!plannedStart || !plannedEnd) return { text: '—', colorKey: 'ashLight' };
  const start = parseLocalDate(plannedStart);
  const end   = parseLocalDate(plannedEnd);
  const totalDays = Math.round((end - start) / 86400000);
  // Whole weeks the span covers (floor: 61 days → 8 weeks, not 9), min 1 so a
  // sub-week project still reads as "1 week" rather than "0 weeks".
  const weeks = Math.max(1, Math.floor(totalDays / 7));
  const base  = `${weeks} week${weeks === 1 ? '' : 's'}`;

  // A delay only matters for still-running work — a Completed/Closed project
  // isn't "late" anymore, so it just shows its planned duration.
  if (status !== 'Completed' && status !== 'Closed') {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const overdueDays = Math.round((now - end) / 86400000);
    if (overdueDays > 0) {
      const dw = Math.floor(overdueDays / 7);
      const delay = overdueDays < 7
        ? `${overdueDays} day${overdueDays === 1 ? '' : 's'} delay`
        : `${dw} week${dw === 1 ? '' : 's'} delay`;
      return { text: `${base} (${delay})`, colorKey: 'danger' };
    }
  }
  return { text: base, colorKey: 'ash' };
}

export default function ProjectListPage({ currentUser, onSelectProject, onOpenTemplates }) {
  const theme = useTheme();
  const {
    projects, total, search, setSearch, hasMore,
    loading, loadingMore, error, loadMore, refetch,
  } = useProjectList();
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const isAdmin = currentUser?.userType === 'admin';

  // ── Grouping state ──────────────────────────────────────────────────────────
  const [groups, setGroups] = useState([]);              // full shared group catalogue (with createdBy)
  const [selectMode, setSelectMode] = useState(false);   // are we picking projects to group?
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [newGroupName, setNewGroupName] = useState('');
  const [targetGroupId, setTargetGroupId] = useState(''); // for "add to existing group"
  const [collapsed, setCollapsed] = useState(new Set());  // groupIds (and 'ungrouped') that are collapsed

  const refetchGroups = useCallback(() => projectGroupApi.list().then(setGroups).catch(() => {}), []);
  useEffect(() => { refetchGroups(); }, [refetchGroups]);

  // Debounced search box.
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput, setSearch]);

  const isAdminView = projects.some(p => p.isSuperAdmin);

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

  // ── Bucket the visible projects into group sections + an Ungrouped bucket.
  // Sections are built from what's currently loaded/visible; a group with no
  // visible projects simply doesn't render a section (it still exists in the
  // "add to existing group" dropdown). ─────────────────────────────────────
  const { groupSections, ungrouped } = useMemo(() => {
    const byGroup = new Map();
    const rest = [];
    for (const p of visibleProjects) {
      if (p.groupId != null) {
        if (!byGroup.has(p.groupId)) byGroup.set(p.groupId, { groupId: p.groupId, name: p.groupName || 'Group', projects: [] });
        byGroup.get(p.groupId).projects.push(p);
      } else rest.push(p);
    }
    return {
      groupSections: [...byGroup.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ungrouped: rest,
    };
  }, [visibleProjects]);

  // Running 1-based serial across the grouped display order.
  const serialMap = useMemo(() => {
    const m = new Map(); let n = 0;
    for (const s of groupSections) for (const p of s.projects) m.set(p.projectId, ++n);
    for (const p of ungrouped) m.set(p.projectId, ++n);
    return m;
  }, [groupSections, ungrouped]);

  const groupsById = useMemo(() => new Map(groups.map(g => [g.groupId, g])), [groups]);
  const canGroup = (p) => p.myRole === 'Manager'; // admins already read as Manager here

  // ── Project actions ─────────────────────────────────────────────────────────
  // Delete lives in the project detail page now (see ProjectDetailPage) — only
  // reactivate remains reachable from the list.
  const handleReactivate = async (e, project) => {
    e.stopPropagation();
    try { await projectApi.reactivate(project.projectId); refetch(); } catch {}
  };

  // ── Group actions ───────────────────────────────────────────────────────────
  const toggleSelected = (id) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); setNewGroupName(''); setTargetGroupId(''); };
  const afterGroupChange = async () => { await refetchGroups(); refetch(); exitSelect(); };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedIds.size < 1) return;
    try { await projectGroupApi.create(newGroupName.trim(), [...selectedIds]); await afterGroupChange(); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to create group'); }
  };
  const handleAddToExisting = async () => {
    if (!targetGroupId || selectedIds.size < 1) return;
    try {
      for (const id of selectedIds) await projectGroupApi.setProjectGroup(id, Number(targetGroupId));
      await afterGroupChange();
    } catch (err) { alert(err?.response?.data?.error || 'Failed to add to group'); }
  };
  const handleUngroupSelected = async () => {
    try {
      for (const id of selectedIds) await projectGroupApi.setProjectGroup(id, null);
      await afterGroupChange();
    } catch (err) { alert(err?.response?.data?.error || 'Failed to remove from group'); }
  };
  const handleRenameGroup = async (section) => {
    const name = window.prompt('Rename group:', section.name);
    if (name == null || !name.trim()) return;
    try { await projectGroupApi.rename(section.groupId, name.trim()); await refetchGroups(); refetch(); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to rename group'); }
  };
  const handleDeleteGroup = async (section) => {
    if (!window.confirm(`Delete group "${section.name}"? Its projects just become ungrouped — the projects themselves are not deleted.`)) return;
    try { await projectGroupApi.delete(section.groupId); await refetchGroups(); refetch(); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to delete group'); }
  };

  const toggleCollapse = (key) => setCollapsed(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  // ── Row renderer (shared by every section) ──────────────────────────────────
  const renderRow = (p) => {
    const serial = serialMap.get(p.projectId);
    const selectable = canGroup(p);
    const checked = selectedIds.has(p.projectId);
    return (
      <ListRow key={p.projectId}
        onClick={selectMode ? (selectable ? () => toggleSelected(p.projectId) : undefined) : () => onSelectProject(p.projectId)}
        style={{
          minHeight: 36, padding: '5px 10px',
          cursor: selectMode && !selectable ? 'default' : 'pointer',
          opacity: selectMode && !selectable ? 0.45 : 1,
          background: checked ? `${theme.colors.espresso}14` : undefined,
        }}>
        <Cell w={COL.sno} center>
          {selectMode
            ? (selectable
                ? <input type="checkbox" checked={checked} readOnly style={{ pointerEvents: 'none' }} />
                : <span style={{ fontSize: 9, color: theme.colors.ashLight }} title="You can only group projects you manage">—</span>)
            : <span style={{ fontSize: 10, color: theme.colors.ashLight, fontWeight: 600 }}>{serial}</span>}
        </Cell>

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
          {(() => {
            const d = durationInfo(p.plannedStart, p.plannedEnd, p.status);
            const hasDates = p.plannedStart && p.plannedEnd;
            const tip = hasDates ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontWeight: 700, opacity: 0.85, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 9.5 }}>Timeline</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                  <span style={{ opacity: 0.7 }}>Start</span><span style={{ fontWeight: 600 }}>{fmtDate(p.plannedStart)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                  <span style={{ opacity: 0.7 }}>End</span><span style={{ fontWeight: 600 }}>{fmtDate(p.plannedEnd)}</span>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 5, display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                  <span style={{ opacity: 0.7 }}>Duration</span><span style={{ fontWeight: 600 }}>{d.text}</span>
                </div>
              </div>
            ) : 'No dates set';
            return (
              <HoverTip content={tip}>
                <span style={{ fontSize: 10.5, color: theme.colors[d.colorKey], fontWeight: d.colorKey === 'danger' ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.text}
                </span>
              </HoverTip>
            );
          })()}
        </Cell>

        <Cell w={COL.progress} center>
          <ProgressBar value={p.progress || 0} />
        </Cell>

        <Cell w={COL.status} center style={{ flexDirection: 'column', gap: 2 }}>
          <StatusBadge status={p.status} />
          <EmptyStateHint emptyState={p.emptyState} theme={theme} />
        </Cell>

        {/* Delete moved OUT of the list into the project detail page (it now
            lives inside the project, Manager-only). Only Reactivate remains
            here, for an inactive project a Manager wants to bring back. */}
        <Cell w={COL.actions} onClick={e => e.stopPropagation()}>
          {!selectMode && p.myRole === 'Manager' && p.isActive === false && (
            <IconBtn title="Reactivate project" onClick={(e) => handleReactivate(e, p)} style={{ width: 26, height: 26 }}>
              <RotateCcw size={13} strokeWidth={2} />
            </IconBtn>
          )}
        </Cell>
      </ListRow>
    );
  };

  // Full-width band that heads a group section.
  const SectionHeader = ({ label, count, collapseKey, section }) => {
    const g = section ? groupsById.get(section.groupId) : null;
    const canManageGroup = section && (isAdmin || (g && String(g.createdBy) === String(currentUser?.userId)));
    const isCollapsed = collapsed.has(collapseKey);
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        background: `${theme.colors.espresso}0f`, borderBottom: `1px solid ${theme.colors.border}`,
        cursor: 'pointer', userSelect: 'none',
      }} onClick={() => toggleCollapse(collapseKey)}>
        {isCollapsed ? <ChevronRight size={14} strokeWidth={2.5} style={{ color: theme.colors.ash }} />
                     : <ChevronDown  size={14} strokeWidth={2.5} style={{ color: theme.colors.ash }} />}
        <FolderKanban size={13} strokeWidth={2} style={{ color: theme.colors.espresso }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.colors.onyx }}>{label}</span>
        <span style={{ fontSize: 11, color: theme.colors.ash }}>({count})</span>
        {canManageGroup && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <IconBtn title="Rename group" onClick={() => handleRenameGroup(section)} style={{ width: 22, height: 22 }}>
              <Pencil size={12} strokeWidth={2} />
            </IconBtn>
            <IconBtnDanger title="Delete group" onClick={() => handleDeleteGroup(section)} style={{ width: 22, height: 22 }}>
              <Trash2 size={12} strokeWidth={2} />
            </IconBtnDanger>
          </span>
        )}
      </div>
    );
  };

  const hasGroups = groupSections.length > 0;

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
          {/* Toggle grouping (select) mode — pick projects, then create/assign a group. */}
          <BtnGhost onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            style={selectMode ? { borderColor: theme.colors.espresso, color: theme.colors.espresso } : undefined}>
            {selectMode ? 'Cancel grouping' : 'Group projects'}
          </BtnGhost>
          <BtnPrimary onClick={() => setShowCreate(true)}>
            + New Project
          </BtnPrimary>
        </TopbarActions>
      </Topbar>

      {/* ── Grouping action bar — shown while picking projects ── */}
      {selectMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 20px', background: `${theme.colors.espresso}0f`, borderBottom: `1px solid ${theme.colors.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.colors.onyx }}>
            {selectedIds.size} selected
          </span>
          <span style={{ fontSize: 11, color: theme.colors.ash }}>
            Tick projects you manage, then create a new group or add them to an existing one.
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <input
              placeholder="New group name…"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
              style={{ background: theme.colors.white, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, width: 170, outline: 'none' }}
            />
            <BtnPrimary onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedIds.size < 1}>
              Create group
            </BtnPrimary>

            {groups.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: theme.colors.ashLight }}>or</span>
                <select value={targetGroupId} onChange={e => setTargetGroupId(e.target.value)}
                  style={{ background: theme.colors.white, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, outline: 'none' }}>
                  <option value="">Add to existing…</option>
                  {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                </select>
                <BtnGhost onClick={handleAddToExisting} disabled={!targetGroupId || selectedIds.size < 1}>Add</BtnGhost>
              </>
            )}

            <BtnGhost onClick={handleUngroupSelected} disabled={selectedIds.size < 1} title="Remove selected projects from their group">
              Ungroup
            </BtnGhost>
          </div>
        </div>
      )}

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
            <TableHead cols={GRID_COLS}>
              <TableHeadCell center>#</TableHeadCell>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Owner</TableHeadCell>
              <TableHeadCell>Duration</TableHeadCell>
              <TableHeadCell center>Progress</TableHeadCell>
              <TableHeadCell center>Status</TableHeadCell>
              <TableHeadCell />
            </TableHead>

            {/* Group sections (collapsible), then the Ungrouped bucket. When
                there are no groups at all, the projects render as a plain flat
                list with no section headers. */}
            {groupSections.map(section => (
              <Fragment key={section.groupId}>
                <SectionHeader label={section.name} count={section.projects.length} collapseKey={section.groupId} section={section} />
                {!collapsed.has(section.groupId) && section.projects.map(renderRow)}
              </Fragment>
            ))}

            {hasGroups && ungrouped.length > 0 && (
              <SectionHeader label="Ungrouped" count={ungrouped.length} collapseKey="ungrouped" section={null} />
            )}
            {(!hasGroups || !collapsed.has('ungrouped')) && ungrouped.map(renderRow)}
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
