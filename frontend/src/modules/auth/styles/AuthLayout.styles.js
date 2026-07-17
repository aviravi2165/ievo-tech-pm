import styled from '@emotion/styled';

// Shared shell used by both LoginPage and ForceChangePasswordPage — a
// split brand panel + centered form card. These were previously two
// near-identical copies of the same plain-object style literals (theme
// imported directly, not via Emotion's ThemeProvider), duplicated in full
// across both files. One shared file now, theme read via props.theme.
export const Root = styled.div`
  display: flex;
  height: 100%; /* not 100vh — see ErpShell in Shell.styles.js for why (zoom/vh gap) */
  font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
`;

export const Brand = styled.div`
  width: 42%;
  min-width: 320px;
  background: ${p => p.theme.colors.onyx};
  border-right: 3px solid ${p => p.theme.colors.copper};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px 52px;
  color: ${p => p.theme.colors.greige};
`;

export const BrandInner = styled.div` display: flex; flex-direction: column; gap: 8px; `;

export const Logo = styled.div`
  font-family: Georgia, serif;
  font-size: 48px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: ${p => p.theme.colors.white};
  line-height: 1;
`;

export const LogoSub = styled.div`
  font-size: 13px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.copper};
  font-weight: 600;
  margin-bottom: 24px;
`;

export const Tagline = styled.p`
  font-size: 14px;
  color: ${p => p.theme.colors.ashLight};
  letter-spacing: 0.08em;
  margin-bottom: 32px;
`;

export const BrandFooter = styled.p`
  font-size: 11px;
  color: ${p => p.theme.colors.ash};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

export const FormPanel = styled.div`
  flex: 1;
  background: ${p => p.theme.colors.greige};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
`;

export const FormCard = styled.div`
  width: 100%;
  max-width: ${p => p.wide ? '420px' : '400px'};
  background: ${p => p.theme.colors.white};
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  padding: 40px 36px;
  box-shadow: 0 4px 24px rgba(26,29,35,0.08);
`;

export const Heading = styled.h1`
  font-size: ${p => p.small ? '20px' : '24px'};
  font-weight: 600;
  color: ${p => p.theme.colors.onyx};
  margin: 0 0 ${p => p.small ? '10px' : '6px'};
  font-family: Georgia, serif;
`;

export const Subheading = styled.p`
  font-size: 14px;
  color: ${p => p.theme.colors.ash};
  margin-bottom: 28px;
  line-height: 1.5;
`;

export const Field = styled.div` margin-bottom: 18px; `;

export const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${p => p.theme.colors.ash};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 7px;
`;

export const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${p => p.theme.colors.onyx};
  background: ${p => p.theme.colors.greige};
  outline: none;
  transition: border-color 0.18s;
  box-sizing: border-box;
  font-family: inherit;

  &:focus { border-color: ${p => p.theme.colors.espresso}; }
`;

export const ErrorBox = styled.div`
  background: ${p => p.theme.colors.danger}1a;
  border: 1px solid ${p => p.theme.colors.danger}40;
  border-radius: 4px;
  padding: 10px 14px;
  font-size: 13px;
  color: ${p => p.theme.colors.danger};
  margin-bottom: 18px;
`;

export const SuccessBox = styled.div`
  background: ${p => p.theme.colors.success}1a;
  border: 1px solid ${p => p.theme.colors.success}40;
  border-radius: 4px;
  padding: ${p => p.roomy ? '14px 16px' : '10px 14px'};
  font-size: ${p => p.roomy ? '14px' : '13px'};
  color: ${p => p.theme.colors.success};
  margin-bottom: ${p => p.roomy ? '12px' : '18px'};
`;

export const SubmitBtn = styled.button`
  width: 100%;
  padding: 12px;
  background: ${p => p.theme.gradient.accent};
  color: ${p => p.theme.colors.white};
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: opacity 0.18s;
  font-family: inherit;
  margin-bottom: ${p => p.tight ? '20px' : '16px'};
  opacity: ${p => (p.disabled ? 0.7 : 1)};

  &:disabled { cursor: not-allowed; }
`;

export const Hint = styled.p`
  font-size: 12px;
  color: ${p => p.theme.colors.ashLight};
  text-align: center;
  line-height: 1.7;
  margin-top: ${p => (p.noTopMargin ? 0 : '8px')};
`;
