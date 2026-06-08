/**
 * TimelineView — Scheduling view (Gantt-style, pure CSS)
 * Shows phases and their activities as horizontal bars across a date range.
 * This replaces the separate "Scheduling" module in the drawer.
 */
import { useMemo, useState, useEffect, useCallback } from 'react';
import { phaseApi } from '../api/projectApi';

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function fmt(d) {
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function TimelineView({ phases = [], projectStart, projectEnd }) {
  const [expanded, setExpanded] = useState({});
  const [activities, setActivities] = useState({});

  const fetchActivities = useCallback(async (phaseId) => {
    if (activities[phaseId]) return;
    try {
      const acts = await phaseApi.getActivities(phaseId);
      setActivities(prev => ({ ...prev, [phaseId]: acts }));
    } catch { /**/ }
  }, [activities]);

  const togglePhase = (phaseId) => {
    setExpanded(prev => {
      const next = { ...prev, [phaseId]: !prev[phaseId] };
      if (next[phaseId]) fetchActivities(phaseId);
      return next;
    });
  };

  // Compute overall date range from project + phases
  const { rangeStart, totalDays } = useMemo(() => {
    const dates = [projectStart, projectEnd];
    phases.forEach(p => { if (p.plannedStart) dates.push(p.plannedStart); if (p.plannedEnd) dates.push(p.plannedEnd); });
    const valid = dates.filter(Boolean).map(d => new Date(d));
    if (!valid.length) return { rangeStart: new Date(), totalDays: 30 };
    const min = new Date(Math.min(...valid));
    const max = new Date(Math.max(...valid));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { rangeStart: min, totalDays: Math.max(daysBetween(min, max), 7) };
  }, [phases, projectStart, projectEnd]);

  // Generate week markers
  const weekMarkers = useMemo(() => {
    const markers = [];
    const d = new Date(rangeStart);
    while (daysBetween(rangeStart, d) < totalDays) {
      markers.push({ label: fmt(d), pct: (daysBetween(rangeStart, d) / totalDays) * 100 });
      d.setDate(d.getDate() + 7);
    }
    return markers;
  }, [rangeStart, totalDays]);

  const barStyle = (start, end, type) => {
    if (!start || !end) return null;
    const left  = Math.max(0, (daysBetween(rangeStart, new Date(start)) / totalDays) * 100);
    const right = Math.min(100, (daysBetween(rangeStart, new Date(end))   / totalDays) * 100);
    const width = Math.max(right - left, 0.5);
    return { left: `${left}%`, width: `${width}%` };
  };

  if (!phases.length) {
    return <div className="pm-empty"><p>No phases with dates to display on timeline.</p></div>;
  }

  return (
    <div className="pm-timeline" style={{ userSelect: 'none' }}>
      {/* Header — week markers */}
      <div style={{ display: 'flex', marginLeft: 190, marginBottom: 8, position: 'relative', height: 20 }}>
        {weekMarkers.map((m, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${m.pct}%`,
            fontSize: 10, color: 'var(--muted)', transform: 'translateX(-50%)',
            borderLeft: '1px solid var(--divider)', paddingLeft: 4,
          }}>{m.label}</div>
        ))}
      </div>

      {phases.map(phase => (
        <div key={phase.phaseId}>
          {/* Phase row */}
          <div className="pm-tl-row" style={{ cursor: 'pointer' }} onClick={() => togglePhase(phase.phaseId)}>
            <div className="pm-tl-label" title={phase.name}>
              <span style={{ marginRight: 4, color: 'var(--muted)', fontSize: 10 }}>
                {expanded[phase.phaseId] ? '▼' : '▶'}
              </span>
              {phase.name}
            </div>
            <div className="pm-tl-bar-wrap">
              {barStyle(phase.plannedStart, phase.plannedEnd, 'phase') && (
                <div className="pm-tl-bar phase" style={barStyle(phase.plannedStart, phase.plannedEnd, 'phase')}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                    {phase.status}
                  </span>
                </div>
              )}
              {/* Today line */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${Math.max(0, Math.min(100, (daysBetween(rangeStart, new Date()) / totalDays) * 100))}%`,
                width: 2, background: 'rgba(220,60,60,.7)', zIndex: 2,
              }} />
            </div>
          </div>

          {/* Activity rows (expanded) */}
          {expanded[phase.phaseId] && (activities[phase.phaseId] || []).map(act => (
            <div key={act.activityId} className="pm-tl-row">
              <div className="pm-tl-label" style={{ paddingLeft: 20, fontSize: 11, color: 'var(--muted)' }} title={act.name}>
                {act.name}
              </div>
              <div className="pm-tl-bar-wrap">
                {barStyle(act.plannedStart, act.plannedEnd, 'activity') && (
                  <div className="pm-tl-bar activity" style={barStyle(act.plannedStart, act.plannedEnd, 'activity')}>
                    <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 10 }}>
                      {act.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
