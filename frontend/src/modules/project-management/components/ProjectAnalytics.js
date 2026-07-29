import { useRef, useState } from 'react';
import { useTheme } from '@emotion/react';
import { useProjectAnalytics } from '../hooks/useProjectAnalytics';
import { useProjectInsights } from '../hooks/useProjectInsights';
import { INSIGHT_RENDERERS } from './InsightWidgets';
import FloatingPopover from '../../shared/components/FloatingPopover';
import { BtnPrimary, BtnGhost, IconBtnDanger } from '../styles/shared.styles';
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

const ONTIME_COLOR = { 'On Time': '#446f17', Late: '#c12d16' };

// SectionHeader — title/hint + a remove (×) button, used on every catalog
// section (the original fixed ones AND the optional "+ Add Insight" ones)
// so both get identical remove/re-add treatment — no section is special-
// cased as un-removable.
function SectionHeader({ title, hint, onRemove, mutating, canRemove = true }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <SectionTitle>{title}</SectionTitle>
        {hint && <SectionHint>{hint}</SectionHint>}
      </div>
      {canRemove && (
      <IconBtnDanger title="Remove this section" disabled={mutating} onClick={onRemove} style={{ width: 22, height: 22, flexShrink: 0 }}>
        ×
      </IconBtnDanger>
      )}
    </div>
  );
}

// BurnUpChart — cumulative-completions "project journey" line chart.
// Actual (solid) vs Ideal (dashed, only when both planned dates exist) —
// classic burn-up shape: flat stretches show stalled work, a line crossing
// above Ideal is ahead of schedule, below is behind. Hand-rolled SVG to
// match Donut/WeekBars above rather than pulling in a charting library.
function BurnUpChart({ points, totalTasks, width = 520, height = 180 }) {
  const theme = useTheme();
  const padL = 28, padR = 12, padT = 12, padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxY = Math.max(totalTasks, ...points.map(p => p.actual), 1);
  const x = (i) => padL + (innerW * i) / (points.length - 1);
  const y = (v) => padT + innerH - (innerH * v) / maxY;
  const pathFor = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`).join(' ');
  const hasIdeal = points.every(p => p.ideal != null);
  const today = new Date();
  const todayIdx = points.findIndex((p, i) => i === points.length - 1 || (p.date <= today && points[i + 1]?.date > today));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      {/* Y gridlines / labels — 0, half, max */}
      {[0, 0.5, 1].map(f => (
        <g key={f}>
          <line x1={padL} x2={width - padR} y1={y(maxY * f)} y2={y(maxY * f)} stroke={theme.colors.border} strokeWidth="1" />
          <text x={padL - 6} y={y(maxY * f) + 3} textAnchor="end" fontSize="9" fill={theme.colors.ash}>{Math.round(maxY * f)}</text>
        </g>
      ))}
      {hasIdeal && (
        <path d={pathFor('ideal')} fill="none" stroke={theme.colors.ash} strokeWidth="1.5" strokeDasharray="4 3" />
      )}
      <path d={pathFor('actual')} fill="none" stroke={theme.colors.copper} strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.actual)} r={i === todayIdx ? 3.5 : 2.5}
          fill={theme.colors.copper} stroke={theme.colors.white} strokeWidth="1">
          <title>{p.date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}: {p.actual} done{hasIdeal ? ` (ideal ${p.ideal})` : ''}</title>
        </circle>
      ))}
      {/* X labels — first, today/last, last only, to avoid crowding */}
      <text x={x(0)} y={height - 6} textAnchor="start" fontSize="9" fill={theme.colors.ash}>
        {points[0].date.toLocaleDateString([], { day: 'numeric', month: 'short' })}
      </text>
      <text x={x(points.length - 1)} y={height - 6} textAnchor="end" fontSize="9" fill={theme.colors.ash}>
        {points[points.length - 1].date.toLocaleDateString([], { day: 'numeric', month: 'short' })}
      </text>
    </svg>
  );
}

export default function ProjectAnalytics({ project, phases, active }) {
  const theme = useTheme();
  const { loading, error, stats } = useProjectAnalytics(project.projectId, phases, active, {
    plannedStart: project.plannedStart, plannedEnd: project.plannedEnd,
  });
  const {
    catalog: insightCatalog, added: addedInsights, available: availableInsights, data: insightsData,
    mutating: insightsMutating, addInsight, removeInsight,
  } = useProjectInsights(project.projectId, active);
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBtnRef = useRef(null);
  // Add/remove is Manager-gated on the backend (same as every other change
  // to what a project looks like for everyone viewing it) — hide the
  // controls for non-Managers entirely rather than showing them a button
  // that just 403s, matching how MemberManager.js hides its "Add member"
  // panel for non-Managers instead of showing it disabled/erroring.
  const canManageInsights = project.myRole === 'Manager';

  if (!phases.length) {
    return <EmptyHint>No phases yet — add phases and activities to see analytics here.</EmptyHint>;
  }
  if (loading) {
    return <EmptyHint>Loading analytics…</EmptyHint>;
  }
  if (error) {
    return <div style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</div>;
  }

  const { totalTasks, completeTasks, overdueTasks, blockedTasks, statusCounts, priorityCounts, workload, weeks, onTimeCount, lateCount, avgLateDays, burnup } = stats;
  const onTimeTotal = onTimeCount + lateCount;
  const onTimePct = onTimeTotal ? Math.round((onTimeCount / onTimeTotal) * 100) : null;
  const completionPct = project.progress || 0;
  const maxWeekCount = Math.max(1, ...weeks.map(w => w.count));

  const sortedPhases = [...phases].sort((a, b) => (b.progress || 0) - (a.progress || 0));
  const visibleKeys = new Set(addedInsights.map(a => a.insightType));
  // Before the insights catalog itself has loaded, default to showing every
  // fixed section rather than flashing them all hidden for one render — we
  // don't yet know about any per-project overrides, and "show the original
  // defaults" is the correct assumption for that brief window anyway.
  const insightsReady = insightCatalog.length > 0;
  const isVisible = (key) => !insightsReady || visibleKeys.has(key);

  return (
    <AnalyticsWrap>
      {canManageInsights && (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <BtnPrimary ref={addBtnRef} onClick={() => setPickerOpen(v => !v)} style={{ fontSize: 12 }}>
          + Add Insight
        </BtnPrimary>
        <FloatingPopover anchorRef={addBtnRef} open={pickerOpen} onClose={() => setPickerOpen(false)} align="right" width={320}>
          <div style={{
            background: theme.colors.white, border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm, boxShadow: '0 10px 32px rgba(0,0,0,0.18)', padding: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Add an insight
            </div>
            {availableInsights.length === 0 ? (
              <div style={{ fontSize: 12, color: theme.colors.ash, padding: '6px 2px' }}>
                Every available insight has already been added.
              </div>
            ) : availableInsights.map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 4px', borderBottom: `1px solid ${theme.colors.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.colors.onyx }}>{c.label}</div>
                  <div style={{ fontSize: 10.5, color: theme.colors.ash, marginTop: 2, lineHeight: 1.4 }}>{c.description}</div>
                </div>
                <BtnGhost
                  disabled={insightsMutating}
                  onClick={async () => { await addInsight(c.key); }}
                  style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
                >
                  Add
                </BtnGhost>
              </div>
            ))}
          </div>
        </FloatingPopover>
      </div>
      )}

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
        {isVisible('progressByPhase') && (
          <Section>
            <SectionHeader title="Progress by Phase" hint="Each phase's own completion percentage, most complete first."
              onRemove={() => removeInsight('progressByPhase')} mutating={insightsMutating} canRemove={canManageInsights} />
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
        )}

        {isVisible('statusDistribution') && (
          <Section>
            <SectionHeader title="Task Status Distribution" hint="Every task across all activities in this project, by current status."
              onRemove={() => removeInsight('statusDistribution')} mutating={insightsMutating} canRemove={canManageInsights} />
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
        )}
      </AnalyticsGrid>

      <AnalyticsGrid>
        {isVisible('priorityBreakdown') && (
          <Section>
            <SectionHeader title="Priority Breakdown" hint="All tasks by priority level."
              onRemove={() => removeInsight('priorityBreakdown')} mutating={insightsMutating} canRemove={canManageInsights} />
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
        )}

        {isVisible('teamWorkload') && (
          <Section>
            <SectionHeader title="Team Workload" hint="Active (not yet complete) and overdue tasks per assignee, busiest first."
              onRemove={() => removeInsight('teamWorkload')} mutating={insightsMutating} canRemove={canManageInsights} />
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
        )}
      </AnalyticsGrid>

      {isVisible('projectJourney') && (
        <Section>
          <SectionHeader title="Project Journey"
            hint={`Cumulative tasks completed over time${burnup.length && burnup.every(p => p.ideal != null) ? ', against an ideal pace from the planned start to the planned end' : ''}.`}
            onRemove={() => removeInsight('projectJourney')} mutating={insightsMutating} canRemove={canManageInsights} />
          {burnup.length === 0 ? (
            <EmptyHint>
              {totalTasks === 0 ? 'No tasks yet.' : 'Set a planned start date (or complete a task) to see the project’s journey here.'}
            </EmptyHint>
          ) : (
            <>
              <BurnUpChart points={burnup} totalTasks={totalTasks} />
              <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 10, color: theme.colors.ash }}>
                <span><span style={{ color: theme.colors.copper, fontWeight: 700 }}>—</span> Actual completed</span>
                {burnup.every(p => p.ideal != null) && (
                  <span><span style={{ color: theme.colors.ash, fontWeight: 700 }}>- - -</span> Ideal pace</span>
                )}
              </div>
            </>
          )}
        </Section>
      )}

      <AnalyticsGrid>
        {isVisible('weeklyCompletions') && (
          <Section>
            <SectionHeader title="Completions — Last 6 Weeks"
              hint="Tasks currently marked Complete, bucketed by the week they actually finished (from each task's real status-change history)."
              onRemove={() => removeInsight('weeklyCompletions')} mutating={insightsMutating} canRemove={canManageInsights} />
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
        )}

        {isVisible('onTimeCompletion') && (
          <Section>
            <SectionHeader title="On-Time Completion"
              hint="Completed tasks, by whether they finished at or before their due date (excludes tasks completed before this tracking existed)."
              onRemove={() => removeInsight('onTimeCompletion')} mutating={insightsMutating} canRemove={canManageInsights} />
            {onTimeTotal === 0 ? <EmptyHint>No completed tasks with a due date yet.</EmptyHint> : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <Donut segments={[
                  { label: 'On Time', count: onTimeCount, color: ONTIME_COLOR['On Time'] },
                  { label: 'Late', count: lateCount, color: ONTIME_COLOR.Late },
                ]} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <LegendRow>
                    <LegendDot color={ONTIME_COLOR['On Time']} />
                    <LegendLabel>On Time</LegendLabel>
                    <LegendValue>{onTimeCount}</LegendValue>
                  </LegendRow>
                  <LegendRow>
                    <LegendDot color={ONTIME_COLOR.Late} />
                    <LegendLabel>Late{avgLateDays > 0 ? ` (avg ${avgLateDays}d)` : ''}</LegendLabel>
                    <LegendValue>{lateCount}</LegendValue>
                  </LegendRow>
                  {onTimePct != null && (
                    <div style={{ marginTop: 8, fontSize: 11, color: theme.colors.ash }}>{onTimePct}% on time</div>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}
      </AnalyticsGrid>

      {/* ── Added insights — always appended below the fixed set above,
          never replacing it (per the "+ Add Insight" design: extend, don't
          reconfigure). Each renders via INSIGHT_RENDERERS keyed by its
          catalog type; a Manager can remove one from here too. */}
      {addedInsights.map(({ insightType }) => {
        const catalogEntry = insightCatalog.find(c => c.key === insightType);
        const renderer = INSIGHT_RENDERERS[insightType];
        if (!renderer) return null;
        return (
          <Section key={insightType}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <SectionTitle>{catalogEntry?.label || insightType}</SectionTitle>
                {catalogEntry?.description && <SectionHint>{catalogEntry.description}</SectionHint>}
              </div>
              {canManageInsights && (
              <IconBtnDanger
                title="Remove this insight"
                disabled={insightsMutating}
                onClick={() => removeInsight(insightType)}
                style={{ width: 22, height: 22, flexShrink: 0 }}
              >
                ×
              </IconBtnDanger>
              )}
            </div>
            {renderer({ data: insightsData })}
          </Section>
        );
      })}
    </AnalyticsWrap>
  );
}
