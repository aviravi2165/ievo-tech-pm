import styled from '@emotion/styled';

export const MenuWrap = styled.div`
  position: absolute;
  top: 58px;
  right: 0;
  width: 320px;
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  box-shadow: ${p => p.theme.shadow.lg};
  z-index: 2000;
  overflow: hidden;
`;

export const MenuBody = styled.div` padding: 16px; `;

export const MenuTitle = styled.h4`
  margin: 0 0 16px 0;
  color: ${p => p.theme.colors.onyx};
  font-size: 16px;
  font-weight: 600;
`;

export const InfoList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
`;

export const InfoLabel = styled.div`
  font-weight: 600;
  color: ${p => p.theme.colors.ash};
  margin-bottom: 2px;
`;

export const InfoValue = styled.div` color: ${p => p.theme.colors.onyx}; `;

export const MenuFooter = styled.div`
  border-top: 1px solid ${p => p.theme.colors.border};
  padding: 12px 16px;
`;

export const ChangePasswordBtn = styled.button`
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: ${p => p.theme.radius.sm};
  background: ${p => p.theme.gradient.accent};
  color: ${p => p.theme.colors.onAccent};
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  font-family: inherit;
`;
