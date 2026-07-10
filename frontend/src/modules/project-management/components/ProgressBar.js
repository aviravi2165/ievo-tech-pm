import { ProgressWrap, ProgressTrack, ProgressFill, ProgressLabel } from '../styles/shared.styles';

export default function ProgressBar({ value = 0 }) {
  return (
    <ProgressWrap>
      <ProgressTrack>
        <ProgressFill value={value} />
      </ProgressTrack>
      <ProgressLabel>{value}%</ProgressLabel>
    </ProgressWrap>
  );
}
