/**
 * Shared placeholder for ERP modules not yet integrated.
 */
export default function ModulePlaceholder({ title, description, features = [] }) {
  return (
    <div className="erp-module">
      <header className="erp-module-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <div className="erp-placeholder-card">
        <span className="erp-pill erp-pill--muted">Coming soon</span>
        <h2>Module integration in progress</h2>
        <p>
          The shell navigation and layout are ready. Wire your module API and
          replace this view with the real component when development is complete.
        </p>
        {features.length > 0 && (
          <ul className="erp-placeholder-features">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
