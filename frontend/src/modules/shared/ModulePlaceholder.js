import {
  PlaceholderWrap, PlaceholderHeader, PlaceholderCard, Pill, PlaceholderFeatures,
} from '../../shell/styles/ModulePlaceholder.styles';

/**
 * Shared placeholder for ERP modules not yet integrated.
 */
export default function ModulePlaceholder({ title, description, features = [] }) {
  return (
    <PlaceholderWrap>
      <PlaceholderHeader>
        <h1>{title}</h1>
        <p>{description}</p>
      </PlaceholderHeader>

      <PlaceholderCard>
        <Pill>Coming soon</Pill>
        <h2>Module integration in progress</h2>
        <p>
          The shell navigation and layout are ready. Wire your module API and
          replace this view with the real component when development is complete.
        </p>
        {features.length > 0 && (
          <PlaceholderFeatures>
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </PlaceholderFeatures>
        )}
      </PlaceholderCard>
    </PlaceholderWrap>
  );
}
