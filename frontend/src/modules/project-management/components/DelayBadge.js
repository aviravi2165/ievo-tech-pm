/**
 * DelayBadge — shows how many days something is running behind its own
 * (or, cascaded down, its child's) planned schedule.
 *
 *   <DelayBadge days={project.delayDays} label="Delayed by" />
 *   <DelayBadge days={phase.delayDays}   label="Late by" />
 *   <DelayBadge days={activity.delayDays} label="Late by" />
 *   <DelayBadge days={taskDelayDays}     label="Delayed by" />
 *
 * Renders nothing when there's no delay — this is additive to StatusBadge,
 * not a replacement for it (something can be "In Progress" AND "Late by 3d"
 * at the same time; those are two different facts).
 */
import { LateTag } from '../styles/shared.styles';

export default function DelayBadge({ days, label = 'Delayed by' }) {
  if (!days || days <= 0) return null;
  return (
    <LateTag style={{ whiteSpace: 'nowrap' }}
      title={`${label} ${days} day${days === 1 ? '' : 's'}`}>
      ⚠ {label} {days}d
    </LateTag>
  );
}