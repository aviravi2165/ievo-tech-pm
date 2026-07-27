import styled from '@emotion/styled';

// Narrow icon rail (icon + small truncated label stacked). Icons stay
// monochrome — the active module gets the one accent highlight instead of
// per-module colors, to stay consistent with the restrained charcoal/
// copper palette used throughout.
export const Drawer = styled.nav`
  width: 68px;
  min-width: 68px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.white};
  border-right: 1px solid ${p => p.theme.colors.border};
  overflow: hidden;
`;

export const ModuleList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 10px 8px 16px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
`;

export const ModuleItem = styled.button`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 3px;
  margin-bottom: 3px;
  border: none;
  border-radius: ${p => p.theme.radius.sm};
  background: ${p => (p.active ? `${p.theme.colors.espresso}14` : 'transparent')};
  cursor: ${p => (p.disabled ? 'not-allowed' : 'pointer')};
  opacity: ${p => (p.disabled ? 0.45 : 1)};
  text-align: center;
  font-family: inherit;
  transition: background 0.18s ease, color 0.18s ease;
  color: ${p => (p.active ? p.theme.colors.onyx : p.theme.colors.ash)};

  &:hover {
    background: ${p => (p.disabled ? 'transparent' : (p.active ? `${p.theme.colors.espresso}14` : p.theme.colors.greige))};
  }
`;

export const ModuleIcon = styled.span`
  flex-shrink: 0;
  display: flex;
  color: ${p => (p.active ? p.theme.colors.espresso : p.theme.colors.ash)};
`;

export const ModuleLabel = styled.span`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  width: 100%;
`;

export const ModuleName = styled.span`
  font-size: 9.5px;
  font-weight: 500;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// BUG-020: this used to be font-size:0 — a 5px dot with "Soon" only in the
// DOM for a11y, never visible on screen. Now an actual visible pill, same
// as every other badge in the app.
export const ModuleBadge = styled.span`
  padding: 0 5px;
  border-radius: 8px;
  background: ${p => p.theme.colors.espresso}1f;
  color: ${p => p.theme.colors.espresso};
  font-size: 7.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.5;
`;
