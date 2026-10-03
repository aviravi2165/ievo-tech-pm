import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

// flex: 0 1 auto (not flex: 1) — a growing name pushes everything after it
// (the meta cluster) around based on wherever its own edge lands rather than
// staying anchored; a dedicated spacer div in ActivityRow.js does the actual
// growing instead, so [chevron+name] stays pinned left and
// [date/progress/status/badges + action toolbar] stays pinned right.
// min-width:70 (not 0) — same latent bug TaskName had: with no floor, this
// shrinkable element can compress all the way to invisible under space
// pressure instead of just truncating with its ellipsis.
export const ActivityName = styled.span`
  font-size: 10.5px; font-weight: 600; color: ${t(th => th.colors.onyx)};
  flex: 0 1 auto; min-width: 70px;
  /* Full name always visible — wrap to a second line if the Name column is
     too narrow to fit it, instead of truncating with an ellipsis. */
  white-space: normal; word-break: break-word; overflow-wrap: anywhere;
  line-height: 1.25;
`;

// Pastel navy — Activity's own color family (see PhasePanel.styles.js's
// PhaseBody), distinct from Phase's copper so the two nesting levels are
// told apart by hue, not just by being "a bit darker" than each other.
// navyTint (not navy) — navy itself is too dark to visibly tint at low
// alpha, see theme.js.
export const ActivityBody = styled.div`
  padding: 10px 14px 12px; border-top: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.navyTint)}40;
  border-radius: 0 0 ${t(th => th.radius.sm)} ${t(th => th.radius.sm)};
`;
