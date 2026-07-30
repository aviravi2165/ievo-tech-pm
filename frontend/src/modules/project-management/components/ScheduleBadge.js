/**
 * ScheduleBadge — ONE badge per Activity/Phase row, not two stacked.
 *
 * Overdue (isOverdue — incomplete past this entity's OWN planned_end) and
 * Delayed (delayDays — a CHILD is running late, see delayService.js) stay
 * two distinct facts, but showing both as separate full-weight badges read
 * as redundant/alarming on a dense row (they're often close in magnitude
 * since a child's lateness is frequently *why* the parent went overdue in
 * the first place). Overdue leads — it's the more direct, self-contained,
 * immediately actionable fact — and Delayed's number is folded into the
 * tooltip rather than dropped. When only one applies, that one shows alone.
 *
 * The "empty" case (nothing added under this yet) lives in EmptyStateHint
 * (./EmptyStateHint.js) instead, rendered in the Status column — it used to
 * live here in the Dates column, but that's exactly where these Overdue/
 * Delayed badges also render, so an empty-but-overdue row could show both
 * stacked and crowd the column this was built to avoid crowding in the
 * first place.
 */
import DelayBadge from './DelayBadge';
import { LateTag } from '../styles/shared.styles';

export default function ScheduleBadge({ isOverdue, overdueDays, delayDays, delayLabel = 'Late by' }) {
  const delayed = delayDays > 0;
  if (!isOverdue && !delayed) return null;

  if (isOverdue) {
    const label = overdueDays > 0 ? `Overdue by ${overdueDays}d` : 'Overdue';
    const title = delayed
      ? `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} on its own schedule — also running ${delayDays} day${delayDays === 1 ? '' : 's'} behind because of a late task underneath it.`
      : `${overdueDays} day${overdueDays === 1 ? '' : 's'} past its own planned end date.`;
    return (
      <LateTag style={{ whiteSpace: 'nowrap' }} title={title}>
        ⚠ {label}
      </LateTag>
    );
  }

  return <DelayBadge days={delayDays} label={delayLabel} />;
}
