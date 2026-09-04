// Shared name-truncation so Phase and Activity (and anywhere else that opts
// in) cap long titles at the SAME length and read consistently, instead of
// each relying on its own pixel width + flex behaviour (which truncated at
// different, layout-dependent points). Always pair this with a title=/tooltip
// carrying the FULL name — this only trims what's shown, never the data.
export const NAME_MAX = 40;

export function truncateName(name = '', max = NAME_MAX) {
  const s = String(name ?? '');
  // trimEnd() so we never render "Some name …" with a trailing space before
  // the ellipsis when the cut lands right after a space.
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}
