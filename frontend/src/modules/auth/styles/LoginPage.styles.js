import styled from '@emotion/styled';

export const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const FeatureItem = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: ${p => p.theme.colors.border};
`;

export const FeatureDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${p => p.theme.colors.copper};
  flex-shrink: 0;
`;

export const PassWrap = styled.div` position: relative; `;

export const EyeBtn = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  color: ${p => p.theme.colors.ash};
  font-family: inherit;
`;

export const LinkBtn = styled.button`
  background: none;
  border: none;
  color: ${p => p.theme.colors.espresso};
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
  padding: 0;
`;

export const BackBtn = styled.button`
  background: none;
  border: none;
  color: ${p => p.theme.colors.ash};
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  padding: 0 0 20px 0;
  display: block;
  text-decoration: none;
`;

export const CheckCircle = styled.div`
  width: 56px; height: 56px; border-radius: 50%;
  background: ${p => p.theme.colors.success}1a;
  border: 2px solid ${p => p.theme.colors.success}40;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px;
`;
