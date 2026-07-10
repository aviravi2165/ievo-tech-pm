import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

export const Topbar = styled.div`
  display: flex; align-items: center; gap: 11px;
  padding: 8px 16px;
  border-bottom: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.white)};
  flex-shrink: 0;
`;

export const TopbarH1 = styled.h1`
  font-family: ${t(th => th.font.display)};
  font-size: 14px; font-weight: 800;
  color: ${t(th => th.colors.onyx)};
  margin: 0; letter-spacing: -0.01em;
`;

export const TopbarActions = styled.div`
  margin-left: auto; display: flex; gap: 8px; align-items: center;
`;

export const List = styled.div` flex: 1; overflow-y: auto; padding: 14px; `;
