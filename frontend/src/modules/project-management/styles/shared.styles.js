// Cross-cutting primitives used by 3+ PM components — buttons, icon
// buttons, status/priority pills, badges, modal chrome, inline edit
// panels, sub-panels, progress bar, audit log, timeline, member rows,
// user-search dropdown. Split out of the single monolithic pm.styles.js
// (796 lines, ~76 exports) to match the per-component styles/ pattern
// used by every other module now (shell, auth, dashboard, users,
// messages) — this file is the PM module's equivalent of those modules'
// shared.styles.js. Table-row primitives (Table/TableHead/GroupRow/
// TaskTableRow/Cell/ListRow/COL/GROUP_COL/grid templates) live in their
// own Table.styles.js since they're a distinct, tightly-coupled subsystem;
// everything else stays here.
import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

// ── Module root — shared by both pages ─────────────────────────────────────────
export const Wrap = styled.div`
  display: flex; height: 100%; flex-direction: column;
  background: ${t(th => th.colors.greige)};
  color: ${t(th => th.colors.onyx)};
  font-family: ${t(th => th.font.body)};
  overflow: hidden;
`;

// ── Status / priority pills — solid-fill, structured (not pastel tints) ───────
// completed/done previously mapped to the SAME th.colors.success as active,
// so a project showing "ACTIVE" (still being worked) and one showing
// "COMPLETED" (done) rendered as literally the same green pill — no visual
// way to tell them apart at a glance. completed/done now use navy — calm
// and settled, distinct from active's vibrant "still live" green.
const STATUS_BG = {
  planning:     th => th.colors.copper,
  active:       th => th.colors.success,
  'on-hold':    th => th.colors.warning,
  completed:    th => th.colors.navy,
  cancelled:    th => th.colors.danger,
  'to-do':      th => th.colors.ash,
  'in-progress':th => th.colors.info,
  blocked:      th => th.colors.danger,
  'in-review':  th => th.colors.copper,
  done:         th => th.colors.navy,
};

// Fixed width (not min-width — "IN PROGRESS" is the longest label at 11
// characters, so a min-width only floors the *shorter* labels while
// "IN PROGRESS" itself keeps growing past it, which is exactly the
// inconsistent-pill-width bug this was supposed to fix) so every status pill
// is identically sized regardless of label length. Otherwise every row's
// trailing badges/icons (dep badge, overdue warning, action buttons) land at
// a different x-position depending on how long that row's status text
// happens to be, which reads as misaligned clutter when scanning down a
// list of phase/activity/task rows.
// width:112 (not 98) + white-space:nowrap — the app has a global
// box-sizing:border-box reset, so a fixed `width` INCLUDES the pill's own
// padding (18px of it), leaving only ~80px for "IN PROGRESS" — not enough,
// and with no white-space:nowrap that overflow silently wrapped onto a
// second line instead of visibly overflowing (which would at least have
// been an obvious bug to spot).
// flex-shrink:0 — a `width` alone does NOT stop a flex child from being
// compressed below it; flex-shrink defaults to 1, so as a child of a flex
// row under space pressure this pill was still shrinking well below 112px,
// clipping its own text down to a single letter ("M" instead of "MEDIUM").
// This has to live on the styled component itself, not a call-site inline
// style, so it's guaranteed wherever the pill is used (phase/activity/task
// rows all embed it inside different flex containers).
export const StatusPill = styled.span`
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  width: 82px; flex-shrink: 0; padding: 1px 6px; border-radius: ${t(th => th.radius.sm)};
  font-size: 9px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap;
  text-transform: uppercase; color: ${t(th => th.colors.onAccent)}; text-align: center;
  background: ${(props) => (STATUS_BG[props.status] || (th => th.colors.ash))(props.theme)};
`;

const PRIORITY_BG = {
  low:      th => th.colors.ash,
  medium:   th => th.colors.info,
  high:     th => th.colors.warning,
  critical: th => th.colors.danger,
};

// Same fixed-width/border-box/nowrap/flex-shrink fix as StatusPill —
// "CRITICAL" is the longest label.
export const PriorityPill = styled.span`
  display: inline-block; width: 58px; flex-shrink: 0; padding: 1px 5px; border-radius: ${t(th => th.radius.sm)};
  font-size: 8px; font-weight: 700; text-transform: uppercase; color: ${t(th => th.colors.onAccent)};
  text-align: center; white-space: nowrap; overflow: hidden;
  background: ${(props) => (PRIORITY_BG[props.priority] || (th => th.colors.ash))(props.theme)};
`;

// ── Overdue / late / due-soon / inactive badges ───────────────────────────────
export const OverdueText = styled.span`
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: ${t(th => th.colors.danger)}; font-weight: 600;
`;

export const LateTag = styled.span`
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700; color: ${t(th => th.colors.onAccent)};
  background: ${t(th => th.colors.danger)};
  border-radius: 10px; padding: 1px 7px; letter-spacing: 0.03em;
`;

export const DueSoonTag = styled.span`
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700;
  color: ${t(th => th.colors.warning)};
  background: ${t(th => th.colors.warning)}29;
  border-radius: 10px; padding: 1px 7px;
`;

export const InactiveTag = styled.span`
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700; color: ${t(th => th.colors.ash)};
  background: ${t(th => th.colors.ash)}24;
  border-radius: 10px; padding: 1px 7px;
  letter-spacing: 0.03em; text-transform: uppercase;
`;

// ── Progress bar ──────────────────────────────────────────────────────────────
export const ProgressWrap = styled.div` display: flex; align-items: center; gap: 8px; `;
export const ProgressTrack = styled.div`
  flex: 1; height: 8px; background: ${t(th => th.colors.mid)};
  border: 1px solid ${t(th => th.colors.border)};
  border-radius: 4px; overflow: hidden; min-width: 60px;
`;
// Charcoal (the primary brand accent) — copper was too close in hue to the
// `warning` semantic color, so a copper progress bar visually read as an
// alert rather than plain progress ("pops out weirdly"). Charcoal is darker
// and desaturated enough to sit quietly as a neutral progress indicator
// while still tying to the same buttons/active-tab color used everywhere
// else, instead of introducing yet another competing hue.
export const ProgressFill = styled.div`
  height: 100%; background: ${t(th => th.colors.espresso)};
  border-radius: 3px; transition: width 0.4s ease;
  width: ${(props) => Math.min(100, props.value || 0)}%;
`;
export const ProgressLabel = styled.span`
  font-size: 11px; color: ${t(th => th.colors.ash)}; min-width: 30px; flex-shrink: 0; text-align: right;
`;

// ── Modal ─────────────────────────────────────────────────────────────────────
export const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  padding: 20px; backdrop-filter: blur(2px);
`;

export const Modal = styled.div`
  background: ${t(th => th.colors.white)};
  border: 1px solid ${t(th => th.colors.border)};
  border-radius: ${t(th => th.radius.lg)};
  padding: 28px; width: 100%; max-width: 520px;
  max-height: 85vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  position: relative;

  h3 {
    font-family: ${t(th => th.font.display)};
    font-size: 18px; margin: 0 0 20px;
    color: ${t(th => th.colors.onyx)}; font-weight: 600;
  }
`;

// ── Form fields inside modal ───────────────────────────────────────────────────
export const Field = styled.div`
  margin-bottom: 16px;
  label {
    display: block; font-size: 11px; color: ${t(th => th.colors.ash)};
    text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; font-weight: 600;
  }
  label .req { color: ${t(th => th.colors.espresso)}; margin-left: 2px; }
  input, select, textarea {
    width: 100%; background: ${t(th => th.colors.mid)}; border: 1px solid ${t(th => th.colors.border)};
    border-radius: ${t(th => th.radius.sm)}; padding: 9px 12px;
    color: ${t(th => th.colors.onyx)}; font-size: 13px; font-family: inherit;
    outline: none; transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    border-color: ${t(th => th.colors.espresso)};
    box-shadow: 0 0 0 3px ${t(th => th.colors.espresso)}1f;
  }
  input.error, textarea.error { border-color: ${t(th => th.colors.danger)}; }
  textarea { resize: vertical; min-height: 72px; }
`;

export const FieldHint = styled.div` font-size: 11px; color: ${t(th => th.colors.ash)}; margin-top: 4px; `;

export const ModalFooter = styled.div`
  display: flex; gap: 8px; justify-content: flex-end;
  margin-top: 24px; padding-top: 16px;
  border-top: 1px solid ${t(th => th.colors.border)};
`;

// ── Inline edit panels (inside task/activity/phase rows) ──────────────────────
export const EditPanel = styled.div`
  margin-top: 8px; padding: 12px 14px;
  background: ${t(th => th.colors.greige)};
  border: 1px solid ${t(th => th.colors.border)};
  border-radius: ${t(th => th.radius.sm)};
  border-top: 2px solid ${t(th => th.colors.espresso)};
`;

export const EditPanelTitle = styled.div`
  font-size: 11px; color: ${t(th => th.colors.onyx)}; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;
`;

export const EditRow = styled.div`
  display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;
  & > div { display: flex; flex-direction: column; gap: 3px; }
  label {
    font-size: 10px; color: ${t(th => th.colors.ash)}; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  input[type=date], input[type=text], select, textarea {
    background: ${t(th => th.colors.mid)}; border: 1px solid ${t(th => th.colors.border)};
    border-radius: ${t(th => th.radius.sm)}; padding: 6px 10px;
    color: ${t(th => th.colors.onyx)}; font-size: 12px; font-family: inherit;
    outline: none; transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus { border-color: ${t(th => th.colors.espresso)}; }
`;

// ── Audit log ─────────────────────────────────────────────────────────────────
export const Audit = styled.div` font-size: 12px; `;
export const AuditRow = styled.div`
  display: flex; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid ${t(th => th.colors.border)};
`;
export const AuditTime = styled.span` color: ${t(th => th.colors.ash)}; white-space: nowrap; min-width: 130px; `;
export const AuditWho = styled.span` color: ${t(th => th.colors.onyx)}; font-weight: 600; min-width: 100px; `;
export const AuditText = styled.span` color: ${t(th => th.colors.onyx)}; `;

// ── Empty state ────────────────────────────────────────────────────────────────
export const Empty = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 20px; color: ${t(th => th.colors.ash)}; text-align: center;
  svg { opacity: 0.25; }
`;

// ── Dep badge ──────────────────────────────────────────────────────────────────
export const DepBadge = styled.span`
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px;
  color: ${t(th => th.colors.ash)}; border: 1px solid ${t(th => th.colors.border)};
  border-radius: 10px; padding: 1px 7px; background: ${t(th => th.colors.mid)};
`;

// ── Buttons ────────────────────────────────────────────────────────────────────
export const Btn = styled.button`
  padding: 4px 10px; border-radius: ${t(th => th.radius.sm)}; border: none;
  font-size: 10px; font-weight: 700; cursor: pointer; transition: all 0.15s;
  font-family: inherit; letter-spacing: 0.01em;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

export const BtnPrimary = styled(Btn)`
  background: ${t(th => th.gradient.accent)}; color: ${t(th => th.colors.onAccent)};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  &:hover { background: ${t(th => th.colors.espressoDark)}; box-shadow: 0 2px 6px ${t(th => th.colors.espresso)}4d; }
`;

export const BtnGhost = styled(Btn)`
  background: transparent; color: ${t(th => th.colors.onyx)};
  border: 1.5px solid ${t(th => th.colors.border)};
  &:hover { color: ${t(th => th.colors.onyx)}; border-color: ${t(th => th.colors.onyx)}; background: ${t(th => th.colors.onyx)}08; }
`;

export const BtnDanger = styled(Btn)`
  background: transparent; color: ${t(th => th.colors.danger)};
  border: 1.5px solid ${t(th => th.colors.danger)}59;
  &:hover { background: ${t(th => th.colors.danger)}14; }
`;

// ── Icon buttons — always visible (no hover-reveal) ────────────────────────────
export const IconBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  width: 23px; height: 23px; border-radius: ${t(th => th.radius.sm)};
  border: 1.5px solid ${(props) => (props.active ? props.theme.colors.onyx : props.theme.colors.border)};
  background: ${(props) => (props.active ? `${props.theme.colors.onyx}0f` : 'transparent')};
  color: ${(props) => (props.active ? props.theme.colors.onyx : props.theme.colors.ash)};
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
  &:hover { color: ${t(th => th.colors.onyx)}; border-color: ${t(th => th.colors.onyx)}; background: ${t(th => th.colors.mid)}; }
`;

export const IconBtnDanger = styled(IconBtn)`
  &:hover { color: ${t(th => th.colors.danger)}; border-color: ${t(th => th.colors.danger)}66; background: ${t(th => th.colors.danger)}0f; }
`;

// ── User search dropdown ──────────────────────────────────────────────────────
export const UserDropdown = styled.div`
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200;
  background: ${t(th => th.colors.white)}; border: 1px solid ${t(th => th.colors.border)};
  border-radius: ${t(th => th.radius.sm)}; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-height: 220px; overflow-y: auto;
`;

export const UserOption = styled.div`
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  cursor: pointer; transition: background 0.1s;
  &:hover { background: ${t(th => th.colors.greige)}; }
`;

// ── Timeline ──────────────────────────────────────────────────────────────────
// Frozen-label-column layout: the label column and the date/bar area are
// two INDEPENDENT layout regions (Timeline is a flex row splitting them),
// not one scrolling row with a sticky label inside it. An earlier attempt
// used position:sticky on TlLabel inside the scrolling flex row — sticky
// positioning combined with a dynamically-computed flex-item width turned
// out unreliable here (the label still visibly scrolled instead of staying
// pinned). Two genuinely separate regions — one that never scrolls at all,
// one that does — sidesteps the sticky quirk entirely and is the standard
// "frozen column" pattern every spreadsheet/Gantt UI uses.
export const Timeline = styled.div` display: flex; padding-bottom: 16px; `;
export const TlLabelCol = styled.div` flex-shrink: 0; width: 180px; `;
export const TlScrollCol = styled.div` flex: 1; min-width: 0; overflow-x: auto; `;
// border-bottom on every row gives the whole grid a consistent sectioned
// look — previously rows only had a margin-bottom gap with no line, so
// entities read as loosely floating rather than belonging to a table.
export const TlRow = styled.div`
  display: flex; align-items: center; gap: 0; height: 36px; margin-bottom: 4px;
  border-bottom: 1px solid ${t(th => th.colors.border)}55;
`;
export const TlLabel = styled.div`
  width: 180px; flex-shrink: 0; font-size: 12px; color: ${t(th => th.colors.onyx)};
  padding-right: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
export const TlBarWrap = styled.div`
  flex-shrink: 0;
  /* width set inline per-render (TimelineView.js) to the computed content
     width — proportional to the date range, in px, not a CSS percentage.
     height likewise set inline to the exact row height (ROW_H) rather than
     relying on height:100% here — this wrap sits in a flex row alongside
     TlLabel with align-items:center, and a percentage height combined with
     that made narrow single-day bar segments render with their bottom
     rounded edge clipped off (overflow:hidden cutting into the pill shape),
     which is why overflow:hidden is dropped too — bars are individually
     rounded already and don't need the wrap to clip them. */
  position: relative;
  background: ${t(th => th.colors.mid)}; border-radius: ${t(th => th.radius.sm)};
`;

const TL_BAR_BG = {
  phase:    th => th.colors.onyx,
  activity: th => th.colors.info,
  task:     th => th.colors.success,
  overdue:  th => th.colors.danger,
};

export const TlBar = styled.div`
  position: absolute; top: 6px; height: 24px; border-radius: ${t(th => th.radius.sm)};
  display: flex; align-items: center; padding: 0 8px;
  font-size: 10px; font-weight: 600; color: ${t(th => th.colors.onAccent)}; min-width: 4px;
  background: ${(props) => (TL_BAR_BG[props.kind] || (th => th.colors.ash))(props.theme)};
`;

// ── Task list scroll ───────────────────────────────────────────────────────────
export const TaskList = styled.div`
  max-height: 360px; overflow-y: auto; padding-right: 2px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: ${t(th => th.colors.mid)}; border-radius: 2px; }
`;

// ── Section sub-panel (deps, assignees, dates inline panels) ─────────────────
export const SubPanel = styled.div`
  margin: 0 -12px; padding: 10px 14px 12px;
  border-top: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.greige)};
`;

export const SubPanelTitle = styled.div`
  font-size: 10px; color: ${t(th => th.colors.onyx)}; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px;
`;

export const SubPanelHint = styled.div`
  font-size: 11px; color: ${t(th => th.colors.ash)}; margin-bottom: 8px; line-height: 1.5;
`;

export const MemberRow = styled.div`
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 4px;
  border: 1px solid ${(props) => (props.selected ? props.theme.colors.espressoDark : props.theme.colors.border)};
  border-radius: ${t(th => th.radius.sm)};
  background: ${(props) => (props.selected ? `${props.theme.colors.espressoDark}0f` : props.theme.colors.white)};
  transition: border-color 0.12s;
`;
