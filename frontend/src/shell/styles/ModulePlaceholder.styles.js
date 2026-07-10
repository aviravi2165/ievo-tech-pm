import styled from '@emotion/styled';

export const PlaceholderWrap = styled.div`
  flex: 1;
  min-width: 0;
  max-width: 1100px;
  padding: 24px 28px;
  overflow-y: auto;
  height: 100%;
`;

export const PlaceholderHeader = styled.header`
  h1 {
    font-family: ${p => p.theme.font.display};
    font-size: 28px;
    font-weight: 500;
    color: ${p => p.theme.colors.onyx};
    letter-spacing: 0.03em;
    margin: 0;
  }
  p {
    margin-top: 6px;
    font-size: 14px;
    color: ${p => p.theme.colors.ash};
  }
`;

export const PlaceholderCard = styled.div`
  background: ${p => p.theme.colors.white};
  border: 1px dashed ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.radius.lg};
  padding: 32px;
  margin-top: 20px;

  h2 { font-size: 18px; margin: 12px 0 8px; color: ${p => p.theme.colors.onyx}; }
  p { color: ${p => p.theme.colors.ash}; max-width: 560px; line-height: 1.6; }
`;

export const Pill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.theme.colors.mid};
  color: ${p => p.theme.colors.ash};
`;

export const PlaceholderFeatures = styled.ul`
  margin-top: 16px;
  padding-left: 18px;
  color: ${p => p.theme.colors.ash};

  li { margin-bottom: 6px; font-size: 13px; }
`;
