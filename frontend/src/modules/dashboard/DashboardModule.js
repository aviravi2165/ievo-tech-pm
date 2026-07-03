import { useState, useEffect, useCallback } from 'react';
import { requestApi } from '../project-management/api/projectApi';

// ── Priority badge ─────────────────────────────────────────────────────────────
const PRIORITY_COLOUR = { Critical: '#c00', High: '#c77700', Medium: '#3a7ebf', Low: '#555' };
function PriorityBadge({ priority }) {
  const c = PRIORITY_COLOUR[priority] || '#888';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 8, padding: '1px 7px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>
      {priority}
    </span>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  Pending:  { bg: '#fff8e1', color: '#7a5c00', border: '#f0c419' },
  Accepted: { bg: '#e8faf0', color: '#1a6e36', border: '#86efac' },
  Declined: { bg: '#fdecea', color: '#7b1d1d', border: '#f5c6cb' },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Pending;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '2px 10px', flexShrink: 0 }}>
      {status}
    </span>
  );
}

// ── Date helper ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Single request card ────────────────────────────────────────────────────────
function RequestCard({ req, onAccept, onDecline, acting }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--divider, #e5e5e5)',
      borderRadius: 8, padding: '14px 16px', marginBottom: 10,
      boxShadow: req.status === 'Pending' ? '0 1px 4px rgba(0,0,0,.07)' : 'none',
      opacity: req.status !== 'Pending' ? 0.65 : 1,
      transition: 'opacity .2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1d23', marginBottom: 2 }}>
            {req.taskName}
          </div>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
            <span style={{ color: '#666' }}>{req.projectName}</span>
            {' › '}{req.phaseName}
            {' › '}{req.activityName}
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <PriorityBadge priority={req.priority} />
        {req.dueDate && (
          <span style={{ fontSize: 11, color: '#888' }}>
            Due <strong style={{ color: '#444' }}>{fmtDate(req.dueDate)}</strong>
          </span>
        )}
        <span style={{ fontSize: 11, color: '#aaa' }}>
          Assigned by <strong style={{ color: '#666' }}>{req.requestedByName}</strong>
        </span>
        <span style={{ fontSize: 11, color: '#aaa' }}>
          {fmtDate(req.createdAt)}
        </span>
      </div>

      {/* Task description */}
      {req.taskDescription && (
        <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6, margin: '0 0 10px', borderLeft: '3px solid #e5e5e5', paddingLeft: 10 }}>
          {req.taskDescription}
        </p>
      )}

      {/* Actions — only for Pending */}
      {req.status === 'Pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onAccept(req.requestId)}
            disabled={acting === req.requestId}
            style={{
              padding: '7px 18px', border: 'none', borderRadius: 6,
              background: acting === req.requestId ? '#ccc' : '#1a6e36',
              color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {acting === req.requestId ? 'Saving…' : '✓ Accept'}
          </button>
          <button
            onClick={() => onDecline(req.requestId)}
            disabled={acting === req.requestId}
            style={{
              padding: '7px 18px', border: '1px solid #e5e5e5', borderRadius: 6,
              background: '#fff', color: '#7b1d1d', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            ✕ Decline
          </button>
        </div>
      )}

      {/* Responded-at timestamp */}
      {req.status !== 'Pending' && req.respondedAt && (
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
          {req.status === 'Accepted' ? 'Accepted' : 'Declined'} on {fmtDate(req.respondedAt)}
        </div>
      )}
    </div>
  );
}

// ── Dashboard module ───────────────────────────────────────────────────────────
export default function DashboardModule({ currentUser }) {
  const [requests, setRequests]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [acting,   setActing]     = useState(null); // requestId being accepted/declined
  const [error,    setError]      = useState('');
  const [filter,   setFilter]     = useState('Pending'); // 'All'|'Pending'|'Accepted'|'Declined'

  const fetchRequests = useCallback(async () => {
    setLoading(true); setError('');
    try { setRequests(await requestApi.getMyRequests()); }
    catch { setError('Failed to load task requests.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAccept = async (requestId) => {
    setActing(requestId);
    try {
      await requestApi.accept(requestId);
      setRequests(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'Accepted', respondedAt: new Date().toISOString() } : r));
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to accept request.');
    } finally { setActing(null); }
  };

  const handleDecline = async (requestId) => {
    setActing(requestId);
    try {
      await requestApi.decline(requestId);
      setRequests(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'Declined', respondedAt: new Date().toISOString() } : r));
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to decline request.');
    } finally { setActing(null); }
  };

  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const filtered     = filter === 'All' ? requests : requests.filter(r => r.status === filter);

  const displayName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || currentUser?.username || 'there';

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px', fontFamily: 'inherit' }}>

      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1a1d23', margin: 0, fontFamily: 'Georgia, serif' }}>
          Good {getTimeOfDay()}, {displayName}
        </h1>
        <p style={{ fontSize: 14, color: '#888', margin: '4px 0 0' }}>
          Here are your pending task assignments and recent activity.
        </p>
      </div>

      {/* Task assignment requests section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1d23', margin: 0 }}>
            Task Assignment Requests
          </h2>
          {pendingCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#ed1c24', borderRadius: 10, padding: '1px 8px', minWidth: 18, textAlign: 'center' }}>
              {pendingCount}
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #f0f0f0' }}>
          {['Pending', 'Accepted', 'Declined', 'All'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '6px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: filter === f ? 700 : 400, fontFamily: 'inherit',
                color: filter === f ? '#ed1c24' : '#888',
                borderBottom: filter === f ? '2px solid #ed1c24' : '2px solid transparent',
                marginBottom: -2,
              }}>
              {f}
              {f !== 'All' && (
                <span style={{ marginLeft: 5, fontSize: 10, color: filter === f ? '#ed1c24' : '#bbb' }}>
                  ({requests.filter(r => r.status === f).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ color: '#7b1d1d', background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ padding: '30px 0', textAlign: 'center', color: '#888', fontSize: 14 }}>
            Loading requests…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 12px' }}>
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <div style={{ color: '#aaa', fontSize: 14 }}>
              {filter === 'Pending' ? 'No pending task requests — you\'re all caught up.' : `No ${filter.toLowerCase()} requests.`}
            </div>
          </div>
        )}

        {!loading && filtered.map(req => (
          <RequestCard key={req.requestId} req={req} onAccept={handleAccept} onDecline={handleDecline} acting={acting} />
        ))}
      </section>

      {/* ── Coming soon sections ── */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1d23', marginBottom: 14 }}>My Active Tasks</h2>
        <div style={{ background: '#f8f8f8', border: '1px dashed #ddd', borderRadius: 8, padding: '20px', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
          Will show your accepted, in-progress tasks across all projects. <em>(Coming with full Dashboard build)</em>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1d23', marginBottom: 14 }}>Recent Project Activity</h2>
        <div style={{ background: '#f8f8f8', border: '1px dashed #ddd', borderRadius: 8, padding: '20px', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
          Will show a live audit feed of changes across your projects. <em>(Coming with full Dashboard build)</em>
        </div>
      </section>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}