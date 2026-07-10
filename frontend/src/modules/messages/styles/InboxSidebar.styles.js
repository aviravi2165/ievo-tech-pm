import styled from '@emotion/styled';

export const ComposeBtn = styled.button`
  width: calc(100% - 26px);
  margin: 11px 13px 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 17px;
  background: ${p => p.theme.gradient.accent};
  color: #fff;
  border: none;
  border-radius: 20px;
  font-family: ${p => p.theme.font.body};
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.10);
  transition: background 0.14s ease, box-shadow 0.14s ease;

  &:hover { background: ${p => p.theme.colors.espressoDark}; box-shadow: 0 2px 8px rgba(0,0,0,0.18); }
`;

export const SearchWrap = styled.div` padding: 0 12px 8px; flex-shrink: 0; `;

export const SearchInput = styled.input`
  width: 100%;
  padding: 6px 12px 6px 30px;
  background: ${p => p.theme.colors.mid};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 18px;
  color: ${p => p.theme.colors.onyx};
  font-family: ${p => p.theme.font.body};
  font-size: 11px;
  outline: none;
  transition: border-color 0.14s ease, background 0.14s ease;
  background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='11' cy='11' r='8' stroke='%2380868b' stroke-width='2'/%3E%3Cpath d='M21 21l-4.35-4.35' stroke='%2380868b' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 12px center;

  &::placeholder { color: ${p => p.theme.colors.ash}; }
  &:focus {
    border-color: ${p => p.theme.colors.espresso};
    background-color: #fff;
    box-shadow: 0 0 0 2px ${p => p.theme.colors.espresso}1f;
  }
`;

// Distinct from MessagingPage.styles's TabBarNav (.msg-tab-bar) — this is
// the secondary in-sidebar nav (.msg-nav), narrower padding, only shown
// when hideTabs is false.
export const SidebarNav = styled.nav`
  display: flex;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  padding: 0 4px;
  flex-shrink: 0;
`;

// Compose button + search + nav used to be siblings of ConvListWrap
// (ConversationList.styles.js) rather than living inside it — ConvListWrap
// is the only one of the two with `overflow-y: auto`, so whenever it grew
// a scrollbar (enough conversations to scroll), its own available content
// width shrank by the scrollbar's width while this sibling block above it
// didn't, since it never scrolls. The search box (and everything else up
// here) then rendered a few pixels wider than the conversation cards below
// it — reading as the search box "overflowing" relative to its neighbors,
// even though it was technically still inside the sidebar. Wrapping this
// in a sticky header INSIDE the same scrolling container as the cards
// (see ConvListWrap usage in InboxSidebar.js/GroupManager.js) means both
// share the exact same available width always, by construction — not by
// matching scrollbar-width guesses.
export const StickyTop = styled.div`
  position: sticky;
  top: 0;
  z-index: 2;
  background: ${p => p.theme.colors.white};
  flex-shrink: 0;
`;
