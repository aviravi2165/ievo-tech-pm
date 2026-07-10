import { useMemo, useState, useEffect } from 'react';
import TopBanner      from './components/TopBanner';
import ModuleDrawer   from './components/ModuleDrawer';
import MessagePanel   from './components/MessagePanel';
import ModulePlaceholder from '../modules/shared/ModulePlaceholder';
import { ERP_MODULES, DEFAULT_MODULE_ID } from './config/modules';
import { SocketProvider }    from '../modules/messages/context/SocketContext';
import { MessagingProvider } from '../modules/messages/context/MessagingContext';
import { ErpShell, ErpShellBody, ErpMain } from './styles/Shell.styles';

export default function AppShell({ currentUser }) {
  const [activeModuleId, setActiveModuleId] = useState(DEFAULT_MODULE_ID);
  const [messagesOpen,   setMessagesOpen]   = useState(true);

  // Open Messages rail programmatically (e.g. PM module's ChatButton)
  useEffect(() => {
    const openPanel = () => setMessagesOpen(true);
    window.addEventListener('open-messages-panel', openPanel);
    return () => window.removeEventListener('open-messages-panel', openPanel);
  }, []);

  // Navigate to any module by id — fired by Dashboard task-click etc.
  useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.moduleId;
      if (id && ERP_MODULES.some(m => m.id === id)) {
        setActiveModuleId(id);
      }
    };
    window.addEventListener('navigate-to-module', handler);
    return () => window.removeEventListener('navigate-to-module', handler);
  }, []);

  const activeModule = useMemo(
    () => ERP_MODULES.find(m => m.id === activeModuleId) ?? ERP_MODULES[0],
    [activeModuleId]
  );

  const ActiveComponent = activeModule.component;

  return (
    <SocketProvider>
      <MessagingProvider>
        <ErpShell>
          <TopBanner currentUser={currentUser} activeModule={activeModule} />

          <ErpShellBody>
            <ModuleDrawer
              activeModuleId={activeModuleId}
              onSelectModule={setActiveModuleId}
            />

            <ErpMain role="main">
              {ActiveComponent ? (
                <ActiveComponent currentUser={currentUser} />
              ) : (
                <ModulePlaceholder
                  title={activeModule.label}
                  description={activeModule.description}
                />
              )}
            </ErpMain>

            <MessagePanel
              currentUser={currentUser}
              open={messagesOpen}
              onToggle={() => setMessagesOpen(v => !v)}
            />
          </ErpShellBody>
        </ErpShell>
      </MessagingProvider>
    </SocketProvider>
  );
}