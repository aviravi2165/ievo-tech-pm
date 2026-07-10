import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { CalendarRange } from 'lucide-react';
import { phaseApi, activityApi, taskApi } from '../api/projectApi';
import {
  Empty, Timeline, TlLabelCol, TlScrollCol, TlRow, TlLabel, TlBarWrap, TlBar,
} from '../styles/shared.styles';

// Status → color, used for segmented bars (and the single-segment fallback)
// so a bar visually communicates WHAT changed over time, not just which
// level (Phase vs Activity) it belongs to — e.g. an Activity that was 'To
// Do' until day 5 then 'In Progress' after now renders as two differently
// colored pieces of the same bar instead of one solid block that only ever
// reflects today's status.
function statusBarColor(theme, status) {
  const map = {
    'To Do':      theme.colors.ash,
    'In Progress':theme.colors.info,
    'Ongoing':    theme.colors.info,
    'Completed':  theme.colors.success,
    'Complete':   theme.colors.success,
    'Blocked':    theme.colors.danger,
  };
  return map[status] || theme.colors.ash;
}

// Fixed pixel-per-day scale — this is what actually makes the timeline
// scroll instead of squeezing every marker into whatever width the
// container happens to have. Every single day gets its own tick (not just
// once a week) — 28px/day is comfortable room for a 1-2 digit day number
// without adjacent days' labels touching; the month/year context comes
// from the month header band above instead of repeating it on every tick.
const PX_PER_DAY = 28;
const MIN_CONTENT_W = 480; // never narrower than this even for a short range
const ROW_H = 36; // must match TlRow's height

// The label column and the bar column are two INDEPENDENT layout regions
// (see shared.styles.js's Timeline comment) — nothing forces their headers
// to be the same height automatically. The bar column's header has two
// stacked rows (month band + week ticks); previously the label column's
// header spacer only accounted for one, so every row below drifted out of
// alignment with its bar by the missing amount. Both header heights below
// are shared constants for exactly this reason — change one, both columns
// move together.
const MONTH_ROW_H = 20;
const MONTH_ROW_MB = 6;
const WEEK_ROW_H = 16;
const WEEK_ROW_MB = 6;
const HEADER_H = MONTH_ROW_H + MONTH_ROW_MB + WEEK_ROW_H + WEEK_ROW_MB;

/** Fix: parse YYYY-MM-DD as local date — avoids off-by-one in +UTC timezones */
function parseDate(d) {
  if (!d) return null;
  const s = String(d).split('T')[0];
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function daysBetween(a, b) {
  const da = a instanceof Date ? a : parseDate(a);
  const db = b instanceof Date ? b : parseDate(b);
  return Math.round((db - da) / 86400000);
}

function fmt(d) {
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function fmtMonth(d) {
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function fmtFull(d) {
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// MIN_LABEL_PX — a status label ("Completed", "In Progress"...) needs
// roughly this much room to read cleanly at 10px font + padding. Every
// segment gets a chance to show its own label if it's wide enough, not
// just the last one — previously only the LAST segment was ever labeled,
// so a bar that had spent most of its life "To Do" and only just flipped
// to a sliver of "Ongoing" right before "now" rendered with NO visible
// text at all (the one segment eligible for a label was too narrow to
// hold it, and the wide earlier segment was never eligible in the first
// place).
const MIN_LABEL_PX = 34;

// Distinct, progressively lighter background per nesting level — Phase
// (section header) gets the strongest tint, Activity a step lighter, Task
// (leaf row) plain white — so the hierarchy reads at a glance from the row
// background alone, not just from indentation, which was easy to miss once
// several phases were expanded side by side.
function levelBg(kind, theme) {
  if (kind === 'phase')    return theme.colors.mid;
  if (kind === 'activity') return theme.colors.greigeBorder;
  return theme.colors.white;
}

function SegmentBar({ segments, theme, contentWidth }) {
  return segments.map((seg, i) => {
    const widthPx = (parseFloat(seg.width) / 100) * contentWidth;
    return (
      <TlBar
        key={i}
        style={{ left: seg.left, width: seg.width, background: statusBarColor(theme, seg.status) }}
        title={seg.status}
      >
        {widthPx >= MIN_LABEL_PX && (
          <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>{seg.status}</span>
        )}
      </TlBar>
    );
  });
}

export default function TimelineView({ phases = [], projectStart, projectEnd }) {
  const theme = useTheme();
  const [expanded,     setExpanded]     = useState({}); // phases
  const [expandedAct,  setExpandedAct]  = useState({}); // activities → show their tasks
  // Use a ref for activities cache — avoids stale closure on fetchActivities
  const activitiesRef = useRef({});
  const [actCache,   setActCache]   = useState({});
  const tasksRef = useRef({});
  const [taskCache, setTaskCache]   = useState({});

  // Status-history caches — segments for segmented bars. Phases are always
  // visible so their history is fetched eagerly for all of them; Activity
  // history is fetched lazily alongside its own tasks, only once expanded;
  // Task history is fetched lazily alongside the task list, once its parent
  // Activity is expanded.
  const [phaseHistory, setPhaseHistory] = useState({});
  const actHistoryRef = useRef({});
  const [actHistory,   setActHistory]   = useState({});
  const taskHistoryRef = useRef({});
  const [taskHistory,   setTaskHistory] = useState({});

  useEffect(() => {
    let cancelled = false;
    phases.forEach(async (p) => {
      try {
        const hist = await phaseApi.getStatusHistory(p.phaseId);
        if (!cancelled) setPhaseHistory(prev => ({ ...prev, [p.phaseId]: hist }));
      } catch { /**/ }
    });
    return () => { cancelled = true; };
  }, [phases]);

  // FIX: fetchActivities no longer depends on activities state
  const fetchActivities = useCallback(async (phaseId) => {
    if (activitiesRef.current[phaseId]) return; // already loaded
    try {
      const acts = await phaseApi.getActivities(phaseId);
      activitiesRef.current[phaseId] = acts;
      setActCache(prev => ({ ...prev, [phaseId]: acts }));
      // Fetch each activity's status history alongside it — same lazy timing
      acts.forEach(async (act) => {
        if (actHistoryRef.current[act.activityId]) return;
        try {
          const hist = await activityApi.getStatusHistory(act.activityId);
          actHistoryRef.current[act.activityId] = hist;
          setActHistory(prev => ({ ...prev, [act.activityId]: hist }));
        } catch { /**/ }
      });
    } catch { /**/ }
  }, []); // stable — no deps needed

  const fetchTasks = useCallback(async (activityId) => {
    if (tasksRef.current[activityId]) return; // already loaded
    try {
      const tasks = await activityApi.getTasks(activityId);
      tasksRef.current[activityId] = tasks;
      setTaskCache(prev => ({ ...prev, [activityId]: tasks }));
      tasks.forEach(async (t) => {
        if (taskHistoryRef.current[t.taskId]) return;
        try {
          const hist = await taskApi.getStatusHistory(t.taskId);
          taskHistoryRef.current[t.taskId] = hist;
          setTaskHistory(prev => ({ ...prev, [t.taskId]: hist }));
        } catch { /**/ }
      });
    } catch { /**/ }
  }, []);

  const toggleActivity = (activityId) => {
    setExpandedAct(prev => {
      const next = { ...prev, [activityId]: !prev[activityId] };
      if (next[activityId]) fetchTasks(activityId);
      return next;
    });
  };

  const togglePhase = (phaseId) => {
    setExpanded(prev => {
      const next = { ...prev, [phaseId]: !prev[phaseId] };
      if (next[phaseId]) fetchActivities(phaseId);
      return next;
    });
  };

  // Compute date range — fall back gracefully when dates are missing.
  // Walks Phase dates always, plus Activity/Task dates for whatever's been
  // expanded/loaded so far (actCache/taskCache) — otherwise the range only
  // ever reflected Phase spans and bars for activities/tasks whose dates
  // fall outside it would get silently clipped, and newly-expanded rows
  // wouldn't extend how far the timeline scrolls.
  const { rangeStart, totalDays, hasDates } = useMemo(() => {
    const dates = [projectStart, projectEnd];
    phases.forEach(p => {
      if (p.plannedStart) dates.push(p.plannedStart);
      if (p.plannedEnd)   dates.push(p.plannedEnd);
    });
    Object.values(actCache).forEach(acts => acts.forEach(a => {
      if (a.plannedStart) dates.push(a.plannedStart);
      if (a.plannedEnd)   dates.push(a.plannedEnd);
    }));
    Object.values(taskCache).forEach(tasks => tasks.forEach(t => {
      if (t.startDate) dates.push(t.startDate);
      if (t.dueDate)   dates.push(t.dueDate);
    }));
    const valid = dates.filter(Boolean).map(d => parseDate(d)).filter(Boolean);

    if (!valid.length) {
      const start = new Date();
      start.setDate(1);
      return { rangeStart: start, totalDays: 90, hasDates: false };
    }

    const min = new Date(Math.min(...valid));
    const max = new Date(Math.max(...valid));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 3);
    return {
      rangeStart: min,
      totalDays: Math.max(daysBetween(min, max), 14),
      hasDates: true,
    };
  }, [phases, projectStart, projectEnd, actCache, taskCache]);

  // Day markers — every single day gets its own tick (not just once a
  // week), per explicit request: label is just the day-of-month number
  // ("5", "6", "7"...) since the month header band above already gives
  // month/year context — repeating "5 Jul", "6 Jul", "7 Jul"... on every
  // tick would be redundant and wouldn't fit at any reasonable day-width.
  const dayMarkers = useMemo(() => {
    const markers = [];
    const today = new Date();
    const d = new Date(rangeStart);
    while (daysBetween(rangeStart, d) < totalDays) {
      markers.push({
        label: String(d.getDate()),
        isMonthStart: d.getDate() === 1,
        isToday: daysBetween(d, today) === 0,
        pct: (daysBetween(rangeStart, d) / totalDays) * 100,
      });
      d.setDate(d.getDate() + 1);
    }
    return markers;
  }, [rangeStart, totalDays]);

  // Month boundaries — coarser context ("which month am I looking at")
  // drawn as gridlines through the whole row stack, not just header text.
  // Week-only labels ("5 Jan", "12 Jan"...) give no sense of month/quarter
  // at a glance once a range spans more than a few weeks — these fill that gap.
  const monthMarkers = useMemo(() => {
    const markers = [];
    const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    if (d < rangeStart) d.setMonth(d.getMonth() + 1);
    while (daysBetween(rangeStart, d) < totalDays) {
      markers.push({
        label: fmtMonth(d),
        pct: (daysBetween(rangeStart, d) / totalDays) * 100,
      });
      d.setMonth(d.getMonth() + 1);
    }
    return markers;
  }, [rangeStart, totalDays]);

  // Today line position
  const todayPct = useMemo(() => {
    const pct = (daysBetween(rangeStart, new Date()) / totalDays) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [rangeStart, totalDays]);

  const contentWidth = Math.max(totalDays * PX_PER_DAY, MIN_CONTENT_W);

  function toISODateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // A child's real dates (task.createdAt/dueDate, activity.plannedStart/End)
  // can legitimately fall outside its parent's planned range — e.g. a task
  // created before the activity's planned-start was set, or moved out
  // later — but rendering it that way makes the Gantt nesting look broken
  // (a task bar starting to the left of its own activity's bar). Clamp the
  // RENDERED range to the parent's range when the parent has dates; the
  // underlying data is untouched, this only affects where the bar is drawn.
  const clampToParent = (start, end, parentStart, parentEnd) => {
    const s = parseDate(start);
    const e = parseDate(end);
    if (!s || !e) return [start, end];
    const ps = parseDate(parentStart);
    const pe = parseDate(parentEnd);
    let cs = s, ce = e;
    if (ps && cs < ps) cs = ps;
    if (pe && ce > pe) ce = pe;
    if (cs > ce) cs = ce;
    return [toISODateStr(cs), toISODateStr(ce)];
  };

  // Returns left% and width% for a bar, or null if no dates
  const barStyle = (start, end) => {
    const s = parseDate(start);
    const e = parseDate(end);
    if (!s || !e) return null;
    const left  = Math.max(0,   (daysBetween(rangeStart, s) / totalDays) * 100);
    const right = Math.min(100, (daysBetween(rangeStart, e) / totalDays) * 100);
    const width = Math.max(right - left, 0.8);
    return { left: `${left}%`, width: `${width}%` };
  };

  // Splits a bar into multiple colored pieces from real status-history
  // segments, clipped to [plannedStart, plannedEnd] — an open-ended last
  // segment (to: null, still current) extends to today, not the full
  // planned end, so a bar doesn't show a status as having applied for the
  // whole future portion it hasn't actually reached yet. Returns null if
  // there's no usable history yet (caller falls back to the plain single
  // color bar), so this only changes what a row looks like once real
  // transition data exists for it.
  const segmentedBarStyle = (start, end, history) => {
    const s = parseDate(start);
    const e = parseDate(end);
    if (!s || !e || !history || !history.length) return null;
    const now = new Date();
    const segs = history.map(h => {
      const segFrom = h.from ? new Date(h.from) : s;
      const segTo   = h.to   ? new Date(h.to)   : now;
      const clFrom  = segFrom < s ? s : segFrom;
      const clTo    = segTo > e ? e : segTo;
      if (clTo <= clFrom) return null;
      const left  = Math.max(0,   (daysBetween(rangeStart, clFrom) / totalDays) * 100);
      const right = Math.min(100, (daysBetween(rangeStart, clTo)   / totalDays) * 100);
      return { left: `${left}%`, width: `${Math.max(right - left, 0.3)}%`, status: h.status };
    }).filter(Boolean);
    return segs.length ? segs : null;
  };

  if (!phases.length) {
    return (
      <Empty>
        <CalendarRange size={40} strokeWidth={1.2} />
        <p>No phases yet. Add phases with planned dates to see the timeline.</p>
      </Empty>
    );
  }

  // Build the row list ONCE — both the (non-scrolling) label column and the
  // (scrolling) bar column render from this exact same list, in the exact
  // same order, so their rows always line up regardless of scroll position.
  const rows = [];
  phases.forEach((phase, pIdx) => {
    // groupStart marks every phase row after the first — used to draw a
    // divider line between one phase's group of rows and the next, so the
    // hierarchy reads as distinct sections instead of one undifferentiated
    // stack once several phases are expanded at once.
    rows.push({ kind: 'phase', key: `p${phase.phaseId}`, phase, groupStart: pIdx > 0 });
    if (expanded[phase.phaseId]) {
      const acts = actCache[phase.phaseId];
      if (acts) {
        acts.forEach(act => {
          // parentPhase carried along so the activity's bar can be clamped
          // to its own planned range (see clampToParent below).
          rows.push({ kind: 'activity', key: `a${act.activityId}`, act, parentPhase: phase });
          if (expandedAct[act.activityId]) {
            const tasks = taskCache[act.activityId];
            if (tasks) tasks.forEach(t => rows.push({ kind: 'task', key: `t${t.taskId}`, task: t, parentAct: act }));
            else rows.push({ kind: 'loading', key: `lt${act.activityId}` });
          }
        });
      } else rows.push({ kind: 'loading', key: `l${phase.phaseId}` });
    }
  });

  const totalRowsHeight = rows.length * (ROW_H + 4); // +4 = TlRow's margin-bottom

  return (
    <div>
      {!hasDates && (
        <div style={{
          background: `${theme.colors.warning}1a`, border: `1px solid ${theme.colors.warning}`,
          borderRadius: theme.radius.sm, padding: '8px 14px', marginBottom: 12,
          fontSize: 12, color: theme.colors.warning,
        }}>
          No planned dates set on phases. Add start and end dates to phases to see bars on the timeline.
        </div>
      )}
    <Timeline style={{ userSelect: 'none' }}>

      {/* ── Label column — fixed width, never scrolls ── */}
      <TlLabelCol>
        <div style={{ height: HEADER_H }} />{/* header spacer — must match the bar column's month+week header height exactly (HEADER_H), or every row below drifts out of alignment with its bar */}
        {rows.map(row => (
          <TlRow key={row.key}
            style={{
              background: levelBg(row.kind, theme),
              ...((row.kind === 'phase' || row.kind === 'activity') ? { cursor: 'pointer' } : null),
              ...(row.kind === 'phase' && row.groupStart ? { borderTop: `2px solid ${theme.colors.border}`, paddingTop: 6, marginTop: 2 } : null),
            }}
            onClick={
              row.kind === 'phase'    ? () => togglePhase(row.phase.phaseId)
              : row.kind === 'activity' ? () => toggleActivity(row.act.activityId)
              : undefined
            }
            title={row.kind !== 'loading'
              ? ((row.phase || row.act || row.task).plannedStart || (row.task && row.task.dueDate)
                ? (row.task
                    ? `Due ${fmtFull(row.task.dueDate)}`
                    : `${fmtFull((row.phase || row.act).plannedStart)} → ${fmtFull((row.phase || row.act).plannedEnd)}`)
                : 'No dates set')
              : undefined}
          >
            {row.kind === 'phase' && (
              <TlLabel>
                <span style={{ marginRight: 5, color: theme.colors.ash, fontSize: 9 }}>
                  {expanded[row.phase.phaseId] ? '▼' : '▶'}
                </span>
                {row.phase.name?.trim() || <em style={{ color: theme.colors.ash }}>(Unnamed phase)</em>}
              </TlLabel>
            )}
            {row.kind === 'activity' && (
              <TlLabel style={{ paddingLeft: 22, fontSize: 11, color: theme.colors.ash }}>
                <span style={{ marginRight: 5, color: theme.colors.ash, fontSize: 9 }}>
                  {expandedAct[row.act.activityId] ? '▼' : '▶'}
                </span>
                {row.act.name?.trim() || <em>(Unnamed activity)</em>}
              </TlLabel>
            )}
            {row.kind === 'task' && (
              <TlLabel style={{ paddingLeft: 38, fontSize: 10.5, color: theme.colors.ashLight }}>
                {row.task.name?.trim() || <em>(Unnamed task)</em>}
              </TlLabel>
            )}
            {row.kind === 'loading' && (
              <TlLabel style={{ paddingLeft: 22, fontSize: 11, color: theme.colors.ash }}>
                Loading…
              </TlLabel>
            )}
          </TlRow>
        ))}
      </TlLabelCol>

      {/* ── Scrollable date/bar area ── */}
      <TlScrollCol>
        <div style={{ width: contentWidth }}>

          {/* ── Header: month band + week ticks ── */}
          <div style={{ position: 'relative', height: MONTH_ROW_H, marginBottom: MONTH_ROW_MB }}>
            {monthMarkers.map((m, i) => (
              <div key={i} style={{
                position: 'absolute', left: `${m.pct}%`, top: 0,
                fontSize: 11, fontWeight: 700, color: theme.colors.onyx, whiteSpace: 'nowrap',
                paddingLeft: 4, borderLeft: `1px solid ${theme.colors.border}`, height: '100%',
              }}>
                {m.label}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', height: WEEK_ROW_H, marginBottom: WEEK_ROW_MB }}>
            {dayMarkers.map((m, i) => (
              <div key={i} style={{
                position: 'absolute', left: `${m.pct}%`, transform: 'translateX(-50%)',
                fontSize: 10, whiteSpace: 'nowrap',
                fontWeight: m.isToday ? 700 : (m.isMonthStart ? 600 : 400),
                color: m.isToday ? theme.colors.espresso : (m.isMonthStart ? theme.colors.onyx : theme.colors.ashLight),
              }}>
                {m.label}
              </div>
            ))}
          </div>

          {/* ── Bar rows ── */}
          <div style={{ position: 'relative' }}>

            {/* Month gridlines — spans the full row stack for visual context
                (which month a given bar actually falls in), not just the header. */}
            {monthMarkers.map((m, i) => (
              <div key={i} style={{
                position: 'absolute', top: 0, height: totalRowsHeight,
                left: `${m.pct}%`, width: 1, background: theme.colors.border,
                pointerEvents: 'none',
              }} />
            ))}

            {/* Today line — single overlay across all rows */}
            <div style={{
              position: 'absolute',
              top: 0, height: totalRowsHeight,
              left: `${todayPct}%`,
              width: 2,
              background: 'rgba(168,93,77,.75)',
              zIndex: 10,
              pointerEvents: 'none',
            }}>
              {/* Sits INSIDE the row area (not floating up into the header
                  zone above it) — a negative top previously placed it right
                  on top of the day-number header row, overlapping whichever
                  date happened to land near today's date. Solid background
                  so it stays legible over whatever row content is behind it. */}
              <div style={{
                position: 'absolute', top: 2, left: 4,
                fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
                background: 'rgba(168,93,77,.95)', borderRadius: 3, padding: '1px 5px',
                zIndex: 11,
              }}>Today</div>
            </div>

            {rows.map(row => (
              <TlRow key={row.key} style={{
                background: levelBg(row.kind, theme),
                ...(row.kind === 'phase' && row.groupStart ? { borderTop: `2px solid ${theme.colors.border}`, paddingTop: 6, marginTop: 2 } : null),
              }}>
                {row.kind === 'phase' && (
                  <TlBarWrap style={{ width: contentWidth, height: ROW_H }}>
                    {barStyle(row.phase.plannedStart, row.phase.plannedEnd) ? (
                      (() => {
                        const segs = segmentedBarStyle(row.phase.plannedStart, row.phase.plannedEnd, phaseHistory[row.phase.phaseId]);
                        return segs ? <SegmentBar segments={segs} theme={theme} contentWidth={contentWidth} /> : (
                          <TlBar
                            style={{ ...barStyle(row.phase.plannedStart, row.phase.plannedEnd), background: statusBarColor(theme, row.phase.status) }}
                            title={`${row.phase.name} · ${row.phase.status}`}
                          >
                            <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                              {row.phase.status}
                            </span>
                          </TlBar>
                        );
                      })()
                    ) : (
                      <div style={{
                        position: 'absolute', left: '2%', right: '2%', top: 6, height: 24,
                        background: theme.colors.mid, borderRadius: theme.radius.sm,
                        display: 'flex', alignItems: 'center', padding: '0 8px',
                      }}>
                        <span style={{ fontSize: 10, color: theme.colors.ash }}>No dates — {row.phase.status}</span>
                      </div>
                    )}
                  </TlBarWrap>
                )}
                {row.kind === 'activity' && (() => {
                  // Clamp the rendered range to the parent Phase's planned
                  // range (when it has one) — an Activity's own dates can
                  // legitimately sit outside it, but drawing it that way
                  // makes the nesting look broken.
                  const [actStart, actEnd] = clampToParent(
                    row.act.plannedStart, row.act.plannedEnd,
                    row.parentPhase?.plannedStart, row.parentPhase?.plannedEnd
                  );
                  return (
                    <TlBarWrap style={{ width: contentWidth, height: ROW_H }}>
                      {barStyle(actStart, actEnd) ? (
                        (() => {
                          const segs = segmentedBarStyle(actStart, actEnd, actHistory[row.act.activityId]);
                          return segs ? <SegmentBar segments={segs} theme={theme} contentWidth={contentWidth} /> : (
                            <TlBar
                              style={{ ...barStyle(actStart, actEnd), background: statusBarColor(theme, row.act.status) }}
                              title={`${row.act.name} · ${row.act.status}`}
                            >
                              <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                                {row.act.status}
                              </span>
                            </TlBar>
                          );
                        })()
                      ) : (
                        <div style={{
                          position: 'absolute', left: '4%', right: '4%', top: 6, height: 22,
                          background: theme.colors.white, border: `1px dashed ${theme.colors.border}`,
                          borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', padding: '0 8px',
                        }}>
                          <span style={{ fontSize: 10, color: theme.colors.ash }}>No dates</span>
                        </div>
                      )}
                    </TlBarWrap>
                  );
                })()}
                {row.kind === 'task' && (() => {
                  // A task's real start is its own startDate field (falling
                  // back to createdAt for tasks created before that field
                  // existed) — clamped to the parent Activity's planned
                  // range, same reasoning as the Activity→Phase clamp above.
                  const rawStart = row.task.startDate || row.task.createdAt;
                  const rawEnd   = row.task.dueDate || new Date().toISOString();
                  const [taskStart, taskEnd] = clampToParent(
                    rawStart, rawEnd,
                    row.parentAct?.plannedStart, row.parentAct?.plannedEnd
                  );
                  const bStyle = barStyle(taskStart, taskEnd);
                  if (!bStyle) return (
                    <TlBarWrap style={{ width: contentWidth, height: ROW_H }}>
                      <div style={{
                        position: 'absolute', left: '4%', right: '4%', top: 8, height: 18,
                        background: theme.colors.white, border: `1px dashed ${theme.colors.border}`,
                        borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', padding: '0 8px',
                      }}>
                        <span style={{ fontSize: 10, color: theme.colors.ash }}>No dates</span>
                      </div>
                    </TlBarWrap>
                  );
                  const segs = segmentedBarStyle(taskStart, taskEnd, taskHistory[row.task.taskId]);
                  return (
                    <TlBarWrap style={{ width: contentWidth, height: ROW_H }}>
                      {segs ? <SegmentBar segments={segs} theme={theme} contentWidth={contentWidth} /> : (
                        <TlBar style={{ ...bStyle, background: statusBarColor(theme, row.task.status) }} title={`${row.task.name} · ${row.task.status}`}>
                          <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                            {row.task.status}
                          </span>
                        </TlBar>
                      )}
                    </TlBarWrap>
                  );
                })()}
                {row.kind === 'loading' && <TlBarWrap style={{ width: contentWidth, height: ROW_H }} />}
              </TlRow>
            ))}
          </div>
        </div>
      </TlScrollCol>
    </Timeline>
    </div>
  );
}
