import styled from '@emotion/styled';

// 44px — the one fixed height value the rest of the shell (mobile message
// panel offset, etc.) needs to agree with. Previously threaded through a
// CSS custom property (--topbar-h) that was never actually SET anywhere,
// always silently falling back to its default — and inconsistently
// (44px in one place, 42px in another). Exported so anything else that
// needs to know the topbar's height imports this instead of repeating a
// number that could drift out of sync.
export const TOPBAR_HEIGHT = 44;

export const Topbar = styled.header`
  height: ${TOPBAR_HEIGHT}px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: ${p => p.theme.gradient.header};
  border-bottom: 1px solid ${p => p.theme.colors.border};
  box-shadow: 0 1px 3px rgba(26, 29, 35, 0.06);
`;

export const TopbarBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;

export const TopbarLogoImg = styled.img`
  height: 30px;
  width: auto;
  object-fit: contain;
  display: block;
`;

export const TopbarDivider = styled.span`
  width: 1px;
  height: 18px;
  background: ${p => p.theme.colors.border};
`;

export const TopbarModule = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${p => p.theme.colors.espresso};
  letter-spacing: 0.03em;
`;

export const TopbarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;
  margin-left: auto;
`;

export const TopbarStatus = styled.span`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: ${p => p.theme.colors.ash};
`;

export const StatusDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${p => p.theme.colors.success};
`;

export const TopbarProfile = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 3px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  background: ${p => p.theme.colors.greige};
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.18s ease;

  &:hover { border-color: ${p => p.theme.colors.espressoDark}; }
`;

export const TopbarAvatar = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${p => p.theme.colors.espresso}14;
  border: 1px solid rgba(46, 40, 35, 0.25);
  color: ${p => p.theme.colors.espresso};
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const TopbarName = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: ${p => p.theme.colors.onyx};
`;

export const TopbarLogout = styled.button`
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  background: transparent;
  color: ${p => p.theme.colors.ash};
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
  font-family: inherit;

  &:hover {
    border-color: ${p => p.theme.colors.espresso};
    color: ${p => p.theme.colors.espresso};
    background: ${p => p.theme.colors.espresso}0f;
  }
`;

export const UserMgmtBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  background: ${p => p.theme.colors.greige};
  color: ${p => p.theme.colors.onyx};
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;

  svg { color: ${p => p.theme.colors.espresso}; flex-shrink: 0; }

  &:hover {
    border-color: ${p => p.theme.colors.espressoDark};
    background: ${p => p.theme.colors.espresso}0f;
  }
`;
