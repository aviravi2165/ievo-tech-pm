import { useEffect } from 'react';

// Closes a modal/panel on Escape. Every modal in the app currently only
// closes via a backdrop click (BUG-015) — this is the shared fix wired
// into each one individually rather than a single global listener, since
// only the topmost open modal should close, and each modal component
// already owns its own `open` lifecycle.
export function useEscapeKey(onEscape, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, active]);
}
