import styled from '@emotion/styled';
import { TOPBAR_HEIGHT } from './TopBanner.styles';

// Collapsible right rail. `open` prop replaces the old open/collapsed
// className toggle.
export const Panel = styled.aside`
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  height: 100%;
  background: ${p => p.theme.colors.white};
  border-left: 1px solid ${p => p.theme.colors.border};
  transition: width 0.22s ease;
  width: ${p => (p.open ? 'clamp(380px, 32vw, 540px)' : '52px')};
  min-width: ${p => (p.open ? '380px' : '52px')};
  max-width: ${p => (p.open ? '540px' : '52px')};

  @media (max-width: 768px) {
    ${p => p.open && `
      position: absolute;
      right: 0;
      top: ${TOPBAR_HEIGHT}px;
      bottom: 0;
      z-index: 100;
      width: calc(100vw - 76px);
      min-width: 0;
      max-width: none;
    `}
  }
`;

export const ToggleBtn = styled.button`
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 16px 8px;
  border: none;
  border-right: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.greige};
  color: ${p => p.theme.colors.espresso};
  cursor: pointer;
  position: relative;
  font-family: inherit;
  transition: background 0.18s ease;

  &:hover { background: ${p => p.theme.colors.espresso}14; }
`;

export const ToggleLabel = styled.span`
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
`;

export const ToggleBadge = styled.span`
  position: absolute;
  top: 10px;
  right: 6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: ${p => p.theme.colors.espresso};
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const PanelBody = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;
