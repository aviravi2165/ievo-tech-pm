import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { requestApi, taskApi, projectApi } from '../project-management/api/projectApi';
import AdminDashboard from './AdminDashboard';
import {
  Wrap, Header, Title, Subtitle, ErrorBanner, HrLine, LoadingWrap,
  BodyGrid, LeftCol, RightCol, Section, SectionHeadRow, SectionTitle,
  SectionPill, EmptyText, TabBarRow, TabBtn, TabCount, CardWrap,
  RequestCard, ReqHeaderRow, ReqName, ReqBreadcrumb, ReqMetaRow, ReqMeta,
  ReqMetaStrong, ReqDescription, ReqActions, AcceptBtn, DeclineBtn,
  RespondedNote, Chip, TaskRowBtn, TaskLeft, TaskName, TaskBreadcrumb,
  TaskRight, TaskBadgeRow, TaskDue, AuditRowWrap, AuditDot, AuditBody,
  AuditLine, AuditActor, AuditDetail, AuditMeta, AuditProject,
  StatGrid, StatTile, StatValue, StatLabel,
} from './styles/DashboardModule.styles';
import { useSortFilter } from '../shared/hooks/useSortFilter';
import { usePagination } from '../shared/hooks/usePagination';
import { SortSelect, FilterSelect, LoadMoreBar } from '../shared/components/TableControls';

function priorityColor(theme, v) {
  return { Critical: theme.colors.danger, High: theme.colors.espresso, Medium: theme.colors.info, Low: theme.colors.ash }[v] || theme.colors.ash;
}
// 'Ongoing' was theme.colors.info (blue) — an unrelated cool accent next
// to the PM module's phase tiles, which are copper/espresso-tinted. Using
// copper here instead ties the dashboard's task-status coloring back to
// the same warm palette the PM board itself uses, instead of introducing
// a competing hue nothing else in the app carries.
// 'To Do' was flat ash grey — the one status with no actual color at all,
// reading as lifeless next to Ongoing (copper)/Blocked (red)/Complete
// (green). Info (a cool blue) gives it real color while staying visually
// distinct from the other three semantic colors already in use here.
function taskStatusStyle(theme, v) {
  const map = {
    'To Do':   { bg:`${theme.colors.info}1a`,     color: theme.colors.info,    border:`${theme.colors.info}40` },
    'Ongoing': { bg:`${theme.colors.copper}1a`,   color: theme.colors.copper,  border:`${theme.colors.copper}40` },
    'Blocked': { bg:`${theme.colors.danger}1a`,   color: theme.colors.danger,  border:`${theme.colors.danger}40` },
    'Complete':{ bg:`${theme.colors.success}1a`,  color: theme.colors.success, border:`${theme.colors.success}40` },
  };
  return map[v] || map['To Do'];
}
function reqStatusStyle(theme, v) {
  const map = {
    Pending: { bg:`${theme.colors.warning}1a`, color: theme.colors.warning, border:`${theme.colors.warning}40` },
    Accepted:{ bg:`${theme.colors.success}1a`, color: theme.colors.success, border:`${theme.colors.success}40` },
    Declined:{ bg:`${theme.colors.danger}1a`,  color: theme.colors.danger,  border:`${theme.colors.danger}40` },
  };
  return map[v] || map.Pending;
}

// ── Atoms ──────────────────────────────────────────────────────────────────────
function PriorityChip({ v }) {
  const theme = useTheme();
  const c = priorityColor(theme, v);
  return <Chip color={c} border={c}>{v}</Chip>;
}
function TaskStatusChip({ v }) {
  const theme = useTheme();
  const s = taskStatusStyle(theme, v);
  return <Chip bg={s.bg} color={s.color} border={s.border}>{v}</Chip>;
}
function ReqStatusChip({ v }) {
  const theme = useTheme();
  const s = reqStatusStyle(theme, v);
  return <Chip bg={s.bg} color={s.color} border={s.border}>{v}</Chip>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' });
}
function fmtRel(d) {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m <  1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return dy === 1 ? 'yesterday' : `${dy}d ago`;
}
// Exact timestamp for a hover tooltip on relative-time labels ("3m ago",
// "6d ago") — relative time is the right default for scanning a feed, but
// without this there was no way to see precisely when something happened.
function fmtExact(d) {
  if (!d) return '';
  return new Date(d).toLocaleString([], { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function overdue(d) { return d && new Date(d) < new Date(); }

function navigateToProject(projectId) {
  window.dispatchEvent(new CustomEvent('navigate-to-module', { detail: { moduleId: 'project-management' } }));
  // Small delay so the module mounts before it receives the open-project event
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-project', { detail: { projectId } }));
  }, 80);
}

// Just switches to the Projects module and lands on its list view — no
// specific project to jump into, unlike navigateToProject above.
function navigateToProjectsList() {
  window.dispatchEvent(new CustomEvent('navigate-to-module', { detail: { moduleId: 'project-management' } }));
}

// ── Audit action humanizer ─────────────────────────────────────────────────────
function auditText({ entityType, action, fieldChanged, oldValue, newValue, actorName }) {
  const who = actorName || 'Someone';
  const et  = (entityType || 'item').replace(/_/g, ' ');
  switch (action) {
    case 'created':             return [who, `created a ${et}`];
    case 'deleted':             return [who, `deleted a ${et}`];
    case 'updated':
    case 'status_changed':
      if (fieldChanged === 'status' || action === 'status_changed')
        return [who, `changed ${et} status`, `${oldValue} → ${newValue}`];
      if (fieldChanged === 'priority')
        return [who, `changed ${et} priority`, `${oldValue} → ${newValue}`];
      if (fieldChanged)
        return [who, `updated ${et} ${fieldChanged.replace(/_/g,' ')}`];
      return [who, `updated a ${et}`];
    case 'member_added':        return [who, 'added a member'];
    case 'member_removed':      return [who, 'removed a member'];
    case 'role_changed':        return [who, 'changed a member role'];
    case 'assignment_accepted': return [who, 'accepted a task assignment'];
    case 'assignment_declined': return [who, 'declined a task assignment'];
    case 'assignee_requested':  return [who, 'requested a task assignment'];
    case 'dependency_added':    return [who, 'added a task dependency'];
    case 'dependency_removed':  return [who, 'removed a task dependency'];
    default:                    return [who, action.replace(/_/g,' '), `on a ${et}`];
  }
}

// ── Section heading ────────────────────────────────────────────────────────────
function SectionHead({ title, pill, pillBg }) {
  return (
    <SectionHeadRow>
      <SectionTitle>{title}</SectionTitle>
      {pill != null && <SectionPill bg={pillBg}>{pill}</SectionPill>}
    </SectionHeadRow>
  );
}

function Empty({ text }) { return <EmptyText>{text}</EmptyText>; }

// ── Request card ───────────────────────────────────────────────────────────────
function RequestCardView({ req, onAccept, onDecline, acting }) {
  const isPending = req.status === 'Pending';
  return (
    <RequestCard pending={isPending}>
      <ReqHeaderRow>
        <div style={{ flex:1, minWidth:0 }}>
          <ReqName>{req.taskName}</ReqName>
          <ReqBreadcrumb>
            {[req.projectName, req.phaseName, req.activityName].filter(Boolean).join(' › ')}
          </ReqBreadcrumb>
        </div>
        <ReqStatusChip v={req.status} />
      </ReqHeaderRow>
      <ReqMetaRow pending={isPending}>
        <PriorityChip v={req.priority} />
        {req.dueDate && (
          <ReqMeta>Due <ReqMetaStrong>{fmtDate(req.dueDate)}</ReqMetaStrong></ReqMeta>
        )}
        <ReqMeta pushRight>by <ReqMetaStrong>{req.requestedByName}</ReqMetaStrong></ReqMeta>
      </ReqMetaRow>
      {isPending && req.taskDescription && (
        <ReqDescription>{req.taskDescription}</ReqDescription>
      )}
      {isPending ? (
        <ReqActions>
          <AcceptBtn onClick={() => onAccept(req.requestId)} disabled={acting === req.requestId}>
            {acting === req.requestId ? 'Saving…' : '✓ Accept'}
          </AcceptBtn>
          <DeclineBtn onClick={() => onDecline(req.requestId)} disabled={acting === req.requestId}>
            ✕ Decline
          </DeclineBtn>
        </ReqActions>
      ) : req.respondedAt && (
        <RespondedNote>
          {req.status === 'Accepted' ? 'Accepted' : 'Declined'} <span title={fmtExact(req.respondedAt)}>{fmtRel(req.respondedAt)}</span>
        </RespondedNote>
      )}
    </RequestCard>
  );
}

// ── Active task row (clickable → opens project) ────────────────────────────────
function ActiveTaskRow({ task, isLast }) {
  const od = overdue(task.dueDate) && task.status !== 'Complete';
  return (
    <>
      <TaskRowBtn onClick={() => navigateToProject(task.projectId)}>
        <TaskLeft>
          <TaskName>{task.taskName}</TaskName>
          <TaskBreadcrumb>{task.projectName} › {task.activityName}</TaskBreadcrumb>
        </TaskLeft>
        <TaskRight>
          <TaskBadgeRow>
            <PriorityChip v={task.priority} />
            <TaskStatusChip v={task.status} />
          </TaskBadgeRow>
          {task.dueDate && (
            <TaskDue overdue={od}>{od ? '⚠ ' : ''}{fmtDate(task.dueDate)}</TaskDue>
          )}
        </TaskRight>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" style={{ flexShrink:0, color:'inherit', opacity:0.5 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </TaskRowBtn>
      {!isLast && <HrLine />}
    </>
  );
}

// ── Attention row — org-style insight, but scoped to the user's own
// projects: blocked/overdue tasks anywhere they're involved, not just tasks
// assigned to them (a Manager needs to see their team's blockers too). ──────
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
          stroke="currentColor" strokeWidth="2" style={{ flexShrink:0, color:'inherit', opacity:0.5 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </TaskRowBtn>
      {!isLast && <HrLine />}
    </>
  );
}

// ── Audit row ──────────────────────────────────────────────────────────────────
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

// ── Tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <TabBarRow>
      {tabs.map(({ key, label, count }) => {
        const on = active === key;
        return (
          <TabBtn key={key} active={on} onClick={() => onChange(key)}>
            {label}
            {count != null && <TabCount active={on}>({count})</TabCount>}
          </TabBtn>
        );
      })}
    </TabBarRow>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export default function DashboardModule({ currentUser }) {
  // Admins aren't assignees or members anywhere — every section below
  // (Task Requests, My Active Tasks, Recent Project Activity) is scoped to
  // the logged-in user's own project involvement and would render entirely
  // empty for them. AdminDashboard is a genuinely different view: org-wide
  // project/user/blocker overview instead of "your" work.
  if (currentUser?.userType === 'admin') {
    return <AdminDashboard currentUser={currentUser} />;
  }

  return <DashboardModuleInner currentUser={currentUser} />;
}

function DashboardModuleInner({ currentUser }) {
  const theme = useTheme();
  const attentionRef = useRef(null);
  const [requests,    setRequests]    = useState([]);
  const [activeTasks, setActiveTasks] = useState([]);
  const [auditFeed,   setAuditFeed]   = useState([]);
  const [projects,    setProjects]    = useState([]);
  const [attention,   setAttention]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState(null);
  const [error,       setError]       = useState('');
  // Default tab is 'All' — shows everything at a glance on load
  const [filter,      setFilter]      = useState('All');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [reqs, tasks, audit, projs, attn] = await Promise.all([
        requestApi.getMyRequests(),
        taskApi.getMyActiveTasks(),
        taskApi.getMyRecentAudit(),
        projectApi.list(),
        taskApi.getMyProjectsOverdueBlocked(),
      ]);
      setRequests(reqs);
      setActiveTasks(tasks);
      setAuditFeed(audit);
      setProjects(projs);
      setAttention(attn);
    } catch { setError('Failed to load dashboard data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAccept = async (requestId) => {
    setActing(requestId);
    try {
      await requestApi.accept(requestId);
      setRequests(p => p.map(r => r.requestId === requestId
        ? { ...r, status:'Accepted', respondedAt:new Date().toISOString() } : r));
      taskApi.getMyActiveTasks().then(setActiveTasks).catch(()=>{});
    } catch (err) { setError(err?.response?.data?.error || 'Failed to accept.'); }
    finally { setActing(null); }
  };

  const handleDecline = async (requestId) => {
    setActing(requestId);
    try {
      await requestApi.decline(requestId);
      setRequests(p => p.map(r => r.requestId === requestId
        ? { ...r, status:'Declined', respondedAt:new Date().toISOString() } : r));
    } catch (err) { setError(err?.response?.data?.error || 'Failed to decline.'); }
    finally { setActing(null); }
  };

  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const overdueCount = activeTasks.filter(t => overdue(t.dueDate) && t.status !== 'Complete').length;
  const filtered     = filter === 'All' ? requests : requests.filter(r => r.status === filter);
  const displayName  = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
                     || currentUser?.username || 'there';
  const blockedCount     = attention.filter(t => t.status === 'Blocked').length;
  const attnOverdueCount = attention.filter(t => t.isOverdue).length;

  // ── Task Requests: sort on top of the existing status-tab filter (the
  // TabBar above already filters by status — this was the one section with
  // literally zero sort control, only the tabs). Named reqSort* to avoid
  // colliding with the tab bar's own `filter`/`setFilter` state.
  const {
    items: sortedRequests, sortKey: reqSortKey, setSortKey: setReqSortKey,
    sortDir: reqSortDir, toggleSortDir: toggleReqSortDir,
  } = useSortFilter(filtered, {
    sorters: {
      due:  (a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime(),
      name: (a, b) => (a.taskName || '').localeCompare(b.taskName || ''),
    },
    defaultSortKey: 'due',
  });

  // ── My Active Tasks: sort by due date/priority/status/name, filter by status/priority
  const PRIORITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];
  const activeTaskStatusOptions = useMemo(() => [...new Set(activeTasks.map(t => t.status).filter(Boolean))].map(s => ({ value: s, label: s })), [activeTasks]);
  const {
    items: sortedActiveTasks, sortKey: atSortKey, setSortKey: setAtSortKey,
    sortDir: atSortDir, toggleSortDir: toggleAtSortDir, filters: atFilters, setFilter: setAtFilter,
  } = useSortFilter(activeTasks, {
    sorters: {
      due:      (a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime(),
      priority: (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
      status:   (a, b) => (a.status || '').localeCompare(b.status || ''),
      name:     (a, b) => (a.taskName || '').localeCompare(b.taskName || ''),
    },
    defaultSortKey: 'due',
    filters: {
      status:   { predicate: (t, v) => t.status === v },
      priority: { predicate: (t, v) => t.priority === v },
    },
  });

  // ── Needs Attention: sort by due date, filter by status/overdue — same
  // status/overdueOnly dimensions as AdminDashboard's version, so the two
  // stat tiles below can pre-filter this section to what was clicked
  // instead of just scrolling to an unfiltered list.
  const attentionStatusOptions = useMemo(() => [...new Set(attention.map(t => t.status).filter(Boolean))].map(s => ({ value: s, label: s })), [attention]);
  const {
    items: sortedAttention, sortKey: attnSortKey, setSortKey: setAttnSortKey,
    sortDir: attnSortDir, toggleSortDir: toggleAttnSortDir, filters: attnFilters, setFilter: setAttnFilter, clearFilters: clearAttnFilters,
  } = useSortFilter(attention, {
    sorters: { due: (a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime() },
    defaultSortKey: 'due',
    filters: {
      status:      { predicate: (t, v) => t.status === v },
      overdueOnly: { predicate: (t) => !!t.isOverdue },
    },
  });

  // ── Recent Project Activity: sort/filter + real pagination (was a
  // hardcoded slice(0,50) with no way to reach anything past it).
  const auditActionOptions = useMemo(() => [...new Set(auditFeed.map(e => e.action).filter(Boolean))].map(a => ({ value: a, label: a })), [auditFeed]);
  const { items: sortedAudit, sortDir: auditSortDir, toggleSortDir: toggleAuditSortDir, filters: auditFilters, setFilter: setAuditFilter } = useSortFilter(auditFeed, {
    sorters: { time: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() },
    filters: { action: { predicate: (e, v) => e.action === v } },
    defaultSortKey: 'time',
    defaultSortDir: 'desc',
  });
  const { pageItems: auditPage, hasMore: auditHasMore, loadMore: auditLoadMore, total: auditTotal } = usePagination(sortedAudit, 25);

  // Tab order: All | Accepted | Declined | Pending
  const reqTabs = [
    { key:'All',      label:'All' },
    { key:'Accepted', label:'Accepted', count:requests.filter(r=>r.status==='Accepted').length },
    { key:'Declined', label:'Declined', count:requests.filter(r=>r.status==='Declined').length },
    { key:'Pending',  label:'Pending',  count:requests.filter(r=>r.status==='Pending').length  },
  ];

  // ── Layout: the outer wrapper fills erp-main exactly, no outer scroll ─────
  return (
    <Wrap>

      {/* Page header — fixed height */}
      <Header>
        <Title>Good {timeOfDay()}, {displayName}</Title>
        <Subtitle>Overview of your tasks, assignments and recent project activity.</Subtitle>
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </Header>

      {/* Body — scrollable */}
      {loading ? (
        <LoadingWrap>Loading…</LoadingWrap>
      ) : (
        <>
          <StatGrid>
            <StatTile clickable onClick={navigateToProjectsList} title="Open Projects">
              <StatValue>{projects.length}</StatValue>
              <StatLabel>My Projects</StatLabel>
            </StatTile>
            <StatTile clickable={pendingCount > 0} accent={pendingCount ? theme.colors.warning : undefined} onClick={() => pendingCount && setFilter('Pending')}>
              <StatValue accent={pendingCount ? theme.colors.warning : undefined}>{pendingCount}</StatValue>
              <StatLabel>Pending Requests</StatLabel>
            </StatTile>
            <StatTile>
              <StatValue>{activeTasks.length}</StatValue>
              <StatLabel>Active Tasks</StatLabel>
            </StatTile>
            <StatTile accent={overdueCount ? theme.colors.danger : undefined}>
              <StatValue accent={overdueCount ? theme.colors.danger : undefined}>{overdueCount}</StatValue>
              <StatLabel>Overdue (mine)</StatLabel>
            </StatTile>
            {/* Clicking pre-filters the "Needs Attention" section below to
                exactly what was clicked (Blocked / Overdue), then scrolls to
                it — lands on the filtered thing itself, not just the
                general neighborhood of it. */}
            <StatTile clickable={blockedCount > 0} accent={blockedCount ? theme.colors.danger : undefined} onClick={() => { clearAttnFilters(); setAttnFilter('status', 'Blocked'); attentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <StatValue accent={blockedCount ? theme.colors.danger : undefined}>{blockedCount}</StatValue>
              <StatLabel>Blocked in My Projects</StatLabel>
            </StatTile>
            <StatTile clickable={attnOverdueCount > 0} accent={attnOverdueCount ? theme.colors.danger : undefined} onClick={() => { clearAttnFilters(); setAttnFilter('overdueOnly', true); attentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <StatValue accent={attnOverdueCount ? theme.colors.danger : undefined}>{attnOverdueCount}</StatValue>
              <StatLabel>Overdue in My Projects</StatLabel>
            </StatTile>
          </StatGrid>
          <HrLine />

        <BodyGrid>

          {/* ── Left column (scrollable) ── */}
          <LeftCol>

            {/* Task Requests */}
            <Section>
              <SectionHead title="Task Requests" pill={pendingCount > 0 ? pendingCount : null} />
              <TabBar tabs={reqTabs} active={filter} onChange={setFilter} />
              {filtered.length === 0
                ? <Empty text={filter === 'All'
                    ? 'No requests yet.'
                    : `No ${filter.toLowerCase()} requests.`} />
                : (
                  <>
                    {filtered.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:6, margin:'8px 0' }}>
                        <SortSelect value={reqSortKey} onChange={setReqSortKey} dir={reqSortDir} onToggleDir={toggleReqSortDir}
                          options={[{ value:'due', label:'Due Date' }, { value:'name', label:'Task Name' }]} />
                      </div>
                    )}
                    {sortedRequests.map(req => (
                      <RequestCardView key={req.requestId} req={req}
                        onAccept={handleAccept} onDecline={handleDecline} acting={acting} />
                    ))}
                  </>
                )
              }
            </Section>

            {/* Active Tasks */}
            <Section tight>
              <SectionHead title="My Active Tasks"
                pill={overdueCount > 0 ? `${overdueCount} overdue` : null}
                pillBg={theme.colors.danger} />
              {activeTasks.length === 0
                ? <Empty text="No active tasks assigned to you." />
                : (
                  <>
                    {activeTasks.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                        <SortSelect value={atSortKey} onChange={setAtSortKey} dir={atSortDir} onToggleDir={toggleAtSortDir}
                          options={[
                            { value:'due', label:'Due Date' }, { value:'priority', label:'Priority' },
                            { value:'status', label:'Status' }, { value:'name', label:'Name' },
                          ]} />
                        <FilterSelect placeholder="All statuses" value={atFilters.status} onChange={v => setAtFilter('status', v)} options={activeTaskStatusOptions} />
                        <FilterSelect placeholder="All priorities" value={atFilters.priority} onChange={v => setAtFilter('priority', v)} options={PRIORITY_ORDER.map(p => ({ value:p, label:p }))} />
                      </div>
                    )}
                    {sortedActiveTasks.length === 0
                      ? <Empty text="No tasks match the current filters." />
                      : (
                        <CardWrap>
                          {sortedActiveTasks.map((t, i) => (
                            <ActiveTaskRow key={t.taskId} task={t}
                              isLast={i === sortedActiveTasks.length - 1} />
                          ))}
                        </CardWrap>
                      )}
                  </>
                )
              }
              {activeTasks.length > 0 && (
                <p style={{ fontSize:11, color:theme.colors.ashLight, marginTop:8 }}>
                  Click a task to open it in Project Management.
                </p>
              )}
            </Section>

            {/* Needs Attention — blocked/overdue anywhere in MY projects, not
                just tasks assigned to me (useful for Managers watching their
                team's blockers, same framing as the admin dashboard). */}
            <Section tight ref={attentionRef}>
              <SectionHeadRow>
                <SectionTitle>Needs Attention — My Projects</SectionTitle>
                {attention.length > 0 && <SectionPill bg={theme.colors.danger}>{attention.length}</SectionPill>}
              </SectionHeadRow>
              {attention.length === 0
                ? <Empty text="Nothing blocked or overdue across your projects." />
                : (
                  <>
                    {attention.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                        <SortSelect value={attnSortKey} onChange={setAttnSortKey} dir={attnSortDir} onToggleDir={toggleAttnSortDir}
                          options={[{ value:'due', label:'Due Date' }]} />
                        <FilterSelect placeholder="All statuses" value={attnFilters.status} onChange={v => setAttnFilter('status', v)} options={attentionStatusOptions} />
                        <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, cursor:'pointer' }}>
                          <input type="checkbox" checked={!!attnFilters.overdueOnly} onChange={e => setAttnFilter('overdueOnly', e.target.checked || null)} />
                          Overdue only
                        </label>
                        {(attnFilters.status || attnFilters.overdueOnly) && (
                          <button type="button" onClick={clearAttnFilters}
                            style={{ background:'none', border:'none', color:theme.colors.ash, fontSize:11, cursor:'pointer', textDecoration:'underline', padding:0 }}>
                            Clear filters
                          </button>
                        )}
                      </div>
                    )}
                    {sortedAttention.length === 0
                      ? <Empty text="No tasks match the current filters." />
                      : (
                        <CardWrap>
                          {sortedAttention.map((t, i) => (
                            <AttentionTaskRow key={t.taskId} task={t} isLast={i === sortedAttention.length - 1} />
                          ))}
                        </CardWrap>
                      )}
                  </>
                )
              }
            </Section>
          </LeftCol>

          {/* ── Right column — Audit feed (scrollable) ── */}
          <RightCol>
            <SectionHead title="Recent Project Activity" />
            {auditFeed.length === 0
              ? <Empty text="No recent activity across your projects." />
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
              )
            }
          </RightCol>

        </BodyGrid>
        </>
      )}
    </Wrap>
  );
}

function timeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
