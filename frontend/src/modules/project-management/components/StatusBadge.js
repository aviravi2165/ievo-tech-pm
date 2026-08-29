import { StatusPill, InactiveTag } from '../styles/shared.styles';

// Display-only relabeling — the underlying status VALUE ('To Do', 'Ongoing',
// etc.) is unchanged everywhere else (API payloads, the DB's CHECK
// constraints, deriveStatus/deriveProjectStatus's own comparisons all still
// use the original strings); this only swaps what actually renders on
// screen. Centralized here so every status pill in the app (Phase/Activity/
// Task/Project) picks it up automatically. The few other spots that render
// status text OUTSIDE a StatusBadge — TaskItem.js's status <select>
// dropdown, and the sort/filter dropdowns in ActivityRow.js/PhasePanel.js/
// ProjectListPage.js — import statusLabel() below so they stay in sync.
const STATUS_LABELS = {
  'To Do': 'Not Started',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export default function StatusBadge({ status }) {
  if (!status) return null;
  const key = status.toLowerCase().replace(/\s+/g, '-');
  return <StatusPill status={key}>{statusLabel(status)}</StatusPill>;
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
