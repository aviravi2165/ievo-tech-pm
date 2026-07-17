import styled from '@emotion/styled';

// Shared "conversation/group card" row — used by both InboxSidebar (which
// renders each conversation as one of these, not the separate
// .msg-conv-item styles that turned out to be unused dead CSS — confirmed
// via grep before dropping them here) and GroupManager.

// scrollbar-gutter: stable reserves the scrollbar's width in the layout
// at all times, whether or not a scrollbar is actually showing — so this
// element's content width never shifts as items are added/removed, and
// the non-scrolling header sibling above it (StickyTop) always lines up
// with it without needing to literally share its scroll container.
export const ConvListWrap = styled.div` flex: 1; overflow-y: auto; padding: 4px 0; scrollbar-gutter: stable; `;

export const ListError = styled.div`
  padding: 20px 16px;
  text-align: center;
  font-size: 11px;
  color: ${p => p.theme.colors.danger};
`;

export const ListErrorHint = styled.div`
  margin-top: 8px;
  font-size: 10px;
  color: ${p => p.theme.colors.ash};
`;

export const ListEmptyMsg = styled.div`
  padding: 24px 20px;
  text-align: center;
  color: ${p => p.theme.colors.ash};
  font-size: 13px;
`;

export const GroupCard = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => (p.unread ? p.theme.colors.espresso : p.theme.colors.border)};
  border-radius: ${p => p.theme.radius.lg};
  padding: 10px 13px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 11px;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
  cursor: ${p => (p.clickable ? 'pointer' : 'default')};

  &:hover { border-color: ${p => p.theme.colors.ashLight}; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }

  ${p => p.flash && `
    animation: conv-flash-pulse 1.6s ease-out 1;
    @keyframes conv-flash-pulse {
      0%   { background: rgba(46, 40, 35, 0.14); }
      100% { background: transparent; }
    }
  `}
`;

export const GroupIcon = styled.div`
  width: 30px; height: 30px;
  background: ${p => p.theme.colors.espresso}1f;
  border: 1px solid rgba(224, 28, 36, 0.2);
  border-radius: ${p => p.theme.radius.sm};
  display: flex; align-items: center; justify-content: center;
  color: ${p => p.theme.colors.espresso};
  flex-shrink: 0;
`;

export const GroupInfo = styled.div` flex: 1; min-width: 0; `;

export const GroupName = styled.div`
  font-size: 11.5px;
  font-weight: ${p => (p.bold ? 700 : 600)};
  color: ${p => p.theme.colors.onyx};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
`;

export const GroupCount = styled.div`
  font-size: 10px;
  color: ${p => p.theme.colors.ash};
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const GroupActions = styled.div` display: flex; gap: 6px; `;

export const GroupLeavePanel = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 8px 12px;
  margin: -4px 0 8px;
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
`;

export const GroupMenuItem = styled.button`
  width: auto;
  display: inline-flex;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: ${p => p.theme.radius.sm};
  color: ${p => (p.danger ? p.theme.colors.danger : p.theme.colors.onyx)};
  font-family: ${p => p.theme.font.body};
  font-size: 10px;
  text-align: center;
  cursor: pointer;

  &:hover { background: ${p => p.theme.colors.mid}; }
`;

export const RowRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 8px;
`;

export const RowTime = styled.span`
  font-size: 11.5px;
  white-space: nowrap;
  color: ${p => (p.unread ? p.theme.colors.espresso : p.theme.colors.ash)};
  font-weight: ${p => (p.unread ? 600 : 400)};
`;

export const UnreadDot = styled.span`
  width: 8px;
  height: 8px;
  background: ${p => p.theme.colors.espresso};
  border-radius: 50%;
  flex-shrink: 0;
`;
