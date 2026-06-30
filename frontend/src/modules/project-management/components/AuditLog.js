import { useEffect, useState } from 'react';
import { projectApi } from '../api/projectApi';

function fmtDate(d) {
  return new Date(d).toLocaleString([], { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

export default function AuditLog({ projectId }) {
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectApi.getAudit(projectId)
      .then(setLog)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div style={{ color:'var(--muted)', fontSize:13 }}>Loading audit log…</div>;
  if (!log.length) return <div style={{ color:'var(--muted)', fontSize:13 }}>No audit entries yet.</div>;

  return (
    <div className="pm-audit">
      {log.map(entry => (
        <div key={entry.id} className="pm-audit-row">
          <span className="pm-audit-time">{fmtDate(entry.changedAt)}</span>
          <span className="pm-audit-who">{entry.userName || '—'}</span>
          <span className="pm-audit-text">
            <strong>{entry.entityType}</strong> #{entry.entityId} — {entry.action}
            {entry.fieldChanged && <> · <em>{entry.fieldChanged}</em></>}
            {entry.oldValue && <> from <code>{entry.oldValue}</code></>}
            {entry.newValue && <> → <code>{entry.newValue}</code></>}
          </span>
        </div>
      ))}
    </div>
  );
}
