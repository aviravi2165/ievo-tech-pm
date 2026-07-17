import { useMessaging } from '../context/MessagingContext';
import { TabBarNav } from '../styles/MessagingPage.styles';
import { NavBtn, Badge } from '../styles/shared.styles';

export default function MessageTabBar({ tab, onTabChange, isSuperAdmin = false }) {
  const { inboxUnreadCount, groupUnreadCount } = useMessaging();

  if (isSuperAdmin) {
    return (
      <TabBarNav aria-label="Message views">
        <NavBtn type="button" active={tab === 'threads'} onClick={() => onTabChange('threads')}>
          Threads
        </NavBtn>
        <NavBtn type="button" active={tab === 'groups'} onClick={() => onTabChange('groups')}>
          Groups
        </NavBtn>
        <NavBtn type="button" active={tab === 'teams'} onClick={() => onTabChange('teams')}>
          Teams
        </NavBtn>
      </TabBarNav>
    );
  }

  return (
    <TabBarNav aria-label="Message views">
      <NavBtn type="button" active={tab === 'inbox'} onClick={() => onTabChange('inbox')}>
        Inbox
        {inboxUnreadCount > 0 && <Badge>{inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}</Badge>}
      </NavBtn>
      <NavBtn type="button" active={tab === 'groups'} onClick={() => onTabChange('groups')}>
        Groups
        {groupUnreadCount > 0 && <Badge>{groupUnreadCount > 99 ? '99+' : groupUnreadCount}</Badge>}
      </NavBtn>
      {/* Teams — admin-managed org-wide groups (e.g. "Production Team"),
          browsable read-only here by everyone; creating/editing is admin
          only (gated inside TeamManager itself via isAdmin). */}
      <NavBtn type="button" active={tab === 'teams'} onClick={() => onTabChange('teams')}>
        Teams
      </NavBtn>
    </TabBarNav>
  );
}
