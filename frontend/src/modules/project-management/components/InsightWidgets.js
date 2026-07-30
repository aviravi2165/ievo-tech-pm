/**
 * InsightWidgets — one renderer per entry in insightsService.js's CATALOG.
 * Hand-rolled SVG, matching ProjectAnalytics.js's Donut/WeekBars/BurnUpChart
 * (no charting library in this app). Each function takes only the data
 * shape its own endpoint returns — see insightsService.js's build* functions
 * for exactly what each field means.
 */
import { useTheme } from '@emotion/react';
import { BarRow, BarRowLabel, BarTrack, BarFill, BarRowValue, EmptyHint } from '../styles/ProjectAnalytics.styles';

const STATUS_COLOR = { 'To Do': '#256293', Ongoing: '#b47027', Blocked: '#c12d16', Complete: '#446f17' };
const STATUS_ORDER = ['Complete', 'Blocked', 'Ongoing', 'To Do'];

function fmtShort(d) { return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }); }

// ── Generic small line/area chart shell — shared axis/gridline scaffolding ──
function ChartFrame({ width = 520, height = 180, maxY, children, xLabels }) {
  const theme = useTheme();
  const padL = 30, padR = 12, padT = 12, padB = 20;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      {[0, 0.5, 1].map(f => (
        <g key={f}>
          <line x1={padL} x2={width - padR} y1={padT + (height - padT - padB) * (1 - f)} y2={padT + (height - padT - padB) * (1 - f)}
            stroke={theme.colors.border} strokeWidth="1" />
          <text x={padL - 6} y={padT + (height - padT - padB) * (1 - f) + 3} textAnchor="end" fontSize="9" fill={theme.colors.ash}>
            {Math.round(maxY * f)}
          </text>
        </g>
      ))}
      {children({ padL, padR, padT, padB, innerW: width - padL - padR, innerH: height - padT - padB })}
      {xLabels && (
        <>
          <text x={padL} y={height - 5} textAnchor="start" fontSize="9" fill={theme.colors.ash}>{xLabels[0]}</text>
          <text x={width - padR} y={height - 5} textAnchor="end" fontSize="9" fill={theme.colors.ash}>{xLabels[1]}</text>
        </>
      )}
    </svg>
  );
}

// 1. Cumulative Flow Diagram — stacked area, Complete at the bottom (grows
// upward as the project finishes) so a healthy project reads as a
// thickening green band from the bottom up.
export function CumulativeFlowChart({ points }) {
  const theme = useTheme();
  if (!points?.length) return <EmptyHint>Not enough status history yet.</EmptyHint>;
  const maxY = Math.max(1, ...points.map(p => Object.values(p.counts).reduce((a, b) => a + b, 0)));
  const width = 520, height = 200;
  return (
    <ChartFrame width={width} height={height} maxY={maxY} xLabels={[fmtShort(points[0].date), fmtShort(points[points.length - 1].date)]}>
      {({ padL, innerW, padT, innerH }) => {
        const x = (i) => padL + (innerW * i) / (points.length - 1);
        const yFor = (v) => padT + innerH - (innerH * v) / maxY;
        let running = points.map(() => 0);
        return STATUS_ORDER.map(status => {
          const path = [];
          points.forEach((p, i) => {
            running[i] += p.counts[status] || 0;
          });
          const topPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${yFor(running[i])}`).join(' ');
          const bottomPath = [...points].reverse().map((p, i) => {
            const idx = points.length - 1 - i;
            const belowValue = running[idx] - (p.counts[status] || 0);
            return `L ${x(idx)} ${yFor(belowValue)}`;
          }).join(' ');
          path.push(topPath, bottomPath, 'Z');
          return (
            <path key={status} d={path.join(' ')} fill={STATUS_COLOR[status]} fillOpacity="0.75" stroke={STATUS_COLOR[status]} strokeWidth="1">
              <title>{status}</title>
            </path>
          );
        });
      }}
    </ChartFrame>
  );
}

// 2. Cycle Time Trend — scatter of individual completions + rolling average line
export function CycleTimeChart({ points }) {
  const theme = useTheme();
  if (!points?.length) return <EmptyHint>No completed tasks with a real status history yet.</EmptyHint>;
  const maxY = Math.max(1, ...points.map(p => Math.max(p.cycleDays, p.rollingAvg)));
  const width = 520, height = 200;
  return (
    <ChartFrame width={width} height={height} maxY={maxY} xLabels={[fmtShort(points[0].date), fmtShort(points[points.length - 1].date)]}>
      {({ padL, innerW, padT, innerH }) => {
        const x = (i) => padL + (innerW * i) / Math.max(1, points.length - 1);
        const yFor = (v) => padT + innerH - (innerH * v) / maxY;
        const avgPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${yFor(p.rollingAvg)}`).join(' ');
        return (
          <>
            <path d={avgPath} fill="none" stroke={theme.colors.copper} strokeWidth="2.5" />
            {points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={yFor(p.cycleDays)} r="2.5" fill={theme.colors.ash} fillOpacity="0.7">
                <title>{p.taskName}: {p.cycleDays}d (completed {fmtShort(p.date)})</title>
              </circle>
            ))}
          </>
        );
      }}
    </ChartFrame>
  );
}

// 3. Aging Work In Progress — horizontal bars, worst (oldest) first
export function AgingWipChart({ items }) {
  const theme = useTheme();
  if (!items?.length) return <EmptyHint>No open tasks — nothing aging.</EmptyHint>;
  const maxAge = Math.max(1, ...items.map(i => i.ageDays));
  return items.map(i => (
    <BarRow key={i.taskId}>
      <BarRowLabel title={i.name}>{i.name}</BarRowLabel>
      <BarTrack>
        <BarFill pct={(i.ageDays / maxAge) * 100} color={i.ageDays > 14 ? theme.colors.danger : theme.colors.warning} />
      </BarTrack>
      <BarRowValue>{i.ageDays}d</BarRowValue>
    </BarRow>
  ));
}

// 4. Overdue Trend — single line, count of tasks overdue as of each bucket date
export function OverdueTrendChart({ points }) {
  const theme = useTheme();
  if (!points?.length) return <EmptyHint>Not enough history yet.</EmptyHint>;
  const maxY = Math.max(1, ...points.map(p => p.count));
  const width = 520, height = 180;
  return (
    <ChartFrame width={width} height={height} maxY={maxY} xLabels={[fmtShort(points[0].date), fmtShort(points[points.length - 1].date)]}>
      {({ padL, innerW, padT, innerH }) => {
        const x = (i) => padL + (innerW * i) / Math.max(1, points.length - 1);
        const yFor = (v) => padT + innerH - (innerH * v) / maxY;
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${yFor(p.count)}`).join(' ');
        return (
          <>
            <path d={path} fill="none" stroke={theme.colors.danger} strokeWidth="2.5" />
            {points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={yFor(p.count)} r="2.5" fill={theme.colors.danger}>
                <title>{fmtShort(p.date)}: {p.count} overdue</title>
              </circle>
            ))}
          </>
        );
      }}
    </ChartFrame>
  );
}

// 5. Blocked Time by Activity — horizontal bars, worst first
export function BlockedTimeChart({ items }) {
  const theme = useTheme();
  if (!items?.length) return <EmptyHint>No Activity has spent time Blocked yet.</EmptyHint>;
  const maxDays = Math.max(1, ...items.map(i => i.blockedDays));
  return items.map(i => (
    <BarRow key={i.activityId}>
      <BarRowLabel title={i.name}>{i.name}</BarRowLabel>
      <BarTrack>
        <BarFill pct={(i.blockedDays / maxDays) * 100} color={theme.colors.danger} />
      </BarTrack>
      <BarRowValue>{i.blockedDays}d</BarRowValue>
    </BarRow>
  ));
}

// 6. Planned vs Actual Duration by Phase — paired bars per phase
export function PhaseDurationChart({ items }) {
  const theme = useTheme();
  if (!items?.length) return <EmptyHint>No phases with enough date/history info yet.</EmptyHint>;
  const maxDays = Math.max(1, ...items.flatMap(i => [i.plannedDays || 0, i.actualDays || 0]));
  return items.map(i => (
    <div key={i.phaseId} style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.colors.onyx, marginBottom: 2 }} title={i.name}>{i.name}</div>
      {i.plannedDays != null && (
        <BarRow style={{ padding: '2px 0' }}>
          <BarRowLabel style={{ fontSize: 9, color: theme.colors.ash }}>Planned</BarRowLabel>
          <BarTrack><BarFill pct={(i.plannedDays / maxDays) * 100} color={theme.colors.ash} /></BarTrack>
          <BarRowValue>{i.plannedDays}d</BarRowValue>
        </BarRow>
      )}
      {i.actualDays != null && (
        <BarRow style={{ padding: '2px 0' }}>
          <BarRowLabel style={{ fontSize: 9, color: theme.colors.ash }}>Actual{i.ongoing ? ' (so far)' : ''}</BarRowLabel>
          <BarTrack><BarFill pct={(i.actualDays / maxDays) * 100} color={i.ongoing ? theme.colors.warning : theme.colors.copper} /></BarTrack>
          <BarRowValue>{i.actualDays}d</BarRowValue>
        </BarRow>
      )}
    </div>
  ));
}

export const INSIGHT_RENDERERS = {
  cfd:          ({ data }) => <CumulativeFlowChart points={data.cfd} />,
  cycleTime:    ({ data }) => <CycleTimeChart points={data.cycleTime} />,
  agingWip:     ({ data }) => <AgingWipChart items={data.agingWip} />,
  overdueTrend: ({ data }) => <OverdueTrendChart points={data.overdueTrend} />,
  blockedTime:  ({ data }) => <BlockedTimeChart items={data.blockedTime} />,
  phaseDuration:({ data }) => <PhaseDurationChart items={data.phaseDuration} />,
};
