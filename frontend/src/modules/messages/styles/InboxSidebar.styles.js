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

// Compose button + search + nav are a non-scrolling sibling ABOVE
// ConvListWrap, not living inside its scroll flow. An earlier attempt put
// this block inside ConvListWrap as a `position: sticky` first child, to
// fix a different (purely cosmetic) bug: as a true sibling, this block
// didn't share the conversation list's scrollbar-narrowed width, so it
// rendered a few px wider than the cards below it once the list grew a
// scrollbar. That sticky-inside approach traded a cosmetic width mismatch
// for a much worse bug — the same unreliable sticky-inside-a-flex-scroll
// behavior seen elsewhere in this app (see TimelineView's frozen-column
// comment) — rows would scroll up OVER this header instead of staying
// beneath it. Reverted to a real sibling; the original width mismatch is
// fixed instead by `scrollbar-gutter: stable` on ConvListWrap (reserves
// the scrollbar's width always, so its content width never shifts based
// on whether a scrollbar is actually showing).
export const StickyTop = styled.div`
  background: ${p => p.theme.colors.white};
  flex-shrink: 0;
`;
