import { ERP_MODULES } from '../config/modules';
import {
  Drawer, ModuleList, ModuleItem, ModuleIcon, ModuleLabel, ModuleName, ModuleBadge,
} from '../styles/ModuleDrawer.styles';

function ModuleIconSvg({ id }) {
  const common = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };
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
    // BUG-020: inventory/hr/reports all fell through to the same generic
    // "?" circle below — indistinguishable from one another. Each now gets
    // its own recognizable icon instead.
    case 'inventory':
      return (
        <svg {...common}>
          <path d="M21 8l-9-5-9 5 9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case 'hr':
      return (
        <svg {...common}>
          <circle cx="9" cy="7" r="4" />
          <path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" />
          <path d="M17 3.5a4 4 0 010 7.6M22 21v-2a4 4 0 00-3-3.9" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 20V10M11 20V4M18 20v-7" />
          <path d="M2 20h20" />
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
    <Drawer aria-label="ERP modules">
      <ModuleList>
        {ERP_MODULES.map((mod) => {
          const isActive = mod.id === activeModuleId;
          const isDisabled = mod.status === 'coming-soon' && !mod.component;

          return (
            <li key={mod.id}>
              <ModuleItem
                type="button"
                active={isActive}
                disabled={isDisabled}
                onClick={() => !isDisabled && onSelectModule(mod.id)}
                title={mod.description}
              >
                <ModuleIcon active={isActive}>
                  <ModuleIconSvg id={mod.id} />
                </ModuleIcon>
                <ModuleLabel>
                  <ModuleName>{mod.shortLabel || mod.label}</ModuleName>
                  {mod.status === 'coming-soon' && <ModuleBadge>Soon</ModuleBadge>}
                </ModuleLabel>
              </ModuleItem>
            </li>
          );
        })}
      </ModuleList>
    </Drawer>
  );
}
