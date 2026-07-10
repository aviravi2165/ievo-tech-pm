import styled from '@emotion/styled';

export const GroupsPanel = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  min-height: 0;

  h3 {
    font-family: ${p => p.theme.font.display};
    font-size: 17px;
    font-weight: 500;
    color: ${p => p.theme.colors.onyx};
    letter-spacing: 0.03em;
    margin-bottom: 16px;
  }
`;

export const BackRow = styled.div`
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
`;

export const BackBtn = styled.button`
  width: auto;
  height: 25px;
  padding: 0 10px;
  gap: 6px;
  border: none;
  background: none;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
  color: ${p => p.theme.colors.espresso};
  cursor: pointer;
  display: flex;
  align-items: center;
`;

export const DisabledChip = styled.span`
  font-size: 10px; color: ${p => p.theme.colors.ash};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px; padding: 2px 8px;
  text-transform: uppercase; letter-spacing: 0.05em;
`;

export const RowDisabledChip = styled.span`
  font-size: 9px; color: ${p => p.theme.colors.ash};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px; padding: 1px 5px;
  text-transform: uppercase; letter-spacing: 0.04em;
  flex-shrink: 0; margin-left: 4px;
`;

export const ControlCard = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  padding: 14px;
  margin-bottom: 20px;
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
`;

export const AddCard = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  padding: 14px;
  margin-bottom: 20px;
`;

export const InfoCard = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  padding: 14px;
  margin-bottom: 20px;
  color: ${p => p.theme.colors.ash};
  font-size: 13px;
`;

export const HintText = styled.span` font-size: 12px; color: ${p => p.theme.colors.ash}; `;
export const ErrorText = styled.div` color: ${p => p.theme.colors.danger}; font-size: 12px; margin-bottom: 16px; `;

export const SectionLabel = styled.div`
  margin-bottom: 12px; font-size: 12px; color: ${p => p.theme.colors.ash};
  text-transform: uppercase; letter-spacing: 0.08em;
`;

export const MemberScroll = styled.div` max-height: 400px; overflow-y: auto; padding-right: 4px; `;

export const MemberRow = styled.div`
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  margin-bottom: 8px;
`;

export const MemberAvatar = styled.div`
  width: 32px; height: 32px; border-radius: 50%;
  background: ${p => p.theme.colors.mid};
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: ${p => p.theme.colors.espresso};
`;

export const MemberInfo = styled.div` flex: 1; `;
export const MemberName = styled.div` font-size: 13px; color: ${p => p.theme.colors.onyx}; `;
export const MemberEmail = styled.div` font-size: 11px; color: ${p => p.theme.colors.ash}; `;
export const AdminTag = styled.span` margin-left: 8px; color: ${p => p.theme.colors.espresso}; font-size: 11px; `;
export const MemberActions = styled.div` display: flex; gap: 8px; align-items: center; `;
