import { AlertCircle } from 'lucide-react';
import { OverdueText } from '../styles/shared.styles';

export default function OverdueBadge() {
  return (
    <OverdueText>
      <AlertCircle size={11} strokeWidth={2.5} />
      Overdue
    </OverdueText>
  );
}
