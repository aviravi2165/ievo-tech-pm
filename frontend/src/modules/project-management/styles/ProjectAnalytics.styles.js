// Analytics tab — kept as its own styles file (not folded into
// shared.styles.js) for the same reason Table.styles.js is separate: a
// tightly-coupled subsystem (stat tiles, bar rows, donut legend) that's
// easier to read as one unit. Visual language matches the rest of the PM
// module (same radius/border/font tokens) rather than importing dashboard's
// StatTile — modules keep their own styles/, established by shared.styles.js
// itself ("this file is the PM module's equivalent of [each other module's]
// shared.styles.js").
import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

export const AnalyticsWrap = styled.div` display: flex; flex-direction: column; gap: 28px; `;

export const StatGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;
`;

export const StatTile = styled.div`
  background: ${t(th => th.colors.white)};
  border: 1px solid ${t(th => th.colors.border)};
  border-left: 3px solid ${(props) => props.accent || props.theme.colors.border};
  border-radius: ${t(th => th.radius.lg)};
  padding: 12px 14px;
`;
export const StatValue = styled.div`
  font-size: 24px; font-weight: 700; font-family: Georgia, serif;
  color: ${(props) => props.accent || props.theme.colors.onyx}; line-height: 1.1;
`;
export const StatLabel = styled.div`
  font-size: 11px; color: ${t(th => th.colors.ash)}; margin-top: 3px; font-weight: 500;
`;

export const Section = styled.div`
  background: ${t(th => th.colors.white)};
  border: 1px solid ${t(th => th.colors.border)};
  border-radius: ${t(th => th.radius.lg)};
  padding: 16px 18px;
`;
export const SectionTitle = styled.h3`
  margin: 0 0 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: ${t(th => th.colors.ash)};
`;
export const SectionHint = styled.p`
  margin: 0 0 14px; font-size: 11.5px; color: ${t(th => th.colors.ashLight)}; line-height: 1.5;
`;

export const AnalyticsGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

// ── Horizontal bar row (Progress by Phase / Priority breakdown) ──────────────
export const BarRow = styled.div`
  display: flex; align-items: center; gap: 10px; padding: 6px 0;
`;
export const BarRowLabel = styled.div`
  width: 120px; flex-shrink: 0; font-size: 12px; color: ${t(th => th.colors.onyx)};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
export const BarTrack = styled.div`
  flex: 1; height: 10px; background: ${t(th => th.colors.mid)};
  border-radius: 5px; overflow: hidden; position: relative;
`;
export const BarFill = styled.div`
  height: 100%; border-radius: 5px;
  background: ${(props) => props.color};
  width: ${(props) => Math.min(100, Math.max(0, props.pct))}%;
  transition: width 0.3s ease;
`;
export const BarRowValue = styled.div`
  width: 92px; flex-shrink: 0; text-align: right; font-size: 11px; color: ${t(th => th.colors.ash)};
  font-weight: 600; white-space: nowrap;
`;

// ── Donut legend row ───────────────────────────────────────────────────────
export const LegendRow = styled.div`
  display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px;
`;
export const LegendDot = styled.span`
  width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  background: ${(props) => props.color};
`;
export const LegendLabel = styled.span` flex: 1; color: ${t(th => th.colors.onyx)}; `;
export const LegendValue = styled.span` font-weight: 700; color: ${t(th => th.colors.onyx)}; font-size: 12px; `;

// ── Team workload table ───────────────────────────────────────────────────
export const WorkloadTable = styled.div` display: flex; flex-direction: column; `;
export const WorkloadRow = styled.div`
  display: flex; align-items: center; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid ${t(th => th.colors.border)};
  &:last-child { border-bottom: none; }
`;
export const WorkloadAvatar = styled.div`
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: ${t(th => th.colors.mid)}; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: ${t(th => th.colors.onyx)}; font-family: Georgia, serif;
`;
export const WorkloadName = styled.div`
  flex: 1; font-size: 12.5px; color: ${t(th => th.colors.onyx)}; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
export const WorkloadChip = styled.span`
  font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
  color: ${(props) => props.color}; background: ${(props) => props.color}1a;
  white-space: nowrap;
`;

// ── Week-bucket bars (completions over time) ──────────────────────────────
export const WeekBars = styled.div`
  display: flex; align-items: flex-end; gap: 10px; height: 110px; padding-top: 10px;
`;
export const WeekBarCol = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%;
  justify-content: flex-end;
`;
export const WeekBarFill = styled.div`
  width: 100%; max-width: 34px; border-radius: 4px 4px 2px 2px;
  background: ${t(th => th.colors.copper)};
  height: ${(props) => props.pct}%;
  min-height: ${(props) => (props.value > 0 ? '4px' : '0')};
  transition: height 0.3s ease;
`;
export const WeekBarLabel = styled.div` font-size: 9.5px; color: ${t(th => th.colors.ashLight)}; text-align: center; `;
export const WeekBarValue = styled.div` font-size: 10.5px; color: ${t(th => th.colors.onyx)}; font-weight: 700; `;

export const EmptyHint = styled.div`
  font-size: 12px; color: ${t(th => th.colors.ash)}; padding: 20px 0; text-align: center;
`;
