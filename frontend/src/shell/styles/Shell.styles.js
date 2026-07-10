import styled from '@emotion/styled';

// Outer app shell layout — the top-level flex column (topbar + body) that
// everything else lives inside. Reads theme via Emotion's ThemeProvider
// context (already wrapping the whole app in App.js), not from CSS custom
// properties on document.documentElement — that indirection existed only
// because shell.css was plain CSS and couldn't consume Emotion's theme
// directly. A styled-component can just read props.theme, so there's
// nothing left needing that bridge for anything migrated here.
export const ErpShell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: ${p => p.theme.colors.greige};
`;

export const ErpShellBody = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

// Center workspace — hosts whichever module is active.
export const ErpMain = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.greige};
`;
