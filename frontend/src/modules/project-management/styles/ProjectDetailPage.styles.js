import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

export const Detail = styled.div` display: flex; flex-direction: column; height: 100%; overflow: hidden; `;

export const DetailHeader = styled.div`
  padding: 10px 16px; border-bottom: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.white)}; flex-shrink: 0;
  display: flex; align-items: flex-start; gap: 11px; flex-wrap: wrap; row-gap: 6px;
`;

export const DetailBody = styled.div`
  flex: 1; overflow-y: auto; padding: 14px;
  display: flex; flex-direction: column; gap: 8px; min-height: 0;
`;

// overflow/ellipsis so a long project name truncates on one line instead of
// overflowing past its flex container's shrunk width and rendering straight
// through whatever sits next to it (the progress bar/status pills) — that
// was a real overlap bug, not just a style choice.
export const DetailTitle = styled.div`
  font-family: ${t(th => th.font.display)};
  font-size: 15px; font-weight: 800;
  color: ${t(th => th.colors.onyx)}; letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
`;

export const DetailSub = styled.div`
  font-size: 12px; color: ${t(th => th.colors.ash)}; margin-top: 4px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
  overflow: hidden; text-overflow: ellipsis;
`;

export const DetailTabs = styled.div`
  display: flex; gap: 0; border-bottom: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.white)}; flex-shrink: 0;
`;

export const Tab = styled.button`
  padding: 6px 13px; font-size: 11px; font-weight: 600;
  color: ${(props) => (props.active ? props.theme.colors.onyx : props.theme.colors.ash)};
  border: none; background: none; cursor: pointer;
  border-bottom: 2.5px solid ${(props) => (props.active ? props.theme.colors.onyx : 'transparent')};
  transition: all 0.15s; font-family: inherit;
  &:hover { color: ${t(th => th.colors.onyx)}; }
`;
