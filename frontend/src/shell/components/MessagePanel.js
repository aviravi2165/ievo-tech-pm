import { useMessaging }     from '../../modules/messages/context/MessagingContext';
import CommunicationModule  from '../../modules/messages/CommunicationModule';
import { Panel, ToggleBtn, ToggleLabel, ToggleBadge, PanelBody } from '../styles/MessagePanel.styles';

/**
 * Collapsible right rail — communication module.
 * MessagingProvider lives in AppShell (above this component),
 * so useMessaging() is always safe to call directly here.
 */
export default function MessagePanel({ currentUser, open, onToggle }) {
  const { unreadCount } = useMessaging();

  return (
    <Panel open={open} aria-label="Messages">
      <ToggleBtn
        type="button"
        onClick={onToggle}
        title={open ? 'Collapse messages' : 'Open messages'}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {!open && unreadCount > 0 && (
          <ToggleBadge>{unreadCount > 99 ? '99+' : unreadCount}</ToggleBadge>
        )}
        {!open && <ToggleLabel>Messages</ToggleLabel>}
      </ToggleBtn>

      {/* Always mounted, faded via `open` (see PanelBody's comment) — not
          conditionally rendered, so collapsing/expanding no longer
          destroys and remounts the whole messaging module (which was
          also what made the toggle feel like an instant pop instead of a
          smooth collapse: content had nothing to animate, it just
          vanished/appeared the moment `open` flipped). */}
      <PanelBody open={open} aria-hidden={!open}>
        <CommunicationModule currentUser={currentUser} />
      </PanelBody>
    </Panel>
  );
}
