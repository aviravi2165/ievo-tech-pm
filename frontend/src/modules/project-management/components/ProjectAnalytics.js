import { useTheme } from '@emotion/react';
import { useProjectAnalytics } from '../hooks/useProjectAnalytics';
import {
  AnalyticsWrap, StatGrid, StatTile, StatValue, StatLabel,
  Section, SectionTitle, SectionHint, AnalyticsGrid,
  BarRow, BarRowLabel, BarTrack, BarFill, BarRowValue,
  LegendRow, LegendDot, LegendLabel, LegendValue,
  WorkloadTable, WorkloadRow, WorkloadAvatar, WorkloadName, WorkloadChip,
  WeekBars, WeekBarCol, WeekBarFill, WeekBarLabel, WeekBarValue,
  EmptyHint,
} from '../styles/ProjectAnalytics.styles';

// Validated categorical palette (dataviz skill: `validate_palette.js` — all
// checks pass for this 6-hue set, worst adjacent CVD ΔE 16.7) built from
// this app's OWN theme hues rather than the skill's generic default —
// swapping in blue/aqua/violet would clash with the app's warm
// copper/charcoal language everywhere else. Cycles + falls back to ash
// past 6 phases (rare; still legible, just no longer guaranteed
// CVD-distinct at that point).
const PHASE_PALETTE = ['#b47027', '#256293', '#446f17', '#d38a3c', '#c12d16', '#7d5ba6'];

// Fixed status colors — same mapping already used for StatusBadge/
// taskStatusStyle across the Dashboard, so a status means the same color
// here as everywhere else in the app, not a second competing palette.
const STATUS_COLOR = { 'To Do': '#256293', Ongoing: '#b47027', Blocked: '#c12d16', Complete: '#446f17' };
const PRIORITY_COLOR = { Low: '#79726B', Medium: '#256293', High: '#d38a3c', Critical: '#c12d16' };

function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

function Donut({ segments, size = 130 }) {
  const theme = useTheme();
  const total = segments.reduce((s, x) => s + x.count, 0);
  const r = 48;
  const c = 2 * Math.PI * r;
  let offset = 0;
  if (!total) {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke={theme.colors.mid} strokeWidth="14" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <g transform="rotate(-90 60 60)">
        {segments.filter(s => s.count > 0).map(s => {
          const frac = s.count / total;
          // 2px surface gap between segments (mark spec) — shave a hair off
          // each dash so adjacent wedges don't touch at full saturation.
          const dash = Math.max(frac * c - 2, 0);
          const el = (
            <circle key={s.label} cx="60" cy="60" r={r} fill="none"
              stroke={s.color} strokeWidth="14" strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset} strokeLinecap="butt">
              <title>{s.label}: {s.count} ({Math.round(frac * 100)}%)</title>
            </circle>
          );
          offset += frac * c;
          return el;
        })}
      </g>
      <text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fontFamily="Georgia, serif" fill={theme.colors.onyx}>
        {total}
      </text>
      <text x="60" y="72" textAnchor="middle" fontSize="9" fill={theme.colors.ash}>
        task{total !== 1 ? 's' : ''}
      </text>
    </svg>
  );
}

export default function ProjectAnalytics({ project, phases, active }) {
  const theme = useTheme();
  const { loading, error, stats } = useProjectAnalytics(phases, active);

  if (!phases.length) {
    return <EmptyHint>No phases yet — add phases and activities to see analytics here.</EmptyHint>;
  }
  if (loading) {
    return <EmptyHint>Loading analytics…</EmptyHint>;
  }
  if (error) {
    return <div style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</div>;
  }

  const { totalTasks, completeTasks, overdueTasks, blockedTasks, statusCounts, priorityCounts, workload, weeks } = stats;
  const completionPct = project.progress || 0;
  const maxWeekCount = Math.max(1, ...weeks.map(w => w.count));

  const sortedPhases = [...phases].sort((a, b) => (b.progress || 0) - (a.progress || 0));

  return (
    <AnalyticsWrap>
      <StatGrid>
        <StatTile accent={theme.colors.copper}>
          <StatValue accent={theme.colors.copper}>{completionPct}%</StatValue>
          <StatLabel>Overall Completion</StatLabel>
        </StatTile>
        <StatTile accent={theme.colors.success}>
          <StatValue accent={theme.colors.success}>{completeTasks}<span style={{ fontSize: 14, color: theme.colors.ash, fontWeight: 500 }}> / {totalTasks}</span></StatValue>
          <StatLabel>Tasks Complete</StatLabel>
        </StatTile>
        <StatTile accent={overdueTasks ? theme.colors.danger : theme.colors.border}>
          <StatValue accent={overdueTasks ? theme.colors.danger : undefined}>{overdueTasks}</StatValue>
          <StatLabel>Overdue Tasks</StatLabel>
        </StatTile>
        <StatTile accent={blockedTasks ? theme.colors.danger : theme.colors.border}>
          <StatValue accent={blockedTasks ? theme.colors.danger : undefined}>{blockedTasks}</StatValue>
          <StatLabel>Blocked Tasks</StatLabel>
        </StatTile>
      </StatGrid>

      <AnalyticsGrid>
        <Section>
          <SectionTitle>Progress by Phase</SectionTitle>
          <SectionHint>Each phase's own completion percentage, most complete first.</SectionHint>
          {sortedPhases.length === 0
            ? <EmptyHint>No phases yet.</EmptyHint>
            : sortedPhases.map((p, i) => (
              <BarRow key={p.phaseId}>
                <BarRowLabel title={p.name}>{p.name}</BarRowLabel>
                <BarTrack>
                  <BarFill pct={p.progress || 0} color={PHASE_PALETTE[i % PHASE_PALETTE.length]} />
                </BarTrack>
                <BarRowValue>{p.progress || 0}%</BarRowValue>
              </BarRow>
            ))}
        </Section>

        <Section>
          <SectionTitle>Task Status Distribution</SectionTitle>
          <SectionHint>Every task across all activities in this project, by current status.</SectionHint>
          {totalTasks === 0 ? <EmptyHint>No tasks yet.</EmptyHint> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <Donut segments={statusCounts.map(s => ({ label: s.status, count: s.count, color: STATUS_COLOR[s.status] }))} />
              <div style={{ flex: 1, minWidth: 140 }}>
                {statusCounts.map(s => (
                  <LegendRow key={s.status}>
                    <LegendDot color={STATUS_COLOR[s.status]} />
                    <LegendLabel>{s.status}</LegendLabel>
                    <LegendValue>{s.count}</LegendValue>
                  </LegendRow>
                ))}
              </div>
            </div>
          )}
        </Section>
      </AnalyticsGrid>

      <AnalyticsGrid>
        <Section>
          <SectionTitle>Priority Breakdown</SectionTitle>
          <SectionHint>All tasks by priority level.</SectionHint>
          {totalTasks === 0 ? <EmptyHint>No tasks yet.</EmptyHint> : priorityCounts.map(p => (
            <BarRow key={p.priority}>
              <BarRowLabel>{p.priority}</BarRowLabel>
              <BarTrack>
                <BarFill pct={totalTasks ? (p.count / totalTasks) * 100 : 0} color={PRIORITY_COLOR[p.priority]} />
              </BarTrack>
              <BarRowValue>{p.count} task{p.count !== 1 ? 's' : ''}</BarRowValue>
            </BarRow>
          ))}
        </Section>

        <Section>
          <SectionTitle>Team Workload</SectionTitle>
          <SectionHint>Active (not yet complete) and overdue tasks per assignee, busiest first.</SectionHint>
          {workload.length === 0 ? <EmptyHint>No one is assigned to any task yet.</EmptyHint> : (
            <WorkloadTable>
              {workload.slice(0, 8).map(w => (
                <WorkloadRow key={w.userId}>
                  <WorkloadAvatar>{initials(w.name)}</WorkloadAvatar>
                  <WorkloadName title={w.name}>{w.name}</WorkloadName>
                  <WorkloadChip color={theme.colors.info}>{w.active} active</WorkloadChip>
                  {w.overdue > 0 && <WorkloadChip color={theme.colors.danger}>{w.overdue} overdue</WorkloadChip>}
                </WorkloadRow>
              ))}
            </WorkloadTable>
          )}
        </Section>
      </AnalyticsGrid>

      <Section>
        <SectionTitle>Completions — Last 6 Weeks</SectionTitle>
        <SectionHint>
          Tasks currently marked Complete, bucketed by their due date (a proxy for when that work
          was scheduled — this project's data doesn't record an exact completion timestamp per task).
        </SectionHint>
        {totalTasks === 0 ? <EmptyHint>No tasks yet.</EmptyHint> : (
          <WeekBars>
            {weeks.map((w, i) => (
              <WeekBarCol key={i}>
                <WeekBarValue>{w.count || ''}</WeekBarValue>
                <WeekBarFill pct={(w.count / maxWeekCount) * 100} value={w.count} />
                <WeekBarLabel>{w.end.toLocaleDateString([], { day: 'numeric', month: 'short' })}</WeekBarLabel>
              </WeekBarCol>
            ))}
          </WeekBars>
        )}
      </Section>
    </AnalyticsWrap>
  );
}
