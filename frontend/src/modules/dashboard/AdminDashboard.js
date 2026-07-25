import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { taskApi, projectApi } from '../project-management/api/projectApi';
import { userApi } from '../users/userApi';
import {
  Wrap, Header, Title, Subtitle, ErrorBanner, HrLine, LoadingWrap,
  BodyGrid, LeftCol, RightCol, Section, SectionHeadRow, SectionTitle,
  SectionPill, EmptyText, CardWrap,
  TaskRowBtn, TaskLeft, TaskName, TaskBreadcrumb, TaskRight, TaskBadgeRow, TaskDue, Chip,
  AuditRowWrap, AuditDot, AuditBody, AuditLine, AuditActor, AuditDetail, AuditMeta, AuditProject,
  StatGrid, StatTile, StatValue, StatLabel,
  DeptRow, DeptBar, DeptBarFill, DeptName, DeptCount,
} from './styles/DashboardModule.styles';
import { useSortFilter } from '../shared/hooks/useSortFilter';
import { usePagination } from '../shared/hooks/usePagination';
import { SortSelect, FilterSelect, LoadMoreBar } from '../shared/components/TableControls';

// ── Helpers (same conventions as the member DashboardModule) ──────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtRel(d) {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return dy === 1 ? 'yesterday' : `${dy}d ago`;
}
function fmtExact(d) {
  if (!d) return '';
  return new Date(d).toLocaleString([], { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function timeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
function navigateToPM() {
  window.dispatchEvent(new CustomEvent('navigate-to-module', { detail: { moduleId: 'project-management' } }));
}
function navigateToProject(projectId) {
  navigateToPM();
  // Small delay so the module mounts before it receives the open-project event
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-project', { detail: { projectId } }));
  }, 80);
}
// The Overdue Projects stat tile used to just dump you on the unfiltered
// Project List — technically "somewhere useful" but still made you
// re-apply the overdue filter yourself. ProjectListPage now listens for
// this event (see ProjectListPage.js) and pre-applies whatever filter is
// in the detail, same 80ms-after-navigate timing as navigateToProject.
function navigateToProjectsFiltered(filter) {
  navigateToPM();
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('pm-project-list-filter', { detail: filter }));
  }, 80);
}
// Fix for the admin-dashboard bug where the "Blocked Tasks"/"Overdue Tasks"
// stat tiles jumped into whatever project attention[0] happened to be —
// arbitrary and almost always the wrong project, since these counts are
// aggregated across every project in the org, not just one. The tiles now
// pre-filter the "Needs Attention" section (via setAttnFilter, called from
// the tile's onClick below) to the specific thing that was clicked, then
// scroll down to it — landing on exactly what was asked for, not just
// somewhere in the neighborhood of it.
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// User management is a modal opened from TopBanner (admin-only icon), not a
// routed module — there's no 'users' entry in ERP_MODULES to navigate to.
// tab: 'register' (default, e.g. from a generic "add user" action) or
// 'manage' (the Edit Users tab) — the Active Users tile and "Manage Users"
// button both want 'manage' since neither is about registering someone new.
function openUserManagement(tab = 'register') {
  window.dispatchEvent(new CustomEvent('open-user-management', { detail: { tab } }));
}
// The Messages rail is a persistent side panel (not a routed module either);
// admins land on the Groups/Threads oversight tab there automatically
// (MessagingPage.js already defaults isSuperAdmin users off the Inbox tab) —
// this just needs to make sure the panel itself is expanded.
function openMessagesOversight() {
  window.dispatchEvent(new CustomEvent('open-messages-panel'));
}

// Reuses the same humanizer wording as the member dashboard's audit feed,
// duplicated locally rather than imported — DashboardModule.js doesn't
// export it, and this is the only other consumer.
function auditText({ entityType, action, fieldChanged, oldValue, newValue, actorName }) {
  const who = actorName || 'Someone';
  const et  = (entityType || 'item').replace(/_/g, ' ');
  switch (action) {
    case 'created':             return [who, `created a ${et}`];
    case 'deleted':             return [who, `deleted a ${et}`];
    case 'deactivated':         return [who, `deactivated a ${et}`];
    case 'reactivated':         return [who, `reactivated a ${et}`];
    case 'updated':
    case 'status_changed':
      if (fieldChanged === 'status' || action === 'status_changed')
        return [who, `changed ${et} status`, `${oldValue} → ${newValue}`];
      if (fieldChanged === 'priority')
        return [who, `changed ${et} priority`, `${oldValue} → ${newValue}`];
      if (fieldChanged)
        return [who, `updated ${et} ${fieldChanged.replace(/_/g, ' ')}`];
      return [who, `updated a ${et}`];
    case 'member_added':        return [who, 'added a member'];
    case 'member_removed':      return [who, 'removed a member'];
    case 'role_changed':        return [who, 'changed a member role'];
    case 'assignment_accepted': return [who, 'accepted a task assignment'];
    case 'assignment_declined': return [who, 'declined a task assignment'];
    case 'assignee_requested':  return [who, 'requested a task assignment'];
    case 'dependency_added':    return [who, 'added a task dependency'];
    case 'dependency_removed':  return [who, 'removed a task dependency'];
    default:                    return [who, action.replace(/_/g, ' '), `on a ${et}`];
  }
}

function AuditRow({ entry, isLast }) {
  const [actor, ...rest] = auditText(entry);
  const detail = rest.length > 1 ? rest[rest.length - 1] : null;
  const middle = rest.slice(0, detail ? rest.length - 1 : rest.length).join(' ');
  return (
    <>
      <AuditRowWrap>
        <AuditDot />
        <AuditBody>
          <AuditLine>
            <AuditActor>{actor}</AuditActor>
            {' '}{middle}
            {detail && <AuditDetail>{detail}</AuditDetail>}
          </AuditLine>
          <AuditMeta>
            <AuditProject>{entry.projectName}</AuditProject>
            {' · '}<span title={fmtExact(entry.createdAt)}>{fmtRel(entry.createdAt)}</span>
          </AuditMeta>
        </AuditBody>
      </AuditRowWrap>
      {!isLast && <HrLine />}
    </>
  );
}

function AttentionTaskRow({ task, isLast }) {
  return (
    <>
      <TaskRowBtn onClick={() => navigateToProject(task.projectId)}>
        <TaskLeft>
          <TaskName>{task.taskName}</TaskName>
          <TaskBreadcrumb>{task.projectName} › {task.phaseName} › {task.activityName}</TaskBreadcrumb>
        </TaskLeft>
        <TaskRight>
          <TaskBadgeRow>
            {task.status === 'Blocked' && <Chip bg="#d9534f1a" color="#d9534f" border="#d9534f40">Blocked</Chip>}
            {task.isOverdue && <Chip bg="#d9534f1a" color="#d9534f" border="#d9534f40">Overdue</Chip>}
          </TaskBadgeRow>
          {task.dueDate && <TaskDue overdue={task.isOverdue}>{task.isOverdue ? '⚠ ' : ''}{fmtDate(task.dueDate)}</TaskDue>}
        </TaskRight>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'inherit', opacity: 0.5 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </TaskRowBtn>
      {!isLast && <HrLine />}
    </>
  );
}

export default function AdminDashboard({ currentUser }) {
  const theme = useTheme();
  const [projects, setProjects] = useState([]);
  const [attention, setAttention] = useState([]);
  const [auditFeed, setAuditFeed] = useState([]);
  const [userCounts, setUserCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [projs, tasks, audit, counts] = await Promise.all([
        projectApi.list(),
        taskApi.getAdminOverdueBlocked(),
        taskApi.getAdminRecentAudit(),
        userApi.getCounts(),
      ]);
      setProjects(projs);
      setAttention(tasks);
      setAuditFeed(audit);
      setUserCounts(counts);
    } catch { setError('Failed to load admin dashboard data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const displayName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
    || currentUser?.username || 'Admin';

  const overdueProjects = projects.filter(p => p.isOverdue);
  const activeProjects  = projects.filter(p => p.isActive !== false);
  const blockedCount    = attention.filter(t => t.status === 'Blocked').length;
  const overdueTaskCount = attention.filter(t => t.isOverdue).length;
  const maxDeptCount = userCounts?.byDepartment?.length
    ? Math.max(...userCounts.byDepartment.map(d => d.cnt))
    : 1;

  // ── Needs Attention: sort by due date, filter by project/status/overdue —
  // status + overdueOnly exist specifically so the Blocked/Overdue Tasks
  // stat tiles above can land on this section PRE-FILTERED to the thing
  // that was clicked, instead of just scrolling to an unfiltered list. ──
  const attentionProjectOptions = useMemo(() => (
    [...new Map(attention.map(t => [t.projectId, t.projectName])).entries()].map(([value, label]) => ({ value: String(value), label }))
  ), [attention]);
  const attentionStatusOptions = useMemo(() => (
    [...new Set(attention.map(t => t.status).filter(Boolean))].map(s => ({ value: s, label: s }))
  ), [attention]);
  const {
    items: sortedAttention, sortKey: attnSortKey, setSortKey: setAttnSortKey,
    sortDir: attnSortDir, toggleSortDir: toggleAttnSortDir, filters: attnFilters, setFilter: setAttnFilter, clearFilters: clearAttnFilters,
  } = useSortFilter(attention, {
    sorters: { due: (a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime() },
    defaultSortKey: 'due',
    filters: {
      project:     { predicate: (t, v) => String(t.projectId) === v },
      status:      { predicate: (t, v) => t.status === v },
      overdueOnly: { predicate: (t) => !!t.isOverdue },
    },
  });

  // ── Overdue Projects: sort by end date / progress ──────────────────────────
  const {
    items: sortedOverdueProjects, sortKey: opSortKey, setSortKey: setOpSortKey,
    sortDir: opSortDir, toggleSortDir: toggleOpSortDir,
  } = useSortFilter(overdueProjects, {
    sorters: {
      end:      (a, b) => new Date(a.plannedEnd || 0).getTime() - new Date(b.plannedEnd || 0).getTime(),
      progress: (a, b) => (a.progress || 0) - (b.progress || 0),
    },
    defaultSortKey: 'end',
  });

  // ── Recent Activity feed: sort/filter + real pagination (this used to be
  // a hardcoded slice(0,50) with no way to see anything past the 50th
  // entry — now a "Load more" like every other list). ──────────────────────
  const auditActionOptions = useMemo(() => [...new Set(auditFeed.map(e => e.action).filter(Boolean))].map(a => ({ value: a, label: a })), [auditFeed]);
  const { items: sortedAudit, sortDir: auditSortDir, toggleSortDir: toggleAuditSortDir, filters: auditFilters, setFilter: setAuditFilter } = useSortFilter(auditFeed, {
    sorters: { time: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() },
    filters: { action: { predicate: (e, v) => e.action === v } },
    defaultSortKey: 'time',
    defaultSortDir: 'desc',
  });
  const { pageItems: auditPage, hasMore: auditHasMore, loadMore: auditLoadMore, total: auditTotal } = usePagination(sortedAudit, 25);

  return (
    <Wrap>
      <Header>
        <Title>Good {timeOfDay()}, {displayName}</Title>
        <Subtitle>Organization-wide overview — you're not assigned to any project, so this shows what actually needs your attention: projects, people, and blockers across the whole org.</Subtitle>
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </Header>

      {loading ? (
        <LoadingWrap>Loading…</LoadingWrap>
      ) : (
        <>
          <StatGrid>
            <StatTile clickable onClick={navigateToPM}>
              <StatValue>{projects.length}</StatValue>
              <StatLabel>Total Projects</StatLabel>
            </StatTile>
            <StatTile clickable accent={overdueProjects.length ? theme.colors.danger : undefined} onClick={() => navigateToProjectsFiltered({ overdue: true })}>
              <StatValue accent={overdueProjects.length ? theme.colors.danger : undefined}>{overdueProjects.length}</StatValue>
              <StatLabel>Overdue Projects</StatLabel>
            </StatTile>
            <StatTile accent={theme.colors.success}>
              <StatValue accent={theme.colors.success}>{activeProjects.length}</StatValue>
              <StatLabel>Active Projects</StatLabel>
            </StatTile>
            <StatTile clickable accent={blockedCount ? theme.colors.danger : undefined} onClick={() => { clearAttnFilters(); setAttnFilter('status', 'Blocked'); scrollToSection('needs-attention'); }}>
              <StatValue accent={blockedCount ? theme.colors.danger : undefined}>{blockedCount}</StatValue>
              <StatLabel>Blocked Tasks</StatLabel>
            </StatTile>
            <StatTile clickable accent={overdueTaskCount ? theme.colors.danger : undefined} onClick={() => { clearAttnFilters(); setAttnFilter('overdueOnly', true); scrollToSection('needs-attention'); }}>
              <StatValue accent={overdueTaskCount ? theme.colors.danger : undefined}>{overdueTaskCount}</StatValue>
              <StatLabel>Overdue Tasks</StatLabel>
            </StatTile>
            <StatTile clickable onClick={() => openUserManagement('manage')}>
              <StatValue>{userCounts?.active ?? '—'}</StatValue>
              <StatLabel>Active Users</StatLabel>
            </StatTile>
          </StatGrid>
          <HrLine />

          <BodyGrid>
            {/* ── Left column ── */}
            <LeftCol>
              <Section id="needs-attention">
                <SectionHeadRow>
                  <SectionTitle>Needs Attention</SectionTitle>
                  {attention.length > 0 && <SectionPill bg={theme.colors.danger}>{attention.length}</SectionPill>}
                </SectionHeadRow>
                {attention.length === 0
                  ? <EmptyText>Nothing blocked or overdue across any project.</EmptyText>
                  : (
                    <>
                      {attention.length > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                          <SortSelect value={attnSortKey} onChange={setAttnSortKey} dir={attnSortDir} onToggleDir={toggleAttnSortDir}
                            options={[{ value:'due', label:'Due Date' }]} />
                          <FilterSelect placeholder="All statuses" value={attnFilters.status} onChange={v => setAttnFilter('status', v)} options={attentionStatusOptions} />
                          <FilterSelect placeholder="All projects" value={attnFilters.project} onChange={v => setAttnFilter('project', v)} options={attentionProjectOptions} />
                          <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, cursor:'pointer' }}>
                            <input type="checkbox" checked={!!attnFilters.overdueOnly} onChange={e => setAttnFilter('overdueOnly', e.target.checked || null)} />
                            Overdue only
                          </label>
                          {(attnFilters.status || attnFilters.project || attnFilters.overdueOnly) && (
                            <button type="button" onClick={clearAttnFilters}
                              style={{ background:'none', border:'none', color:theme.colors.ash, fontSize:11, cursor:'pointer', textDecoration:'underline', padding:0 }}>
                              Clear filters
                            </button>
                          )}
                        </div>
                      )}
                      {attention.length > 0 && sortedAttention.length === 0 && (
                        <EmptyText>No tasks match the current filters.</EmptyText>
                      )}
                      <CardWrap>
                        {sortedAttention.map((t, i) => (
                          <AttentionTaskRow key={t.taskId} task={t} isLast={i === sortedAttention.length - 1} />
                        ))}
                      </CardWrap>
                    </>
                  )}
              </Section>

              {overdueProjects.length > 0 && (
                <Section tight>
                  <SectionHeadRow>
                    <SectionTitle>Overdue Projects</SectionTitle>
                    <SectionPill bg={theme.colors.danger}>{overdueProjects.length}</SectionPill>
                  </SectionHeadRow>
                  {overdueProjects.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                      <SortSelect value={opSortKey} onChange={setOpSortKey} dir={opSortDir} onToggleDir={toggleOpSortDir}
                        options={[{ value:'end', label:'End Date' }, { value:'progress', label:'Progress' }]} />
                    </div>
                  )}
                  <CardWrap>
                    {sortedOverdueProjects.map((p, i) => (
                      <TaskRowBtn key={p.projectId} onClick={() => navigateToProject(p.projectId)}>
                        <TaskLeft>
                          <TaskName>{p.name}</TaskName>
                          <TaskBreadcrumb>Owner: {p.ownerName || '—'} · {p.progress || 0}% complete</TaskBreadcrumb>
                        </TaskLeft>
                        <TaskRight>
                          <TaskDue overdue>⚠ due {fmtDate(p.plannedEnd)}</TaskDue>
                        </TaskRight>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </TaskRowBtn>
                    ))}
                  </CardWrap>
                </Section>
              )}
            </LeftCol>

            {/* ── Right column ── */}
            <RightCol>
              <Section>
                <SectionHeadRow>
                  <SectionTitle>Team</SectionTitle>
                </SectionHeadRow>
                <CardWrap style={{ padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: theme.colors.onyx }}>{userCounts?.total ?? '—'}</div>
                      <div style={{ fontSize: 10, color: theme.colors.ash }}>Total accounts</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: theme.colors.success }}>{userCounts?.active ?? '—'}</div>
                      <div style={{ fontSize: 10, color: theme.colors.ash }}>Active</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: theme.colors.ash }}>{userCounts?.admins ?? '—'}</div>
                      <div style={{ fontSize: 10, color: theme.colors.ash }}>Admins</div>
                    </div>
                  </div>
                  {userCounts?.byDepartment?.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {userCounts.byDepartment.slice(0, 6).map(d => (
                        <DeptRow key={d.deptName}>
                          <DeptName title={d.deptName}>{d.deptName}</DeptName>
                          <DeptBar><DeptBarFill pct={Math.round((d.cnt / maxDeptCount) * 100)} /></DeptBar>
                          <DeptCount>{d.cnt}</DeptCount>
                        </DeptRow>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => openUserManagement('manage')}
                    style={{
                      marginTop: 10, width: '100%', padding: '7px 0', fontSize: 11.5, fontWeight: 600,
                      background: 'none', border: `1px solid ${theme.colors.border}`, borderRadius: 5,
                      color: theme.colors.onyx, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Manage Users →
                  </button>
                </CardWrap>

                <button
                  onClick={openMessagesOversight}
                  style={{
                    width: '100%', padding: '9px 0', fontSize: 11.5, fontWeight: 600, marginBottom: 24,
                    background: 'none', border: `1px solid ${theme.colors.border}`, borderRadius: 5,
                    color: theme.colors.onyx, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Group &amp; Thread Oversight →
                </button>
              </Section>

              <Section>
                <SectionHeadRow>
                  <SectionTitle>Recent Activity — All Projects</SectionTitle>
                </SectionHeadRow>
                {auditFeed.length === 0
                  ? <EmptyText>No recent activity across any project.</EmptyText>
                  : (
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                        <SortSelect value="time" onChange={() => {}} dir={auditSortDir} onToggleDir={toggleAuditSortDir}
                          options={[{ value:'time', label: auditSortDir === 'desc' ? 'Newest first' : 'Oldest first' }]} />
                        <FilterSelect placeholder="All actions" value={auditFilters.action} onChange={v => setAuditFilter('action', v)} options={auditActionOptions} />
                      </div>
                      <CardWrap>
                        {auditPage.map((e, i) => (
                          <AuditRow key={e.id} entry={e} isLast={i === auditPage.length - 1} />
                        ))}
                      </CardWrap>
                      <LoadMoreBar hasMore={auditHasMore} onLoadMore={auditLoadMore} remaining={auditTotal - auditPage.length} />
                    </>
                  )}
              </Section>
            </RightCol>
          </BodyGrid>
        </>
      )}
    </Wrap>
  );
}
