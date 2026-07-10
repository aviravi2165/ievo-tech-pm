import styled from '@emotion/styled';

// Colors/status-color maps that used to live as a `T`/`PRIORITY_COLOR`/etc
// object built directly from the imported theme.js module now live in
// DashboardModule.js as functions of `theme` from useTheme() — same
// portability reasoning as everywhere else in this pass: read theme via
// Emotion's context, not a direct file import, so this becomes a drop-in
// component elsewhere as long as the consuming app provides an equivalent
// theme shape.

export const Wrap = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.greige};
  font-family: inherit;
  overflow: hidden;
`;

export const Header = styled.div` padding: 24px 28px 0; flex-shrink: 0; `;

export const Title = styled.h1`
  margin: 0 0 3px;
  font-size: 24px;
  font-weight: 700;
  color: ${p => p.theme.colors.onyx};
  font-family: 'Cormorant Garamond', Georgia, serif;
`;

export const Subtitle = styled.p`
  margin: 0 0 20px;
  font-size: 13px;
  color: ${p => p.theme.colors.ash};
`;

export const ErrorBanner = styled.div`
  margin-bottom: 16px;
  padding: 9px 14px;
  background: ${p => p.theme.colors.danger}1a;
  border: 1px solid ${p => p.theme.colors.danger}40;
  border-radius: 6px;
  font-size: 13px;
  color: ${p => p.theme.colors.danger};
`;

export const HrLine = styled.div` height: 1px; background: ${p => p.theme.colors.border}; `;

export const LoadingWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p => p.theme.colors.ashLight};
  font-size: 13px;
`;

export const BodyGrid = styled.div` flex: 1; overflow: hidden; display: flex; `;

export const LeftCol = styled.div`
  flex: 0 0 52%;
  overflow: auto;
  padding: 20px 28px;
  border-right: 1px solid ${p => p.theme.colors.border};
`;

export const RightCol = styled.div` flex: 0 0 48%; overflow: auto; padding: 20px 24px; `;

export const Section = styled.div` margin-bottom: ${p => (p.tight ? 0 : '32px')}; `;

export const SectionHeadRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
`;

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.ash};
`;

export const SectionPill = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: ${p => p.theme.colors.onAccent};
  background: ${p => p.bg || p.theme.colors.black};
  border-radius: 10px;
  padding: 1px 8px;
  line-height: 18px;
`;

export const EmptyText = styled.div`
  padding: 28px 0;
  text-align: center;
  color: ${p => p.theme.colors.ash};
  font-size: 13px;
`;

export const TabBarRow = styled.div`
  display: flex;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  margin-bottom: 14px;
`;

export const TabBtn = styled.button`
  padding: 6px 13px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: ${p => (p.active ? 700 : 400)};
  color: ${p => (p.active ? p.theme.colors.onyx : p.theme.colors.ash)};
  border-bottom: 2px solid ${p => (p.active ? p.theme.colors.onyx : 'transparent')};
  margin-bottom: -1px;
`;

export const TabCount = styled.span`
  margin-left: 4px;
  font-size: 10px;
  color: ${p => (p.active ? p.theme.colors.onyx : p.theme.colors.ashLight)};
`;

export const CardWrap = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px;
  overflow: hidden;
`;

export const RequestCard = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px;
  padding: 14px 16px;
  margin-bottom: 8px;
  opacity: ${p => (p.pending ? 1 : 0.7)};
`;

export const ReqHeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
`;

export const ReqName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${p => p.theme.colors.black};
  margin-bottom: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ReqBreadcrumb = styled.div` font-size: 11px; color: ${p => p.theme.colors.ashLight}; `;

export const ReqMetaRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: ${p => (p.pending ? '12px' : '4px')};
`;

export const ReqMeta = styled.span` font-size: 11px; color: ${p => p.theme.colors.ashLight}; ${p => p.pushRight && 'margin-left:auto;'} `;

export const ReqMetaStrong = styled.strong` color: ${p => p.theme.colors.ash}; `;

export const ReqDescription = styled.p`
  font-size: 12px;
  color: ${p => p.theme.colors.ash};
  line-height: 1.6;
  margin: 0 0 12px;
  padding-left: 10px;
  border-left: 2px solid ${p => p.theme.colors.border};
`;

export const ReqActions = styled.div` display: flex; gap: 8px; `;

export const AcceptBtn = styled.button`
  flex: 1;
  padding: 7px 0;
  border: none;
  border-radius: 5px;
  font-family: inherit;
  background: ${p => (p.disabled ? p.theme.colors.border : p.theme.colors.espresso)};
  color: ${p => p.theme.colors.onAccent};
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
`;

export const DeclineBtn = styled.button`
  flex: 1;
  padding: 7px 0;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 5px;
  font-family: inherit;
  background: ${p => p.theme.colors.white};
  color: ${p => p.theme.colors.danger};
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
`;

export const RespondedNote = styled.div` font-size: 11px; color: ${p => p.theme.colors.ashLight}; `;

export const Chip = styled.span`
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 20px;
  background: ${p => p.bg || 'transparent'};
  color: ${p => p.color || p.theme.colors.ash};
  border: 1px solid ${p => p.border || p.theme.colors.border};
  white-space: nowrap;
  line-height: 16px;
`;

export const TaskRowBtn = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.12s;

  &:hover { background: ${p => p.theme.colors.greige}; }
`;

export const TaskLeft = styled.div` flex: 1; min-width: 0; `;

export const TaskName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${p => p.theme.colors.onyx};
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const TaskBreadcrumb = styled.div`
  font-size: 11px;
  color: ${p => p.theme.colors.ashLight};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const TaskRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
`;

export const TaskBadgeRow = styled.div` display: flex; gap: 5px; `;

export const TaskDue = styled.span`
  font-size: 10px;
  font-weight: ${p => (p.overdue ? 700 : 400)};
  color: ${p => (p.overdue ? p.theme.colors.danger : p.theme.colors.ashLight)};
`;

export const AuditRowWrap = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  align-items: flex-start;
`;

// Was theme.colors.border (a near-invisible light grey) — every activity
// row read as flat and lifeless with no visual anchor. Copper matches the
// PM board's phase-tile accent, so the dashboard's activity feed now ties
// into the same warm accent family instead of introducing a third,
// unrelated grey.
export const AuditDot = styled.div`
  width: 7px; height: 7px; border-radius: 50%;
  background: ${p => p.theme.colors.copper};
  margin-top: 6px; flex-shrink: 0;
`;

export const AuditBody = styled.div` flex: 1; min-width: 0; `;

export const AuditLine = styled.div` font-size: 12.5px; color: ${p => p.theme.colors.onyx}; line-height: 1.45; `;

export const AuditActor = styled.strong` font-weight: 600; `;

// The "X → Y" status-change pill (e.g. "Complete → To Do") was the same
// washed-out grey-on-grey as everything else in the feed — the one piece
// of actually useful information in each row (what changed) didn't stand
// out from the surrounding chrome at all. Copper-tinted like AuditDot
// above, so the dot and the detail pill read as one coherent accent
// rather than two different treatments.
export const AuditDetail = styled.span`
  margin-left: 5px;
  font-size: 11px;
  font-weight: 600;
  color: ${p => p.theme.colors.copper};
  background: ${p => p.theme.colors.copper}1a;
  border: 1px solid ${p => p.theme.colors.copper}40;
  border-radius: 4px;
  padding: 0 5px;
`;

export const AuditMeta = styled.div` font-size: 11px; color: ${p => p.theme.colors.ashLight}; margin-top: 2px; `;

export const AuditProject = styled.span` font-weight: 500; color: ${p => p.theme.colors.ash}; `;

// ── Admin dashboard — stat tiles ────────────────────────────────────────────────

export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  padding: 0 28px 20px;
  flex-shrink: 0;
`;

export const StatTile = styled.button`
  text-align: left;
  font-family: inherit;
  cursor: ${p => (p.clickable ? 'pointer' : 'default')};
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-left: 3px solid ${p => p.accent || p.theme.colors.border};
  border-radius: 8px;
  padding: 12px 14px;
  transition: box-shadow 0.12s, transform 0.12s;

  ${p => p.clickable && `
    &:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); transform: translateY(-1px); }
  `}
`;

export const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  font-family: 'Cormorant Garamond', Georgia, serif;
  color: ${p => p.accent || p.theme.colors.onyx};
  line-height: 1.1;
`;

export const StatLabel = styled.div`
  font-size: 11px;
  color: ${p => p.theme.colors.ash};
  margin-top: 3px;
  font-weight: 500;
`;

export const DeptRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 12px;
`;

export const DeptBar = styled.div`
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: ${p => p.theme.colors.mid};
  overflow: hidden;
`;

export const DeptBarFill = styled.div`
  height: 100%;
  border-radius: 3px;
  background: ${p => p.theme.colors.copper};
  width: ${p => p.pct}%;
`;

export const DeptName = styled.span` flex: 0 0 110px; color: ${p => p.theme.colors.onyx}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; `;
export const DeptCount = styled.span` flex: 0 0 22px; text-align: right; color: ${p => p.theme.colors.ashLight}; font-size: 11px; `;
