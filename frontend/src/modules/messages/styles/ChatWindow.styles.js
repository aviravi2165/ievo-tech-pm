import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';

export const ThreadHeader = styled.div`
  padding: 10px 18px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  background: ${p => p.theme.colors.white};
  z-index: 5;
`;

export const ThreadHeaderInfo = styled.div` flex: 1; min-width: 0; `;

export const ThreadSubject = styled.div`
  font-size: 13.5px;
  font-weight: 500;
  color: ${p => p.theme.colors.onyx};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const TypeBadge = styled.span`
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; flex-shrink: 0;
  background: ${p => p.bg}; color: ${p => p.color};
  border: 1px solid ${p => p.border};
  border-radius: 6px; padding: 2px 7px;
`;

export const ThreadMetaText = styled.span`
  color: ${p => p.theme.colors.ash}; font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

export const DescText = styled.span`
  color: ${p => p.theme.colors.ash}; font-size: 12px;
  cursor: ${p => (p.truncatable ? 'pointer' : 'default')};
  max-width: ${p => (p.expanded ? '100%' : undefined)};
  font-style: italic;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
`;

export const DescInner = styled.span`
  overflow: ${p => (p.expanded ? 'visible' : 'hidden')};
  text-overflow: ${p => (p.expanded ? 'clip' : 'ellipsis')};
  white-space: ${p => (p.expanded ? 'normal' : 'nowrap')};
`;

export const MessageCount = styled.div`
  font-size: 11px; color: ${p => p.theme.colors.ash}; margin-top: 2px; font-weight: 400;
`;

export const ThreadActions = styled.div` display: flex; gap: 6px; align-items: center; flex-shrink: 0; `;

export const ReadOnlyTag = styled.span`
  font-size: 10px; color: ${p => p.theme.colors.copper}; padding: 2px 8px;
  border: 1px solid ${p => p.theme.colors.copper}; border-radius: 8px;
  letter-spacing: 0.06em; text-transform: uppercase;
`;

export const GroupEditPanel = styled.div`
  padding: 12px 20px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.white};
  flex-shrink: 0;
`;

export const EditFieldLabel = styled.label`
  font-size: 11px; color: ${p => p.theme.colors.ash};
  text-transform: uppercase; letter-spacing: 0.06em;
  display: block; margin-bottom: 4px;
`;

export const EditFieldInput = styled.input`
  width: 100%; padding: 6px 10px; border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.mid};
  color: ${p => p.theme.colors.onyx};
  font-size: 13px; outline: none; box-sizing: border-box;
  font-family: inherit;
`;

export const ParticipantsPanel = styled.div`
  padding: 10px 16px 12px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.white};
  flex-shrink: 0;
`;

export const ParticipantsHeading = styled.div`
  font-size: 11px; color: ${p => p.theme.colors.ash};
  text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; font-weight: 600;
`;

export const AddParticipantBtn = styled.button`
  margin-left: 10px; background: ${p => p.theme.colors.mid};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 12px; padding: 2px 10px; font-size: 11px;
  color: ${p => p.theme.colors.espresso};
  cursor: pointer; font-weight: 600; font-family: inherit;
`;

export const ParticipantSearchInput = styled.input`
  width: 100%; padding: 6px 10px; border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.mid};
  color: ${p => p.theme.colors.onyx};
  font-size: 12px; outline: none; box-sizing: border-box;
  font-family: inherit;
`;

export const ParticipantSearchResults = styled.div`
  margin-top: 4px; background: ${p => p.theme.colors.onyx};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px; overflow: hidden; max-height: 140px; overflow-y: auto;
`;

export const ParticipantSearchRow = styled.div`
  padding: 6px 12px; cursor: pointer; font-size: 12px; color: ${p => p.theme.colors.white};
  border-bottom: 1px solid rgba(255,255,255,0.1);

  &:hover { background: rgba(255,255,255,0.08); }
`;

export const ParticipantChipsWrap = styled.div`
  display: flex; flex-wrap: wrap; gap: 6px; max-height: 160px; overflow-y: auto; padding-right: 4px;
`;

export const ParticipantChip = styled.span`
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px 3px 10px;
  background: ${p => (p.isMe ? 'rgba(237,28,36,0.06)' : p.theme.colors.mid)};
  border: 1px solid ${p => (p.isMe ? 'rgba(237,28,36,0.25)' : p.theme.colors.border)};
  border-radius: 20px; font-size: 12px; color: ${p => p.theme.colors.onyx};
`;

export const ChipMeta = styled.span` font-size: 10px; color: ${p => p.theme.colors.ash}; font-style: italic; `;
export const ChipAdminBadge = styled.span` font-size: 10px; color: ${p => p.theme.colors.espresso}; font-weight: 600; `;
export const ChipCoAdminBadge = styled.span` font-size: 10px; color: ${p => p.theme.colors.ash}; font-weight: 600; `;

export const ChipIconBtn = styled.button`
  background: none; border: none; cursor: pointer;
  color: ${p => (p.starred ? p.theme.colors.espresso : p.theme.colors.ash)};
  font-size: ${p => (p.size === 'sm' ? '11px' : '14px')}; line-height: 1;
  padding: 0 0 0 2px; transition: color 0.12s ease; font-weight: 600;
  display: flex; align-items: center;

  &:hover { color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.espresso)}; }
`;

export const ThreadScrollWrap = styled.div`
  flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative;
`;

export const GmailThreadView = styled.div`
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: ${p => p.theme.colors.greige};
  display: flex; flex-direction: column;
`;

const pillIn = keyframes`
  from { opacity: 0; transform: translate(-50%, 8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
`;

export const NewMsgPill = styled.button`
  position: absolute;
  bottom: 14px; left: 50%;
  transform: translateX(-50%);
  background: #1a1d23;
  color: #fff;
  border: 1px solid rgba(46, 40, 35, 0.45);
  border-radius: 20px;
  padding: 7px 16px;
  font-size: 10.5px; font-weight: 600;
  display: flex; align-items: center; gap: 6px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  z-index: 15;
  animation: ${pillIn} 0.18s ease-out;

  &:hover { background: #25282f; }
`;

export const UnreadDivider = styled.div`
  display: flex; align-items: center; gap: 10px; margin: 6px 24px 18px;

  &::before, &::after {
    content: ''; flex: 1; height: 1px; background: rgba(46, 40, 35, 0.35);
  }
  span {
    font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: ${p => p.theme.colors.espresso}; white-space: nowrap;
  }
`;

export const NoAccessWrap = styled.div`
  padding: 28px 20px; display: flex; flex-direction: column;
  align-items: center; gap: 10px; text-align: center;
`;

export const RetryBtn = styled.button`
  font-size: 12px; color: ${p => p.theme.colors.espresso}; background: none;
  border: 1px solid ${p => p.theme.colors.espresso}; border-radius: 4px;
  padding: 4px 14px; cursor: pointer; font-family: inherit;
`;

export const DisabledBanner = styled.div`
  padding: 14px 24px;
  border-top: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.white};
  display: flex; align-items: center; gap: 10px;
  color: ${p => p.theme.colors.ash}; font-size: 13px;
`;
