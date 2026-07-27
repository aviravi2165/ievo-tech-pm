import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Renders its children into document.body (via a portal) at a fixed
// position computed from the anchor's own bounding box, instead of as a
// position:absolute child of whatever DOM it's logically nested inside.
// Needed because PhasePanel/ActivityRow's rows live inside <Table>
// (Table.styles.js), which has overflow-x:auto for its own horizontal-
// scroll reasons — any position:absolute popup placed inside that
// subtree gets clipped to the Table's own bounds the moment it extends
// past them, even though position:absolute is supposed to escape normal
// flow (it does NOT escape an ancestor's overflow clipping). Portaling to
// body sidesteps that ancestor entirely.
//
// Anchor can be given either way:
//   - anchorRef: a ref that's always attached to the same trigger element.
//   - anchorEl:  a plain DOM node (e.g. e.currentTarget captured in state)
//     for cases with more than one possible trigger for the same panel
//     (a dep-count badge AND a separate "manage" icon, in different grid
//     columns) — whichever one was actually clicked becomes the anchor.
//
// onClose (optional): when provided, FloatingPopover manages its own
// click-outside-to-close instead of the caller wiring up a ref-based
// effect — a mousedown outside both the anchor and the portaled content
// calls onClose.
// Margin kept clear from the viewport edge on every side — both for the
// flip/clamp math below and so the popup never touches the browser edge
// pixel-for-pixel.
const EDGE_GAP = 12;

export default function FloatingPopover({ anchorRef, anchorEl, open, onClose, align = 'left', width = 360, children }) {
  const [pos, setPos] = useState(null);
  const contentRef = useRef(null);
  const anchor = anchorEl || anchorRef?.current;

  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
    const compute = () => {
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Always opens below the anchor, at a FIXED top (rect.bottom + 6) —
      // never slid upward past that, so it never ends up floating over
      // rows above the trigger. An earlier version reserved a fixed 420px
      // of height and slid the whole box up to fit that, which is exactly
      // what caused it to jump up and overlap unrelated rows when the
      // trigger sat deep in a long scrolled table — there was often no
      // real need for 420px; whatever space genuinely remains below the
      // trigger is used instead, and content scrolls inside it via
      // maxHeight + overflowY:auto on the caller's own content div. Only
      // when literally nothing more than a sliver remains below (the
      // trigger sits right at the bottom edge of the viewport) does this
      // fall back to a minimum-height panel, still anchored below, so it's
      // always reachable by scrolling the underlying page.
      const MIN_HEIGHT = 160;
      const top = Math.max(EDGE_GAP, Math.min(rect.bottom + 6, vh - EDGE_GAP - MIN_HEIGHT));
      const maxHeight = Math.max(MIN_HEIGHT, vh - top - EDGE_GAP);

      let left = align === 'right' ? rect.right - width : rect.left;
      left = Math.min(Math.max(left, EDGE_GAP), vw - width - EDGE_GAP);

      setPos({ top, left, maxHeight });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, anchor, align, width]);

  useLayoutEffect(() => {
    if (!open || !onClose) return undefined;
    const handler = (e) => {
      if (contentRef.current?.contains(e.target)) return;
      if (anchor?.contains?.(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchor]);

  if (!open || !pos) return null;

  return createPortal(
    // overflowY:auto (not hidden) directly on THIS wrapper is what actually
    // makes the popup scrollable — callers' own content divs set
    // maxHeight:'100%'/overflowY:'auto' on themselves, but a percentage
    // height only resolves against a parent with an explicitly specified
    // height; this wrapper only has max-height (a constraint applied after
    // normal sizing, not a specified height), so per the CSS spec that
    // percentage falls back to unconstrained — the caller's inner div grew
    // past this box's real pixel maxHeight with no scrollbar anywhere,
    // which is what read as the popup being silently clipped/cut off.
    // Scrolling at this outer level sidesteps that entirely: it doesn't
    // matter what height unit any child below it uses.
    <div ref={contentRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      width, maxHeight: pos.maxHeight, overflowY: 'auto', overflowX: 'hidden', zIndex: 1000,
    }}>
      {children}
    </div>,
    document.body,
  );
}
