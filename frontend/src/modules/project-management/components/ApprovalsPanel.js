import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { dateChangeRequestApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { BtnPrimary, BtnGhost, Empty } from '../styles/shared.styles';

const FIELD_LABEL = { plannedStart: 'start date', plannedEnd: 'end date', startDate: 'start date', dueDate: 'due date' };
const ENTITY_LABEL = { project: 'Project', phase: 'Phase', activity: 'Activity', task: 'Task' };

function fmt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtWhen(d) {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLOR = { pending: 'copper', approved: 'success', rejected: 'danger', cancelled: 'ash' };

function StatusPill({ status, theme }) {
  const color = theme.colors[STATUS_COLOR[status]] || theme.colors.ash;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color, background: `${color}1a`, borderRadius: 10, padding: '2px 8px' }}>
      {status}
    </span>
  );
}

function RequestRow({ r, theme, children }) {
  return (
    <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '10px 12px', marginBottom: 8, background: theme.colors.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.onyx }}>
          {ENTITY_LABEL[r.entityType] || r.entityType}: {r.entityName}
        </div>
        <StatusPill status={r.status} theme={theme} />
      </div>
      <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: 4 }}>
        {FIELD_LABEL[r.fieldChanged] || r.fieldChanged}: <strong style={{ color: theme.colors.onyx }}>{fmt(r.oldValue)}</strong> → <strong style={{ color: theme.colors.espresso }}>{fmt(r.newValue)}</strong>
      </div>
      <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: 6, fontStyle: 'italic' }}>"{r.reason}"</div>
      <div style={{ fontSize: 10.5, color: theme.colors.ashLight }}>
        Requested by {r.requestedByName} for {r.approverName}'s approval · {fmtWhen(r.createdAt)}
        {r.status !== 'pending' && r.decidedByName ? ` · decided by ${r.decidedByName}` : ''}
      </div>
      {r.decisionNote && <div style={{ fontSize: 11.5, color: theme.colors.ash, marginTop: 4 }}>Note: {r.decisionNote}</div>}
      {children}
    </div>
  );
}

/**
 * ApprovalsPanel — the "Approvals" project tab. Two lists, scoped to this
 * project: requests awaiting the viewer's own decision (Approve/Reject), and
 * every request the viewer has raised themselves (any status, for tracking).
 */
export default function ApprovalsPanel({ projectId }) {
  const theme = useTheme();
  const [pending, setPending] = useState([]);
  const [mine,    setMine]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([
        dateChangeRequestApi.listPending(projectId),
        dateChangeRequestApi.listMine(projectId),
      ]);
      setPending(p); setMine(m);
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to load approval requests.')); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const decide = async (requestId, action) => {
    setBusyId(requestId);
    try {
      await (action === 'approve' ? dateChangeRequestApi.approve(requestId) : dateChangeRequestApi.reject(requestId));
      await load();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to decide this request.')); }
    finally { setBusyId(null); }
  };

  const cancelMine = async (requestId) => {
    setBusyId(requestId);
    try { await dateChangeRequestApi.cancel(requestId); await load(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to cancel this request.')); }
    finally { setBusyId(null); }
  };

  if (loading) return <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
        Awaiting your approval ({pending.length})
      </div>
      {pending.length === 0 && <Empty style={{ marginBottom: 24 }}>Nothing waiting on you right now.</Empty>}
      {pending.map(r => (
        <RequestRow key={r.requestId} r={r} theme={theme}>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <BtnPrimary style={{ fontSize: 11, padding: '5px 12px' }} disabled={busyId === r.requestId} onClick={() => decide(r.requestId, 'approve')}>Approve</BtnPrimary>
            <BtnGhost style={{ fontSize: 11, padding: '5px 12px' }} disabled={busyId === r.requestId} onClick={() => decide(r.requestId, 'reject')}>Reject</BtnGhost>
          </div>
        </RequestRow>
      ))}

      <div style={{ fontSize: 11, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', margin: '20px 0 10px' }}>
        Your requests ({mine.length})
      </div>
      {mine.length === 0 && <Empty>You haven't requested any date changes on this project.</Empty>}
      {mine.map(r => (
        <RequestRow key={r.requestId} r={r} theme={theme}>
          {r.status === 'pending' && (
            <div style={{ marginTop: 8 }}>
              <BtnGhost style={{ fontSize: 11, padding: '5px 12px' }} disabled={busyId === r.requestId} onClick={() => cancelMine(r.requestId)}>Cancel request</BtnGhost>
            </div>
          )}
        </RequestRow>
      ))}
    </div>
  );
}
