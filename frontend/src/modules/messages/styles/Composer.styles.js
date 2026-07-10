import styled from '@emotion/styled';

export const ComposerWrap = styled.div`
  position: relative;
  padding: 11px 16px 13px;
  border-top: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.white};
  flex-shrink: 0;
`;

export const NoReplyBanner = styled.div`
  margin: 0 24px 12px;
  padding: 8px 14px;
  background: ${p => p.theme.colors.espresso}1f;
  border: 1px solid rgba(224, 28, 36, 0.2);
  border-radius: ${p => p.theme.radius.sm};
  font-size: 10px;
  color: ${p => p.theme.colors.espressoDark};
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ReplyStrip = styled.div`
  padding: 6px 12px;
  border-left: 2px solid ${p => p.theme.colors.ashLight};
  background: ${p => p.theme.colors.mid};
  border-radius: ${p => p.theme.radius.sm};
  margin-bottom: 8px;
  font-size: 10px;
  color: ${p => p.theme.colors.ash};
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

export const FmtBtn = styled.button`
  width: 28px; height: 28px;
  background: ${p => (p.active ? p.theme.colors.mid : 'none')};
  border: none;
  border-radius: ${p => p.theme.radius.sm};
  color: ${p => (p.active ? p.theme.colors.onyx : p.theme.colors.ash)};
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
  transition: color 0.14s ease, background 0.14s ease;

  &:hover { color: ${p => p.theme.colors.onyx}; background: ${p => p.theme.colors.mid}; }
`;

export const FmtSep = styled.div` width: 1px; height: 18px; background: ${p => p.theme.colors.border}; `;

// The contentEditable placeholder is a pure-CSS trick — there's no real
// placeholder attribute for contentEditable, so this fakes one with a
// `data-placeholder`-driven ::before that only shows on `:empty`. Has to
// stay exactly this selector shape for the trick to keep working.
export const ComposerArea = styled.div`
  width: 100%;
  min-height: 68px;
  max-height: 160px;
  background: ${p => p.theme.colors.mid};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  padding: 8px 11px;
  color: ${p => p.theme.colors.onyx};
  font-family: ${p => p.theme.font.body};
  font-size: 11.5px;
  line-height: 1.6;
  resize: none;
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
  overflow-y: auto;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;

  &:focus {
    border-color: ${p => p.theme.colors.espresso};
    box-shadow: 0 0 0 2px ${p => p.theme.colors.espresso}1f;
    background: #fff;
  }
  &[data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: ${p => p.theme.colors.ash};
    pointer-events: none;
  }
  ul, ol { padding-left: 22px; margin: 6px 0; white-space: normal; }
  li { white-space: pre-wrap; margin: 2px 0; }
  p { margin: 0; white-space: pre-wrap; }
`;

export const ComposerFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
`;

export const FooterHint = styled.span` font-size: 11px; color: ${p => p.theme.colors.ash}; `;

export const ComposerAttachments = styled.div` display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; `;

export const ComposerAttachChip = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: ${p => p.theme.colors.mid};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  font-size: 10px;
  color: ${p => p.theme.colors.ash};
`;

export const ComposerAttachRemove = styled.button`
  width: 14px; height: 14px;
  background: none; border: none;
  color: ${p => p.theme.colors.ash}; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0; font-size: 11px; line-height: 1;
  transition: color 0.14s ease;

  &:hover { color: ${p => p.theme.colors.danger}; }
`;

export const BtnSend = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 17px;
  background: ${p => p.theme.gradient.accent};
  color: #fff;
  border: none;
  border-radius: ${p => p.theme.radius.sm};
  font-family: ${p => p.theme.font.body};
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.14s ease;

  &:hover:not(:disabled) { background: ${p => p.theme.colors.espressoDark}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export const MentionDropdown = styled.div`
  position: fixed;
  z-index: 1000;
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  overflow-y: auto;
`;

export const MentionItem = styled.div`
  padding: 8px 14px;
  font-size: 13.5px;
  color: ${p => p.theme.colors.onyx};
  cursor: pointer;
  background: ${p => (p.active ? p.theme.colors.mid : p.theme.colors.white)};
  border-bottom: 1px solid ${p => p.theme.colors.border};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
