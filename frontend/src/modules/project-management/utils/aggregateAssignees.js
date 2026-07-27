// Shared by ParticipantsPanel usage at Activity/Phase/Project level — rolls
// a flat task list up into "who's actually assigned to something in this
// scope," deduplicated by user (someone assigned to 5 tasks across 3
// different activities shows up ONCE here with taskCount:5, not 5 times).
// A Manager who's also personally assigned to a task still shows up here
// too — this list and the Managers list are independent, never filtered
// against each other.
export function aggregateAssignees(tasks) {
  const map = new Map();
  tasks.forEach(t => (t.assignees || []).forEach(a => {
    const key = String(a.userId);
    if (!map.has(key)) map.set(key, { userId: a.userId, name: a.name, taskCount: 0 });
    map.get(key).taskCount += 1;
  }));
  return [...map.values()].sort((a, b) => b.taskCount - a.taskCount);
}
