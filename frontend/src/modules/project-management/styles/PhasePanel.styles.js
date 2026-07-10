import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

export const PhaseName = styled.span`
  font-size: 11px; font-weight: 700; color: ${t(th => th.colors.onyx)};
  min-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

// Pastel copper — Phase is the copper "family" throughout (header strip,
// this expanded body, and the Phase row itself all share the same hue),
// Activity is navy (ActivityRow.styles.js's ActivityBody), so the three
// nesting levels read as three distinct, color-coded zones rather than
// three shades of the same blue-grey (the old nestLevel1/nestLevel2
// tokens).
// Alpha 08 (3%) was the exact same "subtle defaults to invisible" mistake
// already made twice earlier this session with other tint pairs — two
// colors that are each barely-there against white are ALSO barely
// different from each other. 1f (~12%) is where copper and navy actually
// read as two distinct hues, not two shades of off-white.
export const PhaseBody = styled.div`
  padding: 12px 18px 16px 18px; border-top: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.copper)}10;
  border-radius: 0 0 ${t(th => th.radius.lg)} ${t(th => th.radius.lg)};
`;
