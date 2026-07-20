import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

// Cross-cutting primitives reused by 3+ messaging components — nav
// buttons/badges, icon buttons, form buttons/fields, dropdowns, loader,
// toast, avatar circle. Component-specific styles live in their own
// <ComponentName>.styles.js next to this file; this one is for things
// that would otherwise be copy-pasted verbatim across files.
//
// CSS custom property → theme mapping used throughout (was previously
// bridged at runtime by applyTheme.js since messaging.css was plain CSS):
// --bg-page:greige --bg-panel:white --bg-row-hover:mid
// --bg-row-active:espresso@14 --bg-input:mid --text-primary:onyx
// --text-secondary/muted:ash --text-subtle:ashLight --border:border
// --border-strong:ashLight --accent:espresso --accent-dark:espressoDark
// --accent-glow:espresso@1f --divider:border

export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const spin = keyframes` to { transform: rotate(360deg); } `;

export const slideInRight = keyframes`
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
`;

export const NavBtn = styled.button`
  flex: 1;
  padding: 7px 5px;
  background: none;
  border: none;
  border-bottom: 2px solid ${p => (p.active ? p.theme.colors.espresso : 'transparent')};
  color: ${p => (p.active ? p.theme.colors.espresso : p.theme.colors.ash)};
  font-family: ${p => p.theme.font.body};
  font-size: 10.5px;
  font-weight: ${p => (p.active ? 600 : 500)};
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;

  &:hover { color: ${p => (p.active ? p.theme.colors.espresso : p.theme.colors.onyx)}; }
`;

export const Badge = styled.span`
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  background: ${p => p.theme.colors.espresso};
  color: #fff;
  border-radius: 9px;
  font-size: 8.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const IconBtn = styled.button`
  width: 25px;
  height: 25px;
  border: none;
  background: none;
  border-radius: 50%;
  color: ${p => p.theme.colors.ash};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.14s ease, background 0.14s ease;

  &:hover {
    color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.onyx)};
    background: ${p => (p.danger ? 'rgba(197, 34, 31, 0.07)' : p.theme.colors.mid)};
  }
`;

export const Btn = styled.button`
  padding: 8px 18px;
  border-radius: ${p => p.theme.radius.sm};
  font-family: ${p => p.theme.font.body};
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
  border: 1px solid transparent;
`;

// \`danger\` was previously a CSS class combo (\`btn btn-ghost danger\`) that
// had no matching rule anywhere in messaging.css — Disable/Delete buttons
// rendered as plain ghost buttons with no red warning color despite the
// code clearly intending one (only \`.icon-btn.danger\` actually had a
// rule). Added for real here since destructive actions should look
// destructive.
export const BtnGhost = styled(Btn)`
  background: none;
  border-color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.border)};
  color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.ash)};

  &:hover {
    border-color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.ashLight)};
    color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.onyx)};
    background: ${p => (p.danger ? 'rgba(197, 34, 31, 0.07)' : 'transparent')};
  }
`;

export const BtnPrimary = styled(Btn)`
  background: ${p => p.theme.gradient.accent};
  color: #fff;
  font-weight: 600;
  border: none;

  &:hover { background: ${p => p.theme.colors.espressoDark}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: ${p => p.theme.colors.ash};
  margin-bottom: 5px;
`;

// Required-field marker — same visual convention as the PM module's
// `.req` (project-management/styles/shared.styles.js), reimplemented here
// since the two modules don't share a stylesheet.
export const Req = styled.span`
  color: ${p => p.theme.colors.espresso};
  margin-left: 2px;
`;

export const FieldInput = styled.input`
  width: 100%;
  padding: 9px 12px;
  background: ${p => p.theme.colors.mid};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  color: ${p => p.theme.colors.onyx};
  font-family: ${p => p.theme.font.body};
  font-size: 11px;
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;

  &:focus {
    border-color: ${p => p.theme.colors.espresso};
    box-shadow: 0 0 0 2px ${p => p.theme.colors.espresso}1f;
    background: #fff;
  }
  &::placeholder { color: ${p => p.theme.colors.ash}; }
`;

export const FieldTextarea = styled(FieldInput.withComponent('textarea'))`
  min-height: 130px;
  resize: vertical;
`;

export const Dropdown = styled.div`
  position: absolute;
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  z-index: 200;
  max-height: 180px;
  overflow-y: auto;
  width: 100%;
`;

export const DropdownItem = styled.div`
  padding: 9px 14px;
  font-size: 11px;
  color: ${p => p.theme.colors.ash};
  cursor: pointer;
  transition: background 0.14s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;

  & > div { min-width: 0; overflow: hidden; }
  & > div > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  ${p => (p.focused ? `background: ${p.theme.colors.mid}; color: ${p.theme.colors.onyx};` : '')}
  &:hover { background: ${p => p.theme.colors.mid}; color: ${p => p.theme.colors.onyx}; }
`;

export const Divider = styled.div` height: 1px; background: ${p => p.theme.colors.border}; margin: 12px 0; `;

export const LoaderWrap = styled.div` display: flex; align-items: center; justify-content: center; padding: 40px; `;

export const Spinner = styled.div`
  width: 24px; height: 24px;
  border: 2px solid ${p => p.theme.colors.border};
  border-top-color: ${p => p.theme.colors.espresso};
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;

export const ToastContainer = styled.div`
  position: fixed; bottom: 20px; right: 20px;
  display: flex; flex-direction: column; gap: 8px;
  z-index: 9999;
`;

export const ToastItem = styled.div`
  padding: 10px 16px;
  background: ${p => (p.kind === 'success' ? p.theme.colors.success : p.kind === 'error' ? p.theme.colors.danger : p.theme.colors.onyx)};
  color: #fff;
  border-radius: ${p => p.theme.radius.sm};
  font-size: 11px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.25);
  animation: ${slideInRight} 0.18s ease;
  max-width: 300px;
  cursor: ${p => (p.clickable ? 'pointer' : 'default')};

  &:hover { opacity: ${p => (p.clickable ? 0.92 : 1)}; }
`;

// Circular initials avatar — used at three sizes across the module
// (conversation list 30px, message bubble 34px); size + tint passed as
// props rather than three near-duplicate styled-components.
export const AvatarCircle = styled.div`
  width: ${p => p.size || 30}px;
  height: ${p => p.size || 30}px;
  border-radius: 50%;
  background: ${p => p.tint || '#e8eaed'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${p => (p.size >= 34 ? 10 : 10.5)}px;
  font-weight: 600;
  color: ${p => p.color || p.theme.colors.ash};
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.02em;
`;
