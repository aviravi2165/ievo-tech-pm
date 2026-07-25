import { useEffect, useRef, useState } from 'react';
import { phaseApi, activityApi } from '../api/projectApi';

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
export function useProjectAnalytics(phases, active) {
  const [state, setState] = useState({ loading: false, error: '', activities: [], tasks: [] });
  const loadedRef = useRef(false);

  const load = async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const actsByPhase = await Promise.all(
        phases.map(p => phaseApi.getActivities(p.phaseId).catch(() => []))
      );
      const allActivities = actsByPhase.flatMap((acts, i) =>
        acts.map(a => ({ ...a, phaseId: phases[i].phaseId, phaseName: phases[i].name }))
      );
      const tasksByActivity = await Promise.all(
        allActivities.map(a => activityApi.getTasks(a.activityId).catch(() => []))
      );
      const allTasks = tasksByActivity.flatMap((tasks, i) =>
        tasks.map(t => ({ ...t, activityId: allActivities[i].activityId, activityName: allActivities[i].name, phaseName: allActivities[i].phaseName }))
      );
      setState({ loading: false, error: '', activities: allActivities, tasks: allTasks });
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

  const { tasks, activities } = state;

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

  // Completions over the last 6 weeks, bucketed by week-of, from each
  // task's own updatedAt-equivalent — tasks don't carry a completedAt
  // field, so this uses dueDate-independent status alone: we can only
  // bucket what we have, which is "currently Complete" tasks grouped by
  // their due date as a proxy for when that slice of work was scheduled to
  // land, not literally when it was marked done (no per-task completion
  // timestamp exists in this data model — the Audit log has one, but only
  // for entities whose history has already been fetched elsewhere, and
  // fetching per-task history for every task here would be another N
  // requests). Labelled accordingly in the UI so it isn't misread as exact.
  const now = new Date();
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const end = new Date(now); end.setDate(end.getDate() - (5 - i) * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return { start, end, count: 0 };
  });
  tasks.forEach(t => {
    if (t.status !== DONE_TASK || !t.dueDate) return;
    const d = new Date(t.dueDate);
    const bucket = weeks.find(w => d >= w.start && d <= w.end);
    if (bucket) bucket.count += 1;
  });

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
    },
  };
}
