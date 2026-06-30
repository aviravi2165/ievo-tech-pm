import { useMemo, useState, useRef, useCallback } from 'react';
import { phaseApi } from '../api/projectApi';

const LABEL_W = 180; // must match .pm-tl-label width in pm.css

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

function fmtFull(d) {
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt) return '';
  return dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TimelineView({ phases = [], projectStart, projectEnd }) {
  const [expanded,   setExpanded]   = useState({});
  // Use a ref for activities cache — avoids stale closure on fetchActivities
  const activitiesRef = useRef({});
  const [actCache,   setActCache]   = useState({});

  // FIX: fetchActivities no longer depends on activities state
  const fetchActivities = useCallback(async (phaseId) => {
    if (activitiesRef.current[phaseId]) return; // already loaded
    try {
      const acts = await phaseApi.getActivities(phaseId);
      activitiesRef.current[phaseId] = acts;
      setActCache(prev => ({ ...prev, [phaseId]: acts }));
    } catch { /**/ }
  }, []); // stable — no deps needed

  const togglePhase = (phaseId) => {
    setExpanded(prev => {
      const next = { ...prev, [phaseId]: !prev[phaseId] };
      if (next[phaseId]) fetchActivities(phaseId);
      return next;
    });
  };

  // Compute date range — fall back gracefully when dates are missing
  const { rangeStart, totalDays, hasDates } = useMemo(() => {
    const dates = [projectStart, projectEnd];
    phases.forEach(p => {
      if (p.plannedStart) dates.push(p.plannedStart);
      if (p.plannedEnd)   dates.push(p.plannedEnd);
    });
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
  }, [phases, projectStart, projectEnd]);

  // Week markers
  const weekMarkers = useMemo(() => {
    const markers = [];
    const d = new Date(rangeStart);
    while (daysBetween(rangeStart, d) < totalDays) {
      markers.push({
        label: fmt(d),
        pct: (daysBetween(rangeStart, d) / totalDays) * 100,
      });
      d.setDate(d.getDate() + 7);
    }
    return markers;
  }, [rangeStart, totalDays]);

  // Today line position
  const todayPct = useMemo(() => {
    const pct = (daysBetween(rangeStart, new Date()) / totalDays) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [rangeStart, totalDays]);

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

  if (!phases.length) {
    return (
      <div className="pm-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No phases yet. Add phases with planned dates to see the timeline.</p>
      </div>
    );
  }

  return (
    <div className="pm-timeline" style={{ userSelect: 'none' }}>

      {!hasDates && (
        <div style={{
          background: 'rgba(201,169,110,0.08)', border: '1px solid var(--gold-dim)',
          borderRadius: 'var(--radius)', padding: '8px 14px', marginBottom: 12,
          fontSize: 12, color: 'var(--gold-dim)',
        }}>
          No planned dates set on phases. Add start and end dates to phases to see bars on the timeline.
        </div>
      )}

      {/* ── Header row ── */}
      <div style={{ display: 'flex', marginBottom: 6 }}>
        {/* Label column spacer — matches LABEL_W exactly */}
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {/* Week marker area */}
        <div style={{ flex: 1, position: 'relative', height: 20 }}>
          {weekMarkers.map((m, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${m.pct}%`,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
            }}>
              {m.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Phase + activity rows ── */}
      <div style={{ position: 'relative' }}>

        {/* Today line — single overlay across all rows */}
        <div style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: `calc(${LABEL_W}px + ${todayPct}% * (100% - ${LABEL_W}px) / 100)`,
          width: 2,
          background: 'rgba(220,60,60,.75)',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 3,
            fontSize: 9, color: 'rgba(220,60,60,.9)', whiteSpace: 'nowrap',
          }}>Today</div>
        </div>

        {phases.map(phase => (
          <div key={phase.phaseId}>
            {/* Phase row */}
            <div
              className="pm-tl-row"
              style={{ cursor: 'pointer' }}
              onClick={() => togglePhase(phase.phaseId)}
              title={phase.plannedStart
                ? `${fmtFull(phase.plannedStart)} → ${fmtFull(phase.plannedEnd)}`
                : 'No dates set'}
            >
              <div className="pm-tl-label">
                <span style={{ marginRight: 5, color: 'var(--muted)', fontSize: 9 }}>
                  {expanded[phase.phaseId] ? '▼' : '▶'}
                </span>
                {phase.name}
              </div>

              <div className="pm-tl-bar-wrap">
                {barStyle(phase.plannedStart, phase.plannedEnd) ? (
                  <div
                    className="pm-tl-bar phase"
                    style={barStyle(phase.plannedStart, phase.plannedEnd)}
                    title={`${phase.name} · ${phase.status}`}
                  >
                    <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                      {phase.status}
                    </span>
                  </div>
                ) : (
                  /* No dates — show a ghost bar */
                  <div style={{
                    position: 'absolute', left: '2%', right: '2%', top: 6, height: 24,
                    background: 'var(--mid)', borderRadius: 'var(--radius)',
                    display: 'flex', alignItems: 'center', padding: '0 8px',
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>No dates — {phase.status}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Activity rows (expanded) */}
            {expanded[phase.phaseId] && (actCache[phase.phaseId] || []).map(act => (
              <div
                key={act.activityId}
                className="pm-tl-row"
                title={act.plannedStart
                  ? `${fmtFull(act.plannedStart)} → ${fmtFull(act.plannedEnd)}`
                  : 'No dates set'}
              >
                <div className="pm-tl-label" style={{ paddingLeft: 22, fontSize: 11, color: 'var(--muted)' }}>
                  {act.name}
                </div>
                <div className="pm-tl-bar-wrap">
                  {barStyle(act.plannedStart, act.plannedEnd) ? (
                    <div
                      className="pm-tl-bar activity"
                      style={barStyle(act.plannedStart, act.plannedEnd)}
                      title={`${act.name} · ${act.status}`}
                    >
                      <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                        {act.status}
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      position: 'absolute', left: '4%', right: '4%', top: 6, height: 22,
                      background: 'var(--charcoal)', border: '1px dashed var(--divider)',
                      borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', padding: '0 8px',
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>No dates</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator while activities fetch */}
            {expanded[phase.phaseId] && !actCache[phase.phaseId] && (
              <div className="pm-tl-row">
                <div className="pm-tl-label" style={{ paddingLeft: 22, fontSize: 11, color: 'var(--muted)' }}>
                  Loading…
                </div>
                <div className="pm-tl-bar-wrap" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}