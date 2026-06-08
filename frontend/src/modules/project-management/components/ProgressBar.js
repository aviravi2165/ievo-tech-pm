export default function ProgressBar({ value = 0 }) {
  return (
    <div className="pm-progress-wrap">
      <div className="pm-progress-bar">
        <div className="pm-progress-fill" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="pm-progress-label">{value}%</span>
    </div>
  );
}
