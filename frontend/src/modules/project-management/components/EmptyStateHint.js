/**
 * EmptyStateHint — quiet "nothing added here yet" note, shown in the Status
 * column (not Dates, where Overdue/Delayed badges already live — stacking
 * both there crowded the column and read as contradictory, e.g. an overdue
 * badge next to a note saying there's nothing to be overdue on).
 *
 * Unlike isOverdue, this is NOT gated on the planned end date having
 * passed — it's a structural fact ("blank"), true from the moment the
 * container is created, not only once it's late. See emptyState on the
 * Activity/Phase/Project row payloads (activityService/phaseService/
 * projectService), which is `null` once there's at least one ACTIVE task
 * somewhere underneath.
 *
 * "Active" is the operative word in the copy below, not just decoration —
 * progressService's getActivityHasTasks/getPhaseHasTasks/getProjectHasTasks
 * and getPhaseActivityCount/getProjectPhaseCount only count is_active=1
 * rows. A deactivated ("deleted") task/activity/phase still has a live row
 * in the database, so plain "No tasks yet" would be misleading — there
 * really is a task/activity there, it's just inactive. "No active tasks
 * yet" says exactly what's true.
 */
const COPY = {
  noTasks: { text: 'No active tasks yet', title: 'Nothing active has been added under this yet.' },
  noActivities: { text: 'No active activities yet', title: 'This phase has no active activities yet.' },
  noPhases: { text: 'No active phases yet', title: 'This project has no active phases yet.' },
};

export default function EmptyStateHint({ emptyState, theme }) {
  const copy = emptyState && COPY[emptyState];
  if (!copy) return null;
  return (
    <span style={{ fontSize: 9, color: theme.colors.ash, fontStyle: 'italic', whiteSpace: 'nowrap' }} title={copy.title}>
      {copy.text}
    </span>
  );
}
