import { useTheme } from '@emotion/react';
import { ArrowUp, ArrowDown, SlidersHorizontal } from 'lucide-react';

// Small icon button that shows/hides a section's Sort+Filter row — every
// list that has one used to show it permanently, which multiplies badly in
// a nested Phase→Activity→Task tree (a full row of 3 dropdowns repeated
// under every single Activity/Task section reads as overwhelming clutter,
// even though each row is individually fine). Collapsing it behind a
// toggle matches the same "click an icon to reveal a panel" convention
// this app already uses everywhere else (Add Activity, Members, Deps,
// dates — see PhasePanel.js/ActivityRow.js's togglePanel) rather than
// inventing a new interaction pattern just for this. `active` — a small
// filled dot — lets you tell a filter is applied even while collapsed, so
// closing the panel never hides the fact that the list is filtered.
export function FilterToggle({ open, onClick, active, title = 'Sort & filter' }) {
  const theme = useTheme();
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, flexShrink: 0,
        border: `1.5px solid ${open ? theme.colors.onyx : theme.colors.border}`,
        borderRadius: theme.radius.sm,
        background: open ? `${theme.colors.onyx}0f` : 'transparent',
        color: open ? theme.colors.onyx : theme.colors.ash,
        cursor: 'pointer',
      }}>
      <SlidersHorizontal size={13} strokeWidth={2} />
      {active && (
        <span style={{
          position: 'absolute', top: -2, right: -2, width: 7, height: 7,
          borderRadius: '50%', background: theme.colors.copper,
          border: `1.5px solid ${theme.colors.white}`,
        }} />
      )}
    </button>
  );
}

// Themed <select> + asc/desc toggle for a list's sort dropdown. Styled to
// match every other inline-styled <select> already in the PM module (e.g.
// PhasePanel.js's role picker) rather than introducing a new visual
// language — no new styled-component primitive, just the same recipe.
//
// No "Sort…" placeholder option — every caller now always passes a
// defaultSortKey, so there's never a genuinely unsorted state to represent;
// an always-selectable "Sort…" null option just let you click back into a
// dead state for no reason.
//
// Single-option case (e.g. an audit feed that only ever sorts by time):
// a <select> you can't meaningfully change anything in by opening it reads
// as broken UI. Render a plain label + the asc/desc toggle instead — same
// control, no pointless dropdown.
export function SortSelect({ value, onChange, options, dir, onToggleDir, style }) {
  const theme = useTheme();
  const toggleBtn = (
    <button type="button" title={dir === 'asc' ? 'Ascending' : 'Descending'} onClick={onToggleDir}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm, background: 'transparent',
        color: theme.colors.ash, cursor: 'pointer', flexShrink: 0,
      }}>
      {dir === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
    </button>
  );

  if (options.length <= 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: theme.colors.ash, fontWeight: 600 }}>
          {options[0]?.label || 'Sort'}
        </span>
        {toggleBtn}
      </div>
    );
  }

  const selectStyle = {
    background: theme.colors.mid, border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm, padding: '5px 8px', color: theme.colors.onyx,
    fontSize: 11, fontFamily: 'inherit', outline: 'none', ...style,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {toggleBtn}
    </div>
  );
}

// Themed <select> for a single filter dimension — "All" always resets it.
export function FilterSelect({ value, onChange, options, placeholder, style }) {
  const theme = useTheme();
  return (
    <select value={value || 'all'} onChange={e => onChange(e.target.value)}
      style={{
        background: theme.colors.mid, border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.sm, padding: '5px 8px', color: theme.colors.onyx,
        fontSize: 11, fontFamily: 'inherit', outline: 'none', ...style,
      }}>
      <option value="all">{placeholder || 'All'}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// "Load more" button matching ProjectListPage's existing pagination pattern.
export function LoadMoreBar({ hasMore, onLoadMore, remaining, loading }) {
  const theme = useTheme();
  if (!hasMore) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
      <button type="button" onClick={onLoadMore} disabled={loading}
        style={{
          padding: '4px 10px', borderRadius: theme.radius.sm, border: `1.5px solid ${theme.colors.border}`,
          background: 'transparent', color: theme.colors.onyx, fontSize: 10, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.4 : 1,
        }}>
        {loading ? 'Loading…' : `Load more (${remaining} remaining)`}
      </button>
    </div>
  );
}
