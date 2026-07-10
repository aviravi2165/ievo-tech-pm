import styled from '@emotion/styled';

// display:none by default — this was dead CSS in the original inline
// styles too (mobileLogoWrap: { display: 'none' } with no responsive
// override anywhere to ever turn it on). Kept as-is rather than silently
// dropping it, since removing markup that might be intentionally-unfinished
// isn't this pass's call to make.
export const MobileLogoWrap = styled.div` display: none; `;

export const MobileLogo = styled.span`
  font-family: Georgia, serif;
  font-size: 22px;
  font-weight: 600;
  color: ${p => p.theme.colors.onyx};
  letter-spacing: 0.08em;
`;

export const MobileLogoSub = styled.span`
  font-size: 11px;
  color: ${p => p.theme.colors.espresso};
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin-left: 8px;
`;
