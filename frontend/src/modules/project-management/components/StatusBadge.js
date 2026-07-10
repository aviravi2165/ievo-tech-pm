import { StatusPill, InactiveTag } from '../styles/shared.styles';

export default function StatusBadge({ status }) {
  if (!status) return null;
  const key = status.toLowerCase().replace(/\s+/g, '-');
  return <StatusPill status={key}>{status}</StatusPill>;
}

// Separate from status — an entity can be e.g. Completed but Inactive at
// the same time (deactivated because a parent still has other children).
export function InactiveBadge() {
  return (
    <InactiveTag title="Inactive — has children, frozen from edits until reactivated">
      Inactive
    </InactiveTag>
  );
}
