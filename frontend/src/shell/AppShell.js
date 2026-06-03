import { useMemo, useState } from 'react';
import TopBanner from './components/TopBanner';
import ModuleDrawer from './components/ModuleDrawer';
import MessagePanel from './components/MessagePanel';
import ModulePlaceholder from '../modules/shared/ModulePlaceholder';
import {
  ERP_MODULES,
  DEFAULT_MODULE_ID,
} from './config/modules';

export default function AppShell({ currentUser }) {
  const [activeModuleId, setActiveModuleId] = useState(DEFAULT_MODULE_ID);
  const [messagesOpen, setMessagesOpen] = useState(true);

  const activeModule = useMemo(
    () => ERP_MODULES.find((m) => m.id === activeModuleId) ?? ERP_MODULES[0],
    [activeModuleId]
  );

  const ActiveComponent = activeModule.component;

  return (
    <div className="erp-shell">
      <TopBanner currentUser={currentUser} activeModule={activeModule} />

      <div className="erp-shell-body">
        <ModuleDrawer
          activeModuleId={activeModuleId}
          onSelectModule={setActiveModuleId}
        />

        <main className="erp-main" role="main">
          {ActiveComponent ? (
            <ActiveComponent currentUser={currentUser} />
          ) : (
            <ModulePlaceholder
              title={activeModule.label}
              description={activeModule.description}
            />
          )}
        </main>

        <MessagePanel
          currentUser={currentUser}
          open={messagesOpen}
          onToggle={() => setMessagesOpen((v) => !v)}
        />
      </div>
    </div>
  );
}
