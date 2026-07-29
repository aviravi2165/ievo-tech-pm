import { useMemo, useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopBanner      from './components/TopBanner';
import ModuleDrawer   from './components/ModuleDrawer';
import MessagePanel   from './components/MessagePanel';
import NotFoundPage   from './components/NotFoundPage';
import ModulePlaceholder from '../modules/shared/ModulePlaceholder';
import { ERP_MODULES, DEFAULT_MODULE_ID } from './config/modules';
import { SocketProvider }    from '../modules/messages/context/SocketContext';
import { MessagingProvider } from '../modules/messages/context/MessagingContext';
import { ErpShell, ErpShellBody, ErpMain } from './styles/Shell.styles';

// Which module owns the current URL — longest matching `path` wins so
// '/projects/123' still resolves to the 'project-management' module, not
// falling through to the '/' dashboard entry. This REPLACES the old
// `activeModuleId` useState: the URL itself is now the single source of
// truth for "which module is showing", which is exactly what makes a hard
// refresh land back where you were instead of always resetting to Home.
function moduleForPathname(pathname) {
  const sorted = [...ERP_MODULES].sort((a, b) => b.path.length - a.path.length);
  return sorted.find(m => m.path === '/' ? pathname === '/' : pathname.startsWith(m.path)) ?? null;
}

export default function AppShell({ currentUser }) {
  const [messagesOpen, setMessagesOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Open Messages rail programmatically (e.g. PM module's ChatButton)
  useEffect(() => {
    const openPanel = () => setMessagesOpen(true);
    window.addEventListener('open-messages-panel', openPanel);
    return () => window.removeEventListener('open-messages-panel', openPanel);
  }, []);

  // Navigate to any module by id — fired by Dashboard task-click etc.
  // Used to just flip local state; now drives the real URL via the
  // module's own `path` so the destination is actually deep-linkable/
  // refreshable, not just an in-memory swap.
  useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.moduleId;
      const mod = ERP_MODULES.find(m => m.id === id);
      if (mod) navigate(mod.path);
    };
    window.addEventListener('navigate-to-module', handler);
    return () => window.removeEventListener('navigate-to-module', handler);
  }, [navigate]);

  const activeModule = useMemo(
    () => moduleForPathname(location.pathname) ?? ERP_MODULES.find(m => m.id === DEFAULT_MODULE_ID),
    [location.pathname]
  );

  return (
    <SocketProvider>
      <MessagingProvider>
        <ErpShell>
          <TopBanner currentUser={currentUser} activeModule={activeModule} />

          <ErpShellBody>
            <ModuleDrawer
              activeModuleId={activeModule.id}
              onSelectModule={(id) => {
                const mod = ERP_MODULES.find(m => m.id === id);
                if (mod) navigate(mod.path);
              }}
            />

            <ErpMain role="main">
              <Routes>
                {ERP_MODULES.map(mod => (
                  <Route
                    key={mod.id}
                    path={mod.path === '/' ? '/' : `${mod.path}/*`}
                    element={mod.component ? (
                      <mod.component currentUser={currentUser} />
                    ) : (
                      <ModulePlaceholder title={mod.label} description={mod.description} />
                    )}
                  />
                ))}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
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
