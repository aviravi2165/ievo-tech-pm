import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

export const TaskName = styled.div` font-size: 10.5px; color: ${t(th => th.colors.onyx)}; `;

// flex-wrap intentionally OFF: with a variable number of optional badges
// (priority, due date, overdue, est. hours, avatars, deps) each task ends up
// wrapping to a different number of lines depending on exactly which ones it
// happens to have, so a list of tasks reads as an inconsistent, cluttered
// stack of rows. Fixed to a single line (clipped, not wrapped) so every task
// row is the same height.
// flex-shrink: 0 — without it, this flex item (sitting next to the
// name/status group, which itself can shrink) silently shrinks under space
// pressure, and since overflow is hidden (to stop wrapping, see above) that
// clips content like the due-date badge out of view entirely rather than
// truncating gracefully. TaskName already ellipsis-truncates, so it's the
// one that should give up space first, not the functional badges here.
export const TaskMeta = styled.div`
  font-size: 11px; color: ${t(th => th.colors.ash)};
  display: flex; gap: 8px; flex-wrap: nowrap; align-items: center;
  overflow: hidden; flex-shrink: 0;
`;
