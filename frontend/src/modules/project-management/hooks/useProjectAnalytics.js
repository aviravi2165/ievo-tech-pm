import { useEffect, useRef, useState } from 'react';
import { phaseApi, activityApi, projectApi } from '../api/projectApi';

const DONE_TASK = 'Complete';

function overdue(task) {
  return task.status !== DONE_TASK && task.dueDate && new Date(task.dueDate) < new Date();
}

// Eagerly fetches every activity + task under the project's phases (in
// parallel, one round-trip per phase then one per activity) and reduces
// them into the aggregates the Analytics tab renders. Phase/Activity list
// pages fetch this data lazily per-row-expand (see PhasePanel.js/
// ActivityRow.js) since a user only ever looks at a few rows at a time —
// Analytics needs the whole tree at once to compute anything meaningful, so
// it can't reuse that lazy pattern. Only runs once `active` (the tab is
// actually selected) and caches after the first load — switching tabs back
// and forth doesn't re-fetch; use `refetch` to force a reload after data
// changes elsewhere.
export function useProjectAnalytics(projectId, phases, active, projectDates = {}) {
  const [state, setState] = useState({ loading: false, error: '', activities: [], tasks: [], completions: {} });
  const loadedRef = useRef(false);

  const load = async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const [actsByPhase, completionRows] = await Promise.all([
        Promise.all(phases.map(p => phaseApi.getActivities(p.phaseId).catch(() => []))),
        projectApi.getTaskCompletions(projectId).catch(() => []),
      ]);
      const allActivities = actsByPhase.flatMap((acts, i) =>
        acts.map(a => ({ ...a, phaseId: phases[i].phaseId, phaseName: phases[i].name }))
      );
      const tasksByActivity = await Promise.all(
        allActivities.map(a => activityApi.getTasks(a.activityId).catch(() => []))
      );
      const allTasks = tasksByActivity.flatMap((tasks, i) =>
        tasks.map(t => ({ ...t, activityId: allActivities[i].activityId, activityName: allActivities[i].name, phaseName: allActivities[i].phaseName }))
      );
      // taskId -> completedAt, from the real status-change audit trail
      // (see auditService.getTaskCompletionDates) — a task can only ever
      // have one "most recent" Complete transition, so this is 1:1.
      const completions = {};
      completionRows.forEach(r => { completions[r.taskId] = r.completedAt; });
      setState({ loading: false, error: '', activities: allActivities, tasks: allTasks, completions });
      loadedRef.current = true;
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: 'Failed to load analytics data.' }));
    }
  };

  useEffect(() => {
    if (!active || loadedRef.current || !phases.length) return;
    load();
    // Deliberately keyed on phases.length, not the phases array itself —
    // this must run once when the tab opens, not re-fetch every time the
    // parent re-renders with a new (but same-content) phases array
    // reference from useProject's polling/socket refetch.
  }, [active, phases.length]);

  const { tasks, activities, completions } = state;

  const totalTasks = tasks.length;
  const completeTasks = tasks.filter(t => t.status === DONE_TASK).length;
  const overdueTasks = tasks.filter(overdue).length;
  const blockedTasks = tasks.filter(t => t.status === 'Blocked').length;

  const statusCounts = ['To Do', 'Ongoing', 'Blocked', 'Complete'].map(status => ({
    status, count: tasks.filter(t => t.status === status).length,
  }));

  const priorityCounts = ['Low', 'Medium', 'High', 'Critical'].map(priority => ({
    priority, count: tasks.filter(t => t.priority === priority).length,
  }));

  // Team workload — group by assignee across every task's accepted assignees.
  const workloadMap = new Map();
  tasks.forEach(t => {
    (t.assignees || []).forEach(a => {
      const key = String(a.userId);
      if (!workloadMap.has(key)) workloadMap.set(key, { userId: a.userId, name: a.name, active: 0, overdue: 0, complete: 0 });
      const w = workloadMap.get(key);
      if (t.status === DONE_TASK) w.complete += 1;
      else w.active += 1;
      if (overdue(t)) w.overdue += 1;
    });
  });
  const workload = [...workloadMap.values()].sort((a, b) => (b.active + b.overdue) - (a.active + a.overdue));

  // Completions over the last 6 weeks, bucketed by week-of — now from the
  // real completedAt timestamp (most recent 'status_changed' → Complete
  // audit row per task, see auditService.getTaskCompletionDates), not
  // dueDate. dueDate was only ever a proxy because no one was tracking a
  // real completion moment; the audit trail already had one all along.
  // A completed task with no matching audit row (e.g. seeded/imported data
  // predating this trail) falls back to dueDate so it isn't just dropped.
  const now = new Date();
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const end = new Date(now); end.setDate(end.getDate() - (5 - i) * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return { start, end, count: 0 };
  });
  tasks.forEach(t => {
    if (t.status !== DONE_TASK) return;
    const completedAt = completions[t.taskId] || t.dueDate;
    if (!completedAt) return;
    const d = new Date(completedAt);
    const bucket = weeks.find(w => d >= w.start && d <= w.end);
    if (bucket) bucket.count += 1;
  });

  // On-time vs late — completedAt vs dueDate for every Complete task that
  // has both. Only meaningful with a real completedAt (comparing dueDate
  // to itself is trivially "on time"), so tasks without an audit row are
  // excluded here rather than falling back like the week-bucket chart does.
  //
  // totalLateDays feeds an "avg Nd late" figure alongside the Late count —
  // this is the one place "how late" survives past completion. The live
  // Overdue/Delayed badges on a Task/Activity/Phase/Project row intentionally
  // go silent the moment something's marked Complete (nothing left to act
  // on), so "was this late, and by how much" is a reporting question that
  // belongs here, not a live warning that belongs on the row.
  let onTimeCount = 0, lateCount = 0, totalLateDays = 0;
  tasks.forEach(t => {
    if (t.status !== DONE_TASK || !t.dueDate || !completions[t.taskId]) return;
    const completedAt = new Date(completions[t.taskId]);
    const dueDate = new Date(t.dueDate);
    if (completedAt <= dueDate) {
      onTimeCount += 1;
    } else {
      lateCount += 1;
      totalLateDays += Math.round((completedAt - dueDate) / 86400000);
    }
  });
  const avgLateDays = lateCount ? Math.round(totalLateDays / lateCount) : 0;

  // Burn-up — cumulative Complete tasks over the project's full planned
  // span (not just the last-6-weeks window the velocity bars above use),
  // bucketed into a fixed number of points so the chart stays readable
  // regardless of how long the project actually runs. "Ideal" is only
  // drawn when both planned dates exist — a straight reference line from 0
  // at plannedStart to totalTasks at plannedEnd; "Actual" is real
  // cumulative completions to date, same completedAt-with-dueDate-fallback
  // rule the weekly bars use.
  const BURNUP_POINTS = 10;
  const { plannedStart, plannedEnd } = projectDates;
  let burnup = [];
  const completionDates = tasks
    .filter(t => t.status === DONE_TASK && (completions[t.taskId] || t.dueDate))
    .map(t => new Date(completions[t.taskId] || t.dueDate))
    .filter(d => !isNaN(d));
  const earliestCompletion = completionDates.length ? new Date(Math.min(...completionDates)) : null;
  const rangeStart = plannedStart ? new Date(plannedStart) : earliestCompletion;
  const plannedEndDate = plannedEnd ? new Date(plannedEnd) : null;
  const rangeEnd = plannedEndDate && plannedEndDate > now ? plannedEndDate : now;

  if (rangeStart && rangeEnd > rangeStart && totalTasks > 0) {
    const span = rangeEnd - rangeStart;
    burnup = Array.from({ length: BURNUP_POINTS }, (_, i) => {
      const date = new Date(rangeStart.getTime() + (span * i) / (BURNUP_POINTS - 1));
      const actual = tasks.filter(t => {
        if (t.status !== DONE_TASK) return false;
        const completedAt = completions[t.taskId] || t.dueDate;
        return completedAt && new Date(completedAt) <= date;
      }).length;
      const ideal = (plannedStart && plannedEndDate)
        ? Math.round(totalTasks * Math.min(1, Math.max(0, (date - rangeStart) / (plannedEndDate - rangeStart))))
        : null;
      return { date, actual, ideal };
    });
  }

  return {
    loading: state.loading,
    error: state.error,
    activities,
    tasks,
    refetch: () => { loadedRef.current = false; load(); },
    stats: {
      totalTasks, completeTasks, overdueTasks, blockedTasks,
      totalActivities: activities.length,
      statusCounts, priorityCounts, workload, weeks,
      onTimeCount, lateCount, avgLateDays,
      burnup,
    },
  };
}
