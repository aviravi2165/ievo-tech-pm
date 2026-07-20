import { useState, useEffect, useCallback } from 'react';
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
// User management is a modal opened from TopBanner (admin-only icon), not a
// routed module — there's no 'users' entry in ERP_MODULES to navigate to.
function openUserManagement() {
  window.dispatchEvent(new CustomEvent('open-user-management'));
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
            <StatTile clickable accent={overdueProjects.length ? theme.colors.danger : undefined} onClick={navigateToPM}>
              <StatValue accent={overdueProjects.length ? theme.colors.danger : undefined}>{overdueProjects.length}</StatValue>
              <StatLabel>Overdue Projects</StatLabel>
            </StatTile>
            <StatTile accent={theme.colors.success}>
              <StatValue accent={theme.colors.success}>{activeProjects.length}</StatValue>
              <StatLabel>Active Projects</StatLabel>
            </StatTile>
            <StatTile clickable accent={blockedCount ? theme.colors.danger : undefined} onClick={() => attention[0] && navigateToProject(attention[0].projectId)}>
              <StatValue accent={blockedCount ? theme.colors.danger : undefined}>{blockedCount}</StatValue>
              <StatLabel>Blocked Tasks</StatLabel>
            </StatTile>
            <StatTile clickable accent={overdueTaskCount ? theme.colors.danger : undefined} onClick={() => attention[0] && navigateToProject(attention[0].projectId)}>
              <StatValue accent={overdueTaskCount ? theme.colors.danger : undefined}>{overdueTaskCount}</StatValue>
              <StatLabel>Overdue Tasks</StatLabel>
            </StatTile>
            <StatTile clickable onClick={openUserManagement}>
              <StatValue>{userCounts?.active ?? '—'}</StatValue>
              <StatLabel>Active Users</StatLabel>
            </StatTile>
          </StatGrid>
          <HrLine />

          <BodyGrid>
            {/* ── Left column ── */}
            <LeftCol>
              <Section>
                <SectionHeadRow>
                  <SectionTitle>Needs Attention</SectionTitle>
                  {attention.length > 0 && <SectionPill bg={theme.colors.danger}>{attention.length}</SectionPill>}
                </SectionHeadRow>
                {attention.length === 0
                  ? <EmptyText>Nothing blocked or overdue across any project. 🎉</EmptyText>
                  : (
                    <CardWrap>
                      {attention.map((t, i) => (
                        <AttentionTaskRow key={t.taskId} task={t} isLast={i === attention.length - 1} />
                      ))}
                    </CardWrap>
                  )}
              </Section>

              {overdueProjects.length > 0 && (
                <Section tight>
                  <SectionHeadRow>
                    <SectionTitle>Overdue Projects</SectionTitle>
                    <SectionPill bg={theme.colors.danger}>{overdueProjects.length}</SectionPill>
                  </SectionHeadRow>
                  <CardWrap>
                    {overdueProjects.map((p, i) => (
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
                    onClick={openUserManagement}
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
                    <CardWrap>
                      {auditFeed.slice(0, 50).map((e, i) => (
                        <AuditRow key={e.id} entry={e} isLast={i === Math.min(auditFeed.length, 50) - 1} />
                      ))}
                    </CardWrap>
                  )}
              </Section>
            </RightCol>
          </BodyGrid>
        </>
      )}
    </Wrap>
  );
}
