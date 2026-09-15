import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { dateChangeRequestApi } from '../project-management/api/projectApi';
import { showToast, apiErrorMessage } from '../project-management/hooks/toastStore';
import { BtnPrimary, BtnGhost, Empty } from '../project-management/styles/shared.styles';

const FIELD_LABEL = { plannedStart: 'start date', plannedEnd: 'end date', startDate: 'start date', dueDate: 'due date' };
const ENTITY_LABEL = { project: 'Project', phase: 'Phase', activity: 'Activity', task: 'Task' };
const STATUS_COLOR = { pending: 'copper', approved: 'success', rejected: 'danger', cancelled: 'ash' };

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
    <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '12px 14px', marginBottom: 10, background: theme.colors.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 10.5, color: theme.colors.espresso, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 2 }}>{r.projectName}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.onyx }}>{ENTITY_LABEL[r.entityType] || r.entityType}: {r.entityName}</div>
        </div>
        <StatusPill status={r.status} theme={theme} />
      </div>
      <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: 4 }}>
        {FIELD_LABEL[r.fieldChanged] || r.fieldChanged}: <strong style={{ color: theme.colors.onyx }}>{fmt(r.oldValue)}</strong> → <strong style={{ color: theme.colors.espresso }}>{fmt(r.newValue)}</strong>
      </div>
      <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: 6, fontStyle: 'italic' }}>"{r.reason}"</div>
      <div style={{ fontSize: 10.5, color: theme.colors.ashLight }}>
        Requested by {r.requestedByName} · {fmtWhen(r.createdAt)}
        {r.status !== 'pending' && r.decidedByName ? ` · decided by ${r.decidedByName}` : ''}
      </div>
      {r.decisionNote && <div style={{ fontSize: 11.5, color: theme.colors.ash, marginTop: 4 }}>Note: {r.decisionNote}</div>}
      {children}
    </div>
  );
}

/**
 * ApprovalsModule — a designated approver's (or admin's) cross-project home
 * for date-change requests. Unlike a project's own "Approvals" tab (scoped
 * to that one project's members), this works regardless of whether the
 * viewer is a member of the project the request came from — which matters
 * now that approvers are a curated, global list (pm_date_approvers), not
 * "any project member". Two sections: what's waiting on you right now, and
 * the full log ("who requested this, and why") of everything ever sent to
 * you.
 */
export default function ApprovalsModule() {
  const theme = useTheme();
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h] = await Promise.all([dateChangeRequestApi.listPending(), dateChangeRequestApi.listHistory()]);
      setPending(p); setHistory(h);
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to load approvals.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (requestId, action) => {
    setBusyId(requestId);
    try {
      await (action === 'approve' ? dateChangeRequestApi.approve(requestId) : dateChangeRequestApi.reject(requestId));
      await load();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to decide this request.')); }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px', background: theme.colors.greige }}>
      <div style={{ fontFamily: theme.font.display, fontSize: 20, fontWeight: 800, color: theme.colors.onyx, marginBottom: 4 }}>Approvals</div>
      <div style={{ fontSize: 12.5, color: theme.colors.ash, marginBottom: 22 }}>
        Date-change requests sent to you, across every project — you don't need to be a member of a project to decide its requests.
      </div>

      {loading ? (
        <div style={{ color: theme.colors.ash, fontSize: 13 }}>Loading…</div>
      ) : (
        <>
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

          <div style={{ fontSize: 11, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', margin: '24px 0 10px' }}>
            Log — everything ever sent to you ({history.length})
          </div>
          {history.length === 0 && <Empty>Nothing here yet.</Empty>}
          {history.map(r => <RequestRow key={r.requestId} r={r} theme={theme} />)}
        </>
      )}
    </div>
  );
}
