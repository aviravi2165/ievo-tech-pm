// Table-based Phase/Activity/Task hierarchy — the CSS Grid table system
// shared by PhasePanel/ActivityRow/TaskItem/ProjectDetailPage/
// ProjectListPage. Kept together in its own file (not folded into
// shared.styles.js) since these pieces form one tightly-coupled subsystem
// — column widths, grid templates, and row/header components all have to
// agree pixel-for-pixel with each other, which is easier to keep correct
// when they're read as one unit rather than scattered across generic
// "shared" exports.
//
// Column widths are shared constants (not per-component guesses) so
// TableHeadCell and every row's cells line up pixel-for-pixel regardless of
// which row (group header or task) is rendering them.
import styled from '@emotion/styled';

const t = (fn) => (props) => fn(props.theme);

// due: 64 was too narrow for what actually renders there — DueDateBadge
// shows "⚠ 12d late" / "Due in 3d" for anything overdue or due-soon (not
// just a plain date), and Cell has overflow:hidden (needed elsewhere to
// stop text bleeding into neighboring columns), so any due-date badge
// wider than 64px was being silently clipped down to nothing visible —
// reading as "tasks don't show due date" even though the data was there.
export const COL = {
  assignee: 60,
  due: 88,
  priority: 60,
  status: 86,
};

// GROUP_COL — Phase and Activity rows are NOT task-shaped data: they have
// no single assignee (a Manager/roster, not one person) and no priority
// concept at all. Forcing them through Task's COL set left Assignee/
// Priority either blank (looked broken — "why have the column") or stuffed
// with unrelated content (a dependency badge under "Priority"). Phase and
// Activity get their own independent column set instead — Manager (not
// "Assignee" — different concept, a different word) and Dates (a range,
// not a single "Due Date"), each rendered under ITS OWN header placed
// right where that level's rows start, not one header trying to describe
// three different shapes of data at once.
// progress: 104 — same width the progress bar div previously used inline
// (`<div style={{width:104}}>`) inside the Name cluster in PhasePanel.js/
// ActivityRow.js, before BUG-030 moved it into its own column here to
// match ProjectListPage's dedicated Progress column (Status already had
// its own column; Progress was the only one still crammed into Name).
export const GROUP_COL = {
  manager:  110,
  dates:    170,
  progress: 104,
  status:   86,
};

// CSS Grid templates — replaces the flexbox "spacer + fixed-width cells +
// trailing action toolbar" approach entirely. That approach required the
// action toolbar's width to be precisely reserved (via a matching header
// spacer) so the flex:1 spacer before it compressed by a consistent
// amount — but the toolbar's real width varies by row (a Manager sees more
// icons than a Member viewing their own assigned task), so no single
// reserved number ever worked for every case, and sticky/absolute
// positioning tricks to work around it caused overlapping content and
// elements rendering outside the table. Grid tracks are sized
// independently per column — the actions column can be `max-content`
// (exactly as wide as its own icons, nothing more) without that affecting
// where ANY other column sits, which is the actual guarantee this needed
// from the start.
//
// Fixed px widths for the actions track (110 for both), NOT max-content.
// TableHead and GroupRow/TaskTableRow are separate grid containers (one
// per header, one per row) — max-content on the actions track would size
// independently in each: 0px in the header (no icons there) vs however
// wide a given row's icons need, which would make the shared 1fr Name
// track compute to a DIFFERENT actual pixel width in the header than in
// the row (1fr absorbs whatever the fixed tracks don't use), silently
// reintroducing the exact drift this rewrite exists to eliminate. A fixed
// width keeps every non-1fr track byte-for-byte identical between header
// and row, so 1fr computes identically too. 110px covers Phase's Members+
// Prerequisites+Delete (~3 icons) and Activity's Members+Chat+
// Prerequisites+Delete (~4 items, the largest case since Members was
// re-added as an explicit icon). Rows with fewer icons than the track's
// width just show a bit of slack on the left within their OWN actions
// cell — contained there, never touching any other column.
// minmax(120px, 1fr), not bare 1fr — a bare 1fr track has no min-content
// floor once overflow:hidden is on its cell (which it is, see TableHeadCell/
// Cell below), so under enough width pressure elsewhere in the page (e.g.
// the message panel's own min-width) this track computes all the way down
// to 0 and the Name column silently disappears instead of the Table's own
// overflow-x:auto kicking in. The 120px floor forces horizontal scrolling
// once things get that tight, instead of erasing the column.
export const GROUP_GRID_COLS = `minmax(120px, 1fr) ${GROUP_COL.manager}px ${GROUP_COL.dates}px ${GROUP_COL.progress}px ${GROUP_COL.status}px 124px`;
export const TASK_GRID_COLS  = `minmax(120px, 1fr) ${COL.assignee}px ${COL.due}px ${COL.priority}px ${COL.status}px 124px`;

// flex-shrink: 0 — Table is rendered as a flex child of DetailBody
// (display:flex; flex-direction:column). Without this, a flex child
// defaults to flex-shrink:1 and gets COMPRESSED to fit the parent's visible
// height instead of growing to its natural content size — and since Table
// also has overflow:hidden (for the rounded corners), that compression
// silently CLIPPED whatever didn't fit, instead of the page being able to
// scroll down to it. This is the real cause of "not able to scroll" on the
// Project Details page: the content was being cut off, not made scrollable.
// overflow-x:auto (not hidden) — narrow viewports (message panel open,
// etc.) need SOME way to reach columns that don't fit; that used to be
// each row scrolling individually (which is what made RowActions'
// position:sticky-per-row create the whole reserved-space alignment mess).
// Scrolling the whole Table instead means the header and every row always
// share the exact same horizontal scroll offset — perfectly in sync by
// construction, not by matching reserved widths.
export const Table = styled.div`
  background: ${t(th => th.colors.white)};
  border: 1px solid ${t(th => th.colors.border)};
  border-radius: ${t(th => th.radius.lg)};
  overflow-x: auto; flex-shrink: 0;
`;

// gap matches GroupRow/TaskTableRow/ListRow's gap (5px, not 8) — a mismatch
// here meant the cumulative gap space before the fixed-width columns
// differed between header and rows, drifting their alignment by a few
// pixels even after the RowActions reservation fix above.
// Own dedicated copper gradient here (NOT theme.gradient.header — that
// token is shared with the shell topbar, so strengthening it for this
// table would have oversaturated the topbar too). This is the Phase-level
// default; Activity/Task sub-headers override it inline with their own
// navy/neutral gradients at the same strength.
// display:grid — replaces flexbox's "spacer + fixed cells + trailing
// toolbar" here too. cols prop lets callers pick GROUP_GRID_COLS (default —
// Phase/Activity headers) or TASK_GRID_COLS (Task's own header, passed
// explicitly). The actions column is a 6th "max-content" track matching
// GroupRow/TaskTableRow below.
export const TableHead = styled.div`
  display: grid; grid-template-columns: ${(props) => props.cols || GROUP_GRID_COLS};
  align-items: center; gap: 5px;
  padding: 0 10px; height: 23px; flex-shrink: 0;
  background: linear-gradient(90deg, ${t(th => th.colors.white)} 0%, ${t(th => th.colors.espressoDark)}50 100%);
  border-bottom: 1px solid ${t(th => th.colors.border)};
  font-size: 8.5px; font-weight: 900; text-transform: uppercase;
  letter-spacing: 0.04em; color: ${t(th => th.colors.black)};
`;

// overflow/ellipsis/nowrap — grid tracks don't grow past their own defined
// width, so text that's too long for its column would otherwise still
// render at natural size and visually overflow into whatever's next.
export const TableHeadCell = styled.div`
  ${(props) => (props.center ? 'text-align:center;' : '')}
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

// level: 0 = Phase, 1 = Activity. Bold group-header row — same
// GROUP_GRID_COLS template as its header (see TableHead above), so the
// Name/Manager/Dates/Status/Actions columns always land in the exact same
// place the header declared, regardless of how many action icons this
// particular row happens to show. That's the actual fix for the alignment
// problems that recurred across many rounds of flexbox reserved-space
// patches: grid tracks are sized independently per column, so a wide or
// narrow "Actions" column can never shift where any OTHER column sits.
// The first grid cell (Name) is expected to be ONE wrapping element
// containing the chevron/name/dep-badge/reorder-arrows/progress-bar
// cluster — not several separate top-level children — since grid placement
// is positional, not "whatever's left before a spacer."
// Tinted copper (Phase) / navy (Activity) — same color family as that
// level's PhaseBody/ActivityBody and its own TableHead strip, so the whole
// Phase (header row + expanded body + its own column header) reads as one
// coherent copper zone, and the whole Activity likewise reads as one navy
// zone.
// border-top + margin-top on level 0 (Phase) rows only — with the whole
// tree living in one continuous flat table (no separate bordered cards per
// phase), there was nothing marking where one phase's full expanded
// content ends and the next phase begins. margin-top adds actual
// whitespace between one phase's block and the next, not just a 2px rule
// sitting flush against it.
// ClickUp-style hover-reveal: these used to be permanently visible on
// every row, which is what made an expanded tree of several Phases/
// Activities read as a wall of icon clusters even when nothing was being
// acted on. opacity-only (not display/visibility) — the icons still
// occupy their grid cell at their real size the whole time, so nothing
// about row height/column alignment shifts on hover; only their visibility
// changes. Keyboard/touch users still reach them via :focus-within, since
// neither hover exists for them.
//
// Targeted via a plain `[data-row-actions]` attribute selector below, NOT
// emotion's `${Component}` selector interpolation — that syntax requires
// @emotion/babel-plugin (or the swc equivalent) to resolve at compile time,
// which this project's Vite config doesn't have wired up. Using it here
// threw "Component selectors can only be used in conjunction with
// @emotion/babel-plugin…" at runtime and crashed every page that rendered
// a Phase/Activity/Task row (i.e. the whole Project Detail page). A plain
// attribute selector needs no compiler support at all.
export const RowActions = styled.div`
  display: flex; gap: 3px; align-items: center; justify-content: flex-end;
  justify-self: end;
  background: ${t(th => th.colors.white)}b3;
  border: 1px solid ${t(th => th.colors.border)};
  border-radius: ${t(th => th.radius.sm)};
  padding: 2px;
  opacity: 0; transition: opacity 0.12s ease;
`;

export const GroupRow = styled.div`
  display: grid; grid-template-columns: ${GROUP_GRID_COLS};
  align-items: center; gap: 5px;
  min-height: ${t(th => th.row.group)}; flex-shrink: 0;
  padding: 0 10px 0 ${(props) => 10 + props.level * 15}px;
  margin-top: ${(props) => (props.level === 0 ? '10px' : '0')};
  background: ${(props) => (props.level === 0 ? props.theme.colors.copper : props.theme.colors.navyTint)}26;
  border-bottom: 1px solid ${t(th => th.colors.border)};
  border-top: ${(props) => (props.level === 0 ? `2px solid ${props.theme.colors.onyx}1f` : 'none')};
  cursor: pointer;
  &:hover { background: ${(props) => (props.level === 0 ? props.theme.colors.copper : props.theme.colors.navyTint)}3d; }
  &:hover [data-row-actions], &:focus-within [data-row-actions] { opacity: 1; }
`;

// level: 2 = Task. The real data row — same TASK_GRID_COLS template as its
// own header (see TableHead usage in ActivityRow.js).
export const TaskTableRow = styled.div`
  display: grid; grid-template-columns: ${TASK_GRID_COLS};
  align-items: center; gap: 5px;
  min-height: ${t(th => th.row.task)}; flex-shrink: 0;
  padding: 0 10px 0 ${10 + 2 * 15}px;
  border-bottom: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.white)};
  &:last-child { border-bottom: none; }
  &:hover { background: ${t(th => th.colors.greige)}; }
  &:hover [data-row-actions], &:focus-within [data-row-actions] { opacity: 1; }
`;

// Shared cell wrapper — same width contract as TableHeadCell so content
// never drifts out of its column.
// overflow:hidden as a defensive baseline — content inside a cell should
// clip to its own column rather than visually bleeding into the next one if
// it ever exceeds the cell's bounds (this is what happened with the table
// head cells before they got the same treatment). Safe: nothing rendered
// inside a Cell needs to escape its bounds (native <select> dropdowns paint
// in their own browser layer, unaffected by ancestor overflow).
export const Cell = styled.div`
  ${(props) => (props.w ? `width:${props.w}px; flex-shrink:0;` : 'flex:1 1 120px; min-width:120px;')}
  display: flex; align-items: center; gap: 6px; min-height: 0; overflow: hidden;
  ${(props) => (props.center ? 'justify-content:center;' : '')}
`;

// Flat (non-indented) data row — same visual language as TaskTableRow but
// no left-indent, for tables that aren't nested (the project list).
export const ListRow = styled.div`
  display: flex; align-items: center; gap: 5px;
  min-height: ${t(th => th.row.group)}; flex-shrink: 0;
  padding: 0 10px;
  border-bottom: 1px solid ${t(th => th.colors.border)};
  background: ${t(th => th.colors.white)};
  cursor: pointer;
  &:last-child { border-bottom: none; }
  &:hover { background: ${t(th => th.colors.greige)}; }
`;

// Action icons — always visible (no hover-reveal).
// Contained as one toolbar chip (shared background/border) rather than a
// row of individually-bordered icon buttons floating loose next to each
// other — the latter reads as scattered/random rather than a designed unit.
// Plain grid item (not sticky, not absolute — both were attempts to work
// around the same underlying flexbox limitation and both caused their own
// regressions: sticky still consumed flex layout space, breaking
// alignment; absolute removed it from flow entirely but also removed it
// from the row's own bounds, so it could overlap or float outside the
// table depending on scroll/width state). As the last grid item in a
// fixed-px-sized track (see GROUP_GRID_COLS/TASK_GRID_COLS), it just
// occupies exactly the space its own icons need, in its own dedicated
// column, which can never affect where any OTHER column sits.
// justify-self:end — grid items default to stretching to fill their track,
// which here would make the bordered/backgrounded box itself stretch to
// the actions column's full fixed width (110px), visibly showing the
// slack for any row with fewer icons than that width was sized for as an
// empty bordered box. justify-self:end makes RowActions size to its own
// content instead, sitting flush against the end of its track; any unused
// track width is just empty grid space with nothing drawn in it.
// ── Assignee avatars ──────────────────────────────────────────────────────────
export const Assignees = styled.div` display: flex; flex-shrink: 0; `;
// pending prop — a request sent but not yet accepted. Rendered as a dashed,
// washed-out circle (not the solid filled one accepted assignees get) so a
// just-sent assignment shows SOMETHING immediately instead of the row still
// reading "Unassigned" until the other person accepts, which looked broken.
export const Avatar = styled.div`
  width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
  background: ${(props) => (props.pending ? 'transparent' : props.theme.colors.mid)};
  border: 2px ${(props) => (props.pending ? 'dashed' : 'solid')} ${(props) => (props.pending ? props.theme.colors.ashLight : props.theme.colors.white)};
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; font-weight: 700; color: ${(props) => (props.pending ? props.theme.colors.ash : props.theme.colors.onyx)};
  font-family: ${t(th => th.font.display)}; margin-left: -4px;
  opacity: ${(props) => (props.pending ? 0.75 : 1)};
  &:first-of-type { margin-left: 0; }
`;
