export default function StatusBadge({ status, size = 'sm' }) {
  if (!status) return null;
  const cls = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`pm-status ${cls}`}>{status}</span>;
}

// Separate from status — an entity can be e.g. Completed but Inactive at
// the same time (deactivated because a parent still has other children).
export function InactiveBadge() {
  return (
    <span className="pm-inactive-badge" title="Inactive — has children, frozen from edits until reactivated">
      Inactive
    </span>
  );
}
