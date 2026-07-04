import { useState, useEffect, useCallback } from 'react';
import { requestApi, taskApi } from '../project-management/api/projectApi';

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  accent:     '#D92906',
  bg:         '#f8f5f0',
  surface:    '#ffffff',
  border:     '#e0dcd4',
  borderFaint:'#ede9e3',
  text:       '#1a1d23',
  textSub:    '#6b6b6b',
  textMuted:  '#9a9a9a',
};
const PRIORITY_COLOR = { Critical:'#c00', High:'#c77700', Medium:'#3a7ebf', Low:'#555' };
const TASK_STATUS = {
  'To Do':   { bg:'#f5f4f2', color:'#555',    border:'#d0cdc8' },
  'Ongoing': { bg:'#edf3fe', color:'#1a56db',  border:'#b3c9f8' },
  'Blocked': { bg:'#fdecea', color:'#9b1c1c',  border:'#f5c6cb' },
  'Complete':{ bg:'#edfaf3', color:'#166534',  border:'#86efac' },
};
const REQ_STATUS = {
  Pending: { bg:'#fff9ed', color:'#7a5200', border:'#f0c419' },
  Accepted:{ bg:'#edfaf3', color:'#166534', border:'#86efac' },
  Declined:{ bg:'#fdecea', color:'#9b1c1c', border:'#f5c6cb' },
};

// ── Atoms ──────────────────────────────────────────────────────────────────────
function Chip({ label, bg = 'transparent', color = '#555', border = '#ccc' }) {
  return (
    <span style={{ display:'inline-block', fontSize:10, fontWeight:700, letterSpacing:'.05em',
      textTransform:'uppercase', padding:'2px 8px', borderRadius:20,
      background:bg, color, border:`1px solid ${border}`, whiteSpace:'nowrap', lineHeight:'16px' }}>
      {label}
    </span>
  );
}
function PriorityChip({ v }) {
  const c = PRIORITY_COLOR[v] || '#888';
  return <Chip label={v} color={c} border={c} />;
}
function TaskStatusChip({ v }) {
  const s = TASK_STATUS[v] || TASK_STATUS['To Do'];
  return <Chip label={v} bg={s.bg} color={s.color} border={s.border} />;
}
function ReqStatusChip({ v }) {
  const s = REQ_STATUS[v] || REQ_STATUS.Pending;
  return <Chip label={v} bg={s.bg} color={s.color} border={s.border} />;
}
function Hr() { return <div style={{ height:1, background:T.borderFaint }} />; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' });
}
function fmtRel(d) {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m <  1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return dy === 1 ? 'yesterday' : `${dy}d ago`;
}
function overdue(d) { return d && new Date(d) < new Date(); }

function navigateToProject(projectId) {
  window.dispatchEvent(new CustomEvent('navigate-to-module', { detail: { moduleId: 'project-management' } }));
  // Small delay so the module mounts before it receives the open-project event
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-project', { detail: { projectId } }));
  }, 80);
}

// ── Audit action humanizer ─────────────────────────────────────────────────────
function auditText({ entityType, action, fieldChanged, oldValue, newValue, actorName }) {
  const who = actorName || 'Someone';
  const et  = (entityType || 'item').replace(/_/g, ' ');
  switch (action) {
    case 'created':             return [who, `created a ${et}`];
    case 'deleted':             return [who, `deleted a ${et}`];
    case 'updated':
    case 'status_changed':
      if (fieldChanged === 'status' || action === 'status_changed')
        return [who, `changed ${et} status`, `${oldValue} → ${newValue}`];
      if (fieldChanged === 'priority')
        return [who, `changed ${et} priority`, `${oldValue} → ${newValue}`];
      if (fieldChanged)
        return [who, `updated ${et} ${fieldChanged.replace(/_/g,' ')}`];
      return [who, `updated a ${et}`];
    case 'member_added':        return [who, 'added a member'];
    case 'member_removed':      return [who, 'removed a member'];
    case 'role_changed':        return [who, 'changed a member role'];
    case 'assignment_accepted': return [who, 'accepted a task assignment'];
    case 'assignment_declined': return [who, 'declined a task assignment'];
    case 'assignee_requested':  return [who, 'requested a task assignment'];
    case 'dependency_added':    return [who, 'added a task dependency'];
    case 'dependency_removed':  return [who, 'removed a task dependency'];
    default:                    return [who, action.replace(/_/g,' '), `on a ${et}`];
  }
}

// ── Section heading ────────────────────────────────────────────────────────────
function SectionHead({ title, pill, pillBg = T.accent }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
      <h2 style={{ margin:0, fontSize:11, fontWeight:700, letterSpacing:'.08em',
        textTransform:'uppercase', color:T.textSub }}>
        {title}
      </h2>
      {pill != null && (
        <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:pillBg,
          borderRadius:10, padding:'1px 8px', lineHeight:'18px' }}>
          {pill}
        </span>
      )}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={{ padding:'28px 0', textAlign:'center', color:T.textMuted, fontSize:13 }}>
      {text}
    </div>
  );
}

// ── Request card ───────────────────────────────────────────────────────────────
function RequestCard({ req, onAccept, onDecline, acting }) {
  const isPending = req.status === 'Pending';
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6,
      padding:'14px 16px', marginBottom:8, opacity: isPending ? 1 : 0.7 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:3,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {req.taskName}
          </div>
          <div style={{ fontSize:11, color:T.textMuted }}>
            {[req.projectName, req.phaseName, req.activityName].filter(Boolean).join(' › ')}
          </div>
        </div>
        <ReqStatusChip v={req.status} />
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center',
        marginBottom: isPending ? 12 : 4 }}>
        <PriorityChip v={req.priority} />
        {req.dueDate && (
          <span style={{ fontSize:11, color:T.textMuted }}>
            Due <strong style={{ color:T.textSub }}>{fmtDate(req.dueDate)}</strong>
          </span>
        )}
        <span style={{ fontSize:11, color:T.textMuted, marginLeft:'auto' }}>
          by <strong style={{ color:T.textSub }}>{req.requestedByName}</strong>
        </span>
      </div>
      {isPending && req.taskDescription && (
        <p style={{ fontSize:12, color:T.textSub, lineHeight:1.6, margin:'0 0 12px',
          paddingLeft:10, borderLeft:`2px solid ${T.borderFaint}` }}>
          {req.taskDescription}
        </p>
      )}
      {isPending ? (
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => onAccept(req.requestId)} disabled={acting === req.requestId}
            style={{ flex:1, padding:'7px 0', border:'none', borderRadius:5, fontFamily:'inherit',
              background: acting === req.requestId ? '#ccc' : T.accent,
              color:'#fff', fontWeight:600, fontSize:12, cursor:'pointer' }}>
            {acting === req.requestId ? 'Saving…' : '✓ Accept'}
          </button>
          <button onClick={() => onDecline(req.requestId)} disabled={acting === req.requestId}
            style={{ flex:1, padding:'7px 0', border:`1px solid ${T.border}`, borderRadius:5,
              fontFamily:'inherit', background:T.surface, color:'#9b1c1c',
              fontWeight:600, fontSize:12, cursor:'pointer' }}>
            ✕ Decline
          </button>
        </div>
      ) : req.respondedAt && (
        <div style={{ fontSize:11, color:T.textMuted }}>
          {req.status === 'Accepted' ? 'Accepted' : 'Declined'} {fmtRel(req.respondedAt)}
        </div>
      )}
    </div>
  );
}

// ── Active task row (clickable → opens project) ────────────────────────────────
function ActiveTaskRow({ task, isLast }) {
  const od = overdue(task.dueDate) && task.status !== 'Complete';
  return (
    <>
      <button
        onClick={() => navigateToProject(task.projectId)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
          padding:'11px 16px', background:'transparent', border:'none',
          cursor:'pointer', textAlign:'left', fontFamily:'inherit',
          transition:'background .12s' }}
        onMouseEnter={e => e.currentTarget.style.background = T.bg}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Left: name + breadcrumb */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:2,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {task.taskName}
          </div>
          <div style={{ fontSize:11, color:T.textMuted,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {task.projectName} › {task.activityName}
          </div>
        </div>
        {/* Right: badges + due date */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end',
          gap:4, flexShrink:0 }}>
          <div style={{ display:'flex', gap:5 }}>
            <PriorityChip v={task.priority} />
            <TaskStatusChip v={task.status} />
          </div>
          {task.dueDate && (
            <span style={{ fontSize:10, fontWeight: od ? 700 : 400,
              color: od ? T.accent : T.textMuted }}>
              {od ? '⚠ ' : ''}{fmtDate(task.dueDate)}
            </span>
          )}
        </div>
        {/* Chevron hint */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={T.textMuted} strokeWidth="2" style={{ flexShrink:0 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {!isLast && <Hr />}
    </>
  );
}

// ── Audit row ──────────────────────────────────────────────────────────────────
function AuditRow({ entry, isLast }) {
  const [actor, ...rest] = auditText(entry);
  const detail = rest.length > 1 ? rest[rest.length - 1] : null;
  const middle = rest.slice(0, detail ? rest.length - 1 : rest.length).join(' ');
  return (
    <>
      <div style={{ display:'flex', gap:10, padding:'10px 14px', alignItems:'flex-start' }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:T.accent,
          marginTop:6, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12.5, color:T.text, lineHeight:1.45 }}>
            <strong style={{ fontWeight:600 }}>{actor}</strong>
            {' '}{middle}
            {detail && (
              <span style={{ marginLeft:5, fontSize:11, color:T.textMuted,
                background:T.bg, border:`1px solid ${T.border}`, borderRadius:4,
                padding:'0 5px' }}>
                {detail}
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:T.textMuted, marginTop:2 }}>
            <span style={{ fontWeight:500, color:T.textSub }}>{entry.projectName}</span>
            {' · '}{fmtRel(entry.createdAt)}
          </div>
        </div>
      </div>
      {!isLast && <Hr />}
    </>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, marginBottom:14 }}>
      {tabs.map(({ key, label, count }) => {
        const on = active === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{ padding:'6px 13px', border:'none', background:'none', cursor:'pointer',
              fontFamily:'inherit', fontSize:12, fontWeight: on ? 700 : 400,
              color: on ? T.accent : T.textSub,
              borderBottom: on ? `2px solid ${T.accent}` : '2px solid transparent',
              marginBottom:-1 }}>
            {label}
            {count != null && (
              <span style={{ marginLeft:4, fontSize:10,
                color: on ? T.accent : T.textMuted }}>({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`,
      borderRadius:8, overflow:'hidden', ...style }}>
      {children}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export default function DashboardModule({ currentUser }) {
  const [requests,    setRequests]    = useState([]);
  const [activeTasks, setActiveTasks] = useState([]);
  const [auditFeed,   setAuditFeed]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState(null);
  const [error,       setError]       = useState('');
  const [filter,      setFilter]      = useState('Pending');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [reqs, tasks, audit] = await Promise.all([
        requestApi.getMyRequests(),
        taskApi.getMyActiveTasks(),
        taskApi.getMyRecentAudit(),
      ]);
      setRequests(reqs);
      setActiveTasks(tasks);
      setAuditFeed(audit);
    } catch { setError('Failed to load dashboard data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAccept = async (requestId) => {
    setActing(requestId);
    try {
      await requestApi.accept(requestId);
      setRequests(p => p.map(r => r.requestId === requestId
        ? { ...r, status:'Accepted', respondedAt:new Date().toISOString() } : r));
      taskApi.getMyActiveTasks().then(setActiveTasks).catch(()=>{});
    } catch (err) { setError(err?.response?.data?.error || 'Failed to accept.'); }
    finally { setActing(null); }
  };

  const handleDecline = async (requestId) => {
    setActing(requestId);
    try {
      await requestApi.decline(requestId);
      setRequests(p => p.map(r => r.requestId === requestId
        ? { ...r, status:'Declined', respondedAt:new Date().toISOString() } : r));
    } catch (err) { setError(err?.response?.data?.error || 'Failed to decline.'); }
    finally { setActing(null); }
  };

  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const overdueCount = activeTasks.filter(t => overdue(t.dueDate) && t.status !== 'Complete').length;
  const filtered     = filter === 'All' ? requests : requests.filter(r => r.status === filter);
  const displayName  = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
                     || currentUser?.username || 'there';

  const reqTabs = [
    { key:'Pending',  label:'Pending',  count:requests.filter(r=>r.status==='Pending').length },
    { key:'Accepted', label:'Accepted', count:requests.filter(r=>r.status==='Accepted').length },
    { key:'Declined', label:'Declined', count:requests.filter(r=>r.status==='Declined').length },
    { key:'All',      label:'All' },
  ];

  // ── Layout: the outer wrapper fills erp-main exactly, no outer scroll ─────
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column',
      background:T.bg, fontFamily:'inherit', overflow:'hidden' }}>

      {/* Page header — fixed height */}
      <div style={{ padding:'24px 28px 0', flexShrink:0 }}>
        <h1 style={{ margin:'0 0 3px', fontSize:24, fontWeight:700, color:T.text,
          fontFamily:"'Cormorant Garamond', Georgia, serif" }}>
          Good {timeOfDay()}, {displayName}
        </h1>
        <p style={{ margin:'0 0 20px', fontSize:13, color:T.textMuted }}>
          Overview of your tasks, assignments and recent project activity.
        </p>
        {error && (
          <div style={{ marginBottom:16, padding:'9px 14px', background:'#fdecea',
            border:'1px solid #f5c6cb', borderRadius:6, fontSize:13, color:'#9b1c1c' }}>
            {error}
          </div>
        )}
        <Hr />
      </div>

      {/* Body — scrollable */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          color:T.textMuted, fontSize:13 }}>
          Loading…
        </div>
      ) : (
        <div style={{ flex:1, overflow:'hidden', display:'flex', gap:0 }}>

          {/* ── Left column (scrollable) ── */}
          <div style={{ flex:'0 0 52%', overflow:'auto', padding:'20px 28px',
            borderRight:`1px solid ${T.border}` }}>

            {/* Task Requests */}
            <div style={{ marginBottom:32 }}>
              <SectionHead title="Task Requests"
                pill={pendingCount > 0 ? pendingCount : null} />
              <TabBar tabs={reqTabs} active={filter} onChange={setFilter} />
              {filtered.length === 0
                ? <Empty text={filter === 'Pending'
                    ? 'No pending requests — all caught up.'
                    : `No ${filter.toLowerCase()} requests.`} />
                : filtered.map(req => (
                    <RequestCard key={req.requestId} req={req}
                      onAccept={handleAccept} onDecline={handleDecline} acting={acting} />
                  ))
              }
            </div>

            {/* Active Tasks */}
            <div>
              <SectionHead title="My Active Tasks"
                pill={overdueCount > 0 ? `${overdueCount} overdue` : null}
                pillBg="#9b1c1c" />
              {activeTasks.length === 0
                ? <Empty text="No active tasks assigned to you." />
                : (
                  <Card>
                    {activeTasks.map((t, i) => (
                      <ActiveTaskRow key={t.taskId} task={t}
                        isLast={i === activeTasks.length - 1} />
                    ))}
                  </Card>
                )
              }
              {activeTasks.length > 0 && (
                <p style={{ fontSize:11, color:T.textMuted, marginTop:8 }}>
                  Click a task to open it in Project Management.
                </p>
              )}
            </div>
          </div>

          {/* ── Right column — Audit feed (scrollable) ── */}
          <div style={{ flex:'0 0 48%', overflow:'auto', padding:'20px 24px' }}>
            <SectionHead title="Recent Project Activity" />
            {auditFeed.length === 0
              ? <Empty text="No recent activity across your projects." />
              : (
                <Card>
                  {auditFeed.slice(0, 50).map((e, i) => (
                    <AuditRow key={e.id} entry={e}
                      isLast={i === Math.min(auditFeed.length, 50) - 1} />
                  ))}
                </Card>
              )
            }
          </div>

        </div>
      )}
    </div>
  );
}

function timeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}