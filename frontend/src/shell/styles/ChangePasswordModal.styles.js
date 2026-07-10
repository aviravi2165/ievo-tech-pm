import styled from '@emotion/styled';

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
`;

export const ModalCard = styled.div`
  width: 500px;
  background: ${p => p.theme.colors.white};
  border-radius: ${p => p.theme.radius.lg};
  border: 1px solid ${p => p.theme.colors.border};
  padding: 24px;
  box-shadow: ${p => p.theme.shadow.lg};
`;

export const ModalTitle = styled.h3`
  margin: 0 0 20px 0;
  font-size: 22px;
  font-weight: 600;
  color: ${p => p.theme.colors.onyx};
`;

export const FormField = styled.div` margin-bottom: 16px; `;

export const FieldLabel = styled.label`
  display: block;
  font-weight: 500;
  color: ${p => p.theme.colors.ash};
`;

export const FieldInput = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 12px;
  margin-top: 6px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  box-sizing: border-box;
  font-size: 14px;
  font-family: inherit;
`;

export const ErrorText = styled.div`
  color: ${p => p.theme.colors.danger};
  margin-bottom: 16px;
  font-size: 14px;
`;

export const SuccessText = styled.div`
  color: ${p => p.theme.colors.success};
  margin-bottom: 16px;
  font-size: 14px;
`;

export const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

export const CancelBtn = styled.button`
  padding: 10px 18px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.sm};
  background: ${p => p.theme.colors.white};
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
`;

export const SubmitBtn = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: ${p => p.theme.radius.sm};
  background: ${p => p.theme.gradient.accent};
  color: ${p => p.theme.colors.onAccent};
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;

  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
