import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

const fadeIn = keyframes` from { opacity: 0; } to { opacity: 1; } `;
const slideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(32, 33, 36, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  animation: ${fadeIn} 0.15s ease;
`;

export const ModalCard = styled.div`
  width: ${p => p.width || 600}px;
  max-width: calc(100vw - 32px);
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  box-shadow: 0 8px 40px rgba(0,0,0,0.2);
  display: flex; flex-direction: column;
  max-height: 90vh;
  animation: ${slideUp} 0.18s ease;
`;

export const ModalHeader = styled.div`
  padding: 15px 20px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  display: flex; align-items: center; justify-content: space-between;

  h3 { font-size: 13px; font-weight: 600; color: ${p => p.theme.colors.onyx}; margin: 0; }
`;

export const ModalBody = styled.div`
  padding: 18px 20px;
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px;
`;

export const ModalFooter = styled.div`
  padding: 12px 20px;
  border-top: 1px solid ${p => p.theme.colors.border};
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
`;

export const ModeBtnRow = styled.div` display: flex; gap: 6px; margin-bottom: 6px; `;

export const ModeBtn = styled.button`
  flex: 1; padding: 7px 10px;
  border-radius: ${p => p.theme.radius.sm};
  border: 1px solid ${p => (p.active ? p.theme.colors.espresso : p.theme.colors.border)};
  background: ${p => (p.active ? `${p.theme.colors.espresso}14` : 'none')};
  color: ${p => (p.active ? p.theme.colors.espresso : p.theme.colors.ash)};
  font-size: 12px; font-weight: 600; cursor: pointer;
  letter-spacing: 0.04em; transition: all 0.15s;
`;

export const ModeHint = styled.div`
  font-size: 11px; color: ${p => p.theme.colors.ash};
  padding: 6px 10px;
  background: ${p => p.theme.colors.greige}; border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm}; line-height: 1.55;
`;

export const HelperNote = styled.div`
  font-size: 11px;
  color: ${p => (p.warn ? p.theme.colors.copper : p.theme.colors.ash)};
  margin-top: 5px;
`;

export const ErrorBox = styled.div`
  color: ${p => p.theme.colors.danger}; font-size: 12px;
  padding: 8px 12px;
  background: rgba(196,24,31,0.08);
  border: 1px solid rgba(196,24,31,0.25);
  border-radius: ${p => p.theme.radius.sm};
`;

export const FooterHint = styled.span` font-size: 11px; color: ${p => p.theme.colors.ash}; `;

// ── Toggle switch ── sibling-selector checked-state styling — kept as a
// real hidden checkbox input + label (accessible, keyboard-toggleable)
// rather than a div with an onClick, matching the original semantics.
export const ToggleRow = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: ${p => p.theme.colors.greige};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
`;

export const ToggleLabel = styled.div` font-size: 11px; color: ${p => p.theme.colors.onyx}; `;
export const ToggleSub   = styled.div` font-size: 9.5px; color: ${p => p.theme.colors.ash}; margin-top: 1px; `;

export const ToggleSwitch = styled.label`
  position: relative; width: 34px; height: 18px; flex-shrink: 0; display: block;

  input { opacity: 0; width: 0; height: 0; }

  .slider {
    position: absolute; inset: 0;
    background: #d8d5cd;
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.14s ease;
  }
  .slider::before {
    content: '';
    position: absolute; width: 12px; height: 12px;
    left: 3px; top: 3px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.14s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }
  input:checked + .slider { background: ${p => p.theme.colors.espresso}; }
  input:checked + .slider::before { transform: translateX(16px); }
`;

// ── Recipient chip (mode-aware, group-expand affordance) ──
export const Chip = styled.span`
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px 3px 7px;
  background: ${p => (p.isGroup ? 'rgba(237,28,36,0.08)' : p.theme.colors.mid)};
  border: 1px solid ${p => (p.isGroup ? 'rgba(237,28,36,0.3)' : 'transparent')};
  border-radius: 4px; font-size: 12px; color: ${p => p.theme.colors.onyx};
  max-width: 240px; flex-shrink: 0;
`;

export const ChipMemberCount = styled.span` color: ${p => p.theme.colors.ash}; font-size: 10px; margin-left: 3px; `;

export const ChipExpandBtn = styled.button`
  background: none; border: none;
  cursor: ${p => (p.disabled ? 'wait' : 'pointer')};
  color: ${p => p.theme.colors.espresso}; padding: 0 2px; font-size: 13px; line-height: 1;
  display: flex; align-items: center;
`;

export const ChipExpandedTag = styled.span`
  font-size: 9px; color: ${p => p.theme.colors.ash}; font-style: italic; margin-left: 2px;
`;

export const ChipRemoveBtn = styled.button`
  background: none; border: none; cursor: pointer;
  color: ${p => p.theme.colors.ash}; font-size: 15px; line-height: 1;
  padding: 0 0 0 3px; transition: color 0.12s ease;

  &:hover { color: ${p => p.theme.colors.danger}; }
`;

export const DropdownGroupLabel = styled.div`
  padding: 5px 14px 3px; font-size: 10px; color: ${p => p.theme.colors.ash};
  text-transform: uppercase; letter-spacing: 0.08em;
`;
