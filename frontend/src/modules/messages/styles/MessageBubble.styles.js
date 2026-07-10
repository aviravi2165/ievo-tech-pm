import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

const flash = keyframes`
  0%   { background: rgba(46, 40, 35, 0.12); }
  100% { background: rgba(255,255,255,0.75); }
`;

// Solid background (not the translucent rgba(255,255,255,0.75) this used
// to be) — a translucent resting background meant each message's apparent
// shade depended on whatever rendered behind it, and a legacy dead rule
// used to fight the :hover state's specificity, producing visibly
// inconsistent shades between messages in the same thread. Both states
// solid now, nothing left to vary. See messaging.css's original comment
// (preserved in git history) for the full incident.
export const ThreadMessage = styled.div`
  margin: 9px 16px;
  padding: 13px 17px;
  background: ${p => p.theme.colors.white};
  border: 1px solid rgba(46, 40, 35, 0.18);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover { border-color: rgba(46, 40, 35, 0.32); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }

  ${p => p.highlighted && `
    border-color: rgba(46, 40, 35, 0.55) !important;
    box-shadow: 0 0 0 3px rgba(46, 40, 35, 0.18);
    animation: ${flash} 1.6s ease-in-out 1;
  `}
`;

export const ThreadMessageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

export const ThreadSender = styled.div` font-size: 12px; font-weight: 600; color: ${p => p.theme.colors.onyx}; `;
export const ThreadTime = styled.div` margin-top: 2px; font-size: 10px; color: ${p => p.theme.colors.ash}; `;

export const ThreadReplyContext = styled.div`
  margin-bottom: 14px;
  padding: 10px 14px;
  background: #f7f6f3;
  border-left: 3px solid #c7cbd1;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover { background: #efece6; border-left-color: rgba(46, 40, 35, 0.45); }
`;

export const ThreadReplyPreview = styled.div` margin-top: 4px; color: #6b6f76; font-size: 11px; `;

// color forced with !important: DOMPurify's sanitizer allows a `style`
// attribute through (needed for legitimate rich-text formatting), which
// means any inline color baked into a message's stored HTML — from pasted
// content, browser autoformatting, whatever — overrides whatever color
// this rule sets, so messages in the same thread could each carry a
// different inline shade of grey. A plain rule can't beat an inline
// style; !important on every descendant is the only thing that reliably
// does, and per CSS spec it still loses to an inline !important, which
// nothing here ever sets.
export const ThreadMessageBody = styled.div`
  font-size: 12px;
  line-height: 1.75;
  word-break: break-word;

  &, & * { color: ${p => p.theme.colors.onyx} !important; }

  p { margin: 0; white-space: pre-wrap; }
  a { color: ${p => p.theme.colors.info}; text-decoration: underline; overflow-wrap: anywhere; word-break: break-word; }
  ul, ol { padding-left: 22px; margin: 6px 0; white-space: normal; }
  li { white-space: pre-wrap; margin: 2px 0; }
  table { max-width: 100%; }
`;

export const ThreadAttachments = styled.div`
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

// Two conflicting .attach-chip rules existed in messaging.css (an earlier
// one and a later one in source order); at equal specificity the later
// one always won in the cascade, so THAT is the one actually rendering
// today and the one preserved here — not the dead first definition.
export const AttachChip = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #c7cbd1;
  background: #f7f6f3;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  color: ${p => p.theme.colors.ash};

  &:disabled { cursor: default; opacity: 0.7; }
`;

export const AttachSize = styled.span` color: #6b6f76; font-size: 10px; `;
export const AttachmentError = styled.div` color: ${p => p.theme.colors.danger}; font-size: 10px; `;

export const ThreadFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
`;

export const ThreadReplyBtn = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b6f76;
  font-size: 11px;
  font-family: inherit;

  &:hover { color: ${p => p.theme.colors.onyx}; }
`;
