import { PriorityPill } from '../styles/shared.styles';

export default function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <PriorityPill priority={priority.toLowerCase()}>{priority}</PriorityPill>;
}
