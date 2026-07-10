import styled from '@emotion/styled';

export const RecipientBox = styled.div`
  width: 100%;
  min-height: 40px;
  max-height: 120px;
  overflow-y: auto;
  padding: 6px 10px;
  background: ${p => p.theme.colors.mid};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  display: flex; flex-wrap: wrap; gap: 5px; align-items: flex-start;
  cursor: text;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;

  &:focus-within {
    border-color: ${p => p.theme.colors.espresso};
    box-shadow: 0 0 0 2px ${p => p.theme.colors.espresso}1f;
    background: #fff;
  }
`;

export const RecipientChip = styled.span`
  display: flex; align-items: center; gap: 4px;
  padding: 2px 8px 2px 6px;
  background: #e8eaed;
  border-radius: 12px;
  font-size: 10px; color: ${p => p.theme.colors.onyx};
`;

export const RecipientChipRemove = styled.button`
  background: none; border: none;
  color: ${p => p.theme.colors.ash}; cursor: pointer;
  font-size: 12px; line-height: 1;
  padding: 0; display: flex; align-items: center;
  transition: color 0.14s ease;

  &:hover { color: ${p => p.theme.colors.danger}; }
`;

export const RecipientInput = styled.input`
  flex: 1; min-width: 80px;
  background: none; border: none; outline: none;
  color: ${p => p.theme.colors.onyx};
  font-family: ${p => p.theme.font.body};
  font-size: 11px;

  &::placeholder { color: ${p => p.theme.colors.ash}; }
`;
