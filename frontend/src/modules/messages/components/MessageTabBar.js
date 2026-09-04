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
      {/* Teams tab is admin-only now. Normal users don't get a Teams browser
          tab — they still USE teams by picking one as a recipient in the New
          Message composer (Inbox → compose → "Teams" section of the dropdown).
          Only the super admin (branch above) sees the Teams management tab. */}
    </TabBarNav>
  );
}
