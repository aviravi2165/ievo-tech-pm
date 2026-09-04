import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@emotion/react';

// A small rich hover tooltip. Unlike the browser-native `title=` attribute
// (plain, unstyled, slow to appear), this renders arbitrary JSX in a styled
// card. It portals to <body> and uses position:fixed computed from the
// trigger's bounding box — the same trick FloatingPopover uses — so it can't
// be clipped by an ancestor's overflow (e.g. the Table's overflow-x:auto).
//
//   <HoverTip content={<>…</>}>{visibleChild}</HoverTip>
//
// content — node shown in the tooltip (nothing renders if it's null/empty).
export default function HoverTip({ content, children, minWidth = 150, maxWidth = 260 }) {
  const theme = useTheme();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // Prefer below; flip above if there isn't room. Centered horizontally on
    // the trigger, then clamped so a near-edge trigger doesn't push the card
    // off-screen.
    const flipUp = r.bottom + 110 > vh;
    const left = Math.min(Math.max(r.left + r.width / 2, 140), vw - 140);
    setPos({ left, top: flipUp ? r.top - 8 : r.bottom + 8, flipUp });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{ display: 'inline-flex', maxWidth: '100%', minWidth: 0 }}
    >
      {children}
      {pos && content != null && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          transform: `translateX(-50%)${pos.flipUp ? ' translateY(-100%)' : ''}`,
          zIndex: 2000, pointerEvents: 'none',
          background: theme.colors.onyx, color: theme.colors.white,
          borderRadius: theme.radius.sm, boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
          padding: '8px 11px', fontSize: 11, lineHeight: 1.55,
          minWidth, maxWidth, whiteSpace: 'normal',
        }}>
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
