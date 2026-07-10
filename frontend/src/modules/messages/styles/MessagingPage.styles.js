import styled from '@emotion/styled';

// Top-level module shell + layout — shared by CommunicationModule (root)
// and MessagingPage (screen inside it), plus the split/stacked layout
// variants and sidebar chrome that InboxSidebar renders into.

export const ModuleRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: ${p => p.theme.colors.greige};
`;

// Identical rules to ModuleRoot — kept as a separate export (not reused
// directly) because the two wrap different, independently-evolving trees
// (CommunicationModule's outer shell vs. MessagingPage's screen), matching
// the original two-selector CSS rule `.msg-module-root, .msg-module-screen`.
export const ModuleScreen = ModuleRoot.withComponent('div');

export const TabBarNav = styled.nav`
  display: flex;
  flex-shrink: 0;
  background: ${p => p.theme.colors.white};
  border-bottom: 1px solid ${p => p.theme.colors.border};
  padding: 0 16px;
  gap: 2px;

  & > button { flex: 1; padding: 11px 8px; }
`;

const SIDEBAR_W = 300;

export const Layout = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;

  ${p => p.stacked ? `
    & > [data-msg-sidebar] { width: 100%; min-width: 0; max-width: none; flex: 1; border-right: none; }
    & > [data-msg-sidebar]:only-child { flex: 1; min-height: 0; }
    & > [data-msg-main] { width: 100%; flex: 1; }
  ` : `
    & > [data-msg-sidebar] { width: ${SIDEBAR_W}px; min-width: ${SIDEBAR_W}px; }
    & > [data-msg-main] { flex: 1; min-width: 0; }

    @media (max-width: 1400px) {
      & > [data-msg-sidebar] { width: 260px; min-width: 260px; }
    }
    @media (max-width: 1200px) {
      flex-direction: column;
      & > [data-msg-sidebar] { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid ${p.theme.colors.border}; }
      & > [data-msg-main] { width: 100%; }
    }
  `}

  @media (max-width: 768px) {
    flex-direction: column;
    & > [data-msg-sidebar] { width: 100%; min-width: unset; }
  }
`;

export const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.white};
  border-right: 1px solid ${p => p.theme.colors.border};
  overflow: hidden;
  flex-shrink: 0;
  min-height: 0;
`;

export const SidebarHeader = styled.div`
  padding: 15px 15px 12px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  flex-shrink: 0;

  h2 {
    font-family: ${p => p.theme.font.display};
    font-size: 18px;
    font-weight: 600;
    color: ${p => p.theme.colors.onyx};
    letter-spacing: 0.06em;
  }
  p {
    font-size: 9.5px;
    color: ${p => p.theme.colors.ash};
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-top: 3px;
  }
`;

// min-width: 0 is load-bearing here — without it a flex child defaults to
// min-width:auto, which refuses to shrink below its content's intrinsic
// width. Everything ChatWindow renders into this (the composer, the
// participants search box, status/type badges) then pushes this column
// wider instead of wrapping/truncating, overflowing past the message
// panel's right edge. The original plain-CSS version had this split across
// two rules (.msg-main and .msg-main--full, the latter carrying
// min-width:0) — collapsing them into one styled-component during the
// Emotion conversion dropped it by accident.
export const Main = styled.main`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: ${p => (p.full ? undefined : p.theme.colors.greige)};
`;

export const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: ${p => p.theme.colors.ash};
  user-select: none;

  svg { opacity: 0.2; }
  h3 {
    font-family: ${p => p.theme.font.display};
    font-size: 18.5px;
    font-weight: 400;
    color: ${p => p.theme.colors.ashLight};
    letter-spacing: 0.04em;
  }
  p { font-size: 11px; }
`;
