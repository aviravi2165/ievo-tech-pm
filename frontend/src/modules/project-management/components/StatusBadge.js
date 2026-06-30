export default function StatusBadge({ status, size = 'sm' }) {
  if (!status) return null;
  const cls = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`pm-status ${cls}`}>{status}</span>;
}
