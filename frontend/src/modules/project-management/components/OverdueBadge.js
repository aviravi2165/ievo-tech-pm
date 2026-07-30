import { AlertCircle } from 'lucide-react';
import { OverdueText } from '../styles/shared.styles';

// `days` — how many days past its OWN planned_end/due_date (see
// delayService.getOverdueDays). Optional so existing callers that don't
// have the number yet still render a plain "Overdue"; every current caller
// (Project/Phase/Activity) does pass it, giving Overdue the same real
// magnitude Delayed and Task lateness already show, instead of a bare label.
export default function OverdueBadge({ days } = {}) {
  return (
    <OverdueText title={days > 0 ? `${days} day${days === 1 ? '' : 's'} past its own planned end date` : undefined}>
      <AlertCircle size={11} strokeWidth={2.5} />
      {days > 0 ? `Overdue by ${days}d` : 'Overdue'}
    </OverdueText>
  );
}
