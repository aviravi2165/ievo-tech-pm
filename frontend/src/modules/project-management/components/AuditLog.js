import { useEffect, useState } from 'react';
import { useTheme } from '@emotion/react';
import { projectApi } from '../api/projectApi';
import { Audit, AuditRow, AuditTime, AuditWho, AuditText } from '../styles/shared.styles';

function fmtDate(d) {
  return new Date(d).toLocaleString([], { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

export default function AuditLog({ projectId }) {
  const theme = useTheme();
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectApi.getAudit(projectId)
      .then(setLog)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div style={{ color:theme.colors.ash, fontSize:13 }}>Loading audit log…</div>;
  if (!log.length) return <div style={{ color:theme.colors.ash, fontSize:13 }}>No audit entries yet.</div>;

  return (
    <Audit>
      {log.map(entry => (
        <AuditRow key={entry.id}>
          <AuditTime>{fmtDate(entry.changedAt)}</AuditTime>
          <AuditWho>{entry.userName || '—'}</AuditWho>
          <AuditText>
            <strong>{entry.entityType}</strong> #{entry.entityId} — {entry.action}
            {entry.fieldChanged && <> · <em>{entry.fieldChanged}</em></>}
            {entry.oldValue && <> from <code>{entry.oldValue}</code></>}
            {entry.newValue && <> → <code>{entry.newValue}</code></>}
          </AuditText>
        </AuditRow>
      ))}
    </Audit>
  );
}
