export default function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <span className={`pm-priority ${priority.toLowerCase()}`}>{priority}</span>;
}
