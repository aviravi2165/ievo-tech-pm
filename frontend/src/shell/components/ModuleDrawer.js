import { ERP_MODULES } from '../config/modules';

function ModuleIcon({ id }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };
  switch (id) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'project-management':
      return (
        <svg {...common}>
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h6" />
        </svg>
      );
    case 'scheduling':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

export default function ModuleDrawer({ activeModuleId, onSelectModule }) {
  return (
    <nav className="erp-module-drawer" aria-label="ERP modules">
      <div className="erp-module-drawer-title">Modules</div>
      <ul className="erp-module-list">
        {ERP_MODULES.map((mod) => {
          const isActive = mod.id === activeModuleId;
          const isDisabled = mod.status === 'coming-soon' && !mod.component;

          return (
            <li key={mod.id}>
              <button
                type="button"
                className={`erp-module-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && onSelectModule(mod.id)}
                disabled={isDisabled}
                title={mod.description}
              >
                <span className="erp-module-icon">
                  <ModuleIcon id={mod.id} />
                </span>
                <span className="erp-module-label">
                  <span className="erp-module-name">{mod.label}</span>
                  {mod.status === 'coming-soon' && (
                    <span className="erp-module-badge">Soon</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
