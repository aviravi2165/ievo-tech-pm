import { useMemo, useState } from 'react';

// Generic client-side sort+filter over an in-memory array. Every list this
// is used on (Projects page, Phase/Activity/Task rows, Audit Log, Admin
// Dashboard, User Management) already holds its full dataset in component
// state — there's no server-side sort/filter API, so this is pure array
// ops, not a data-fetching hook.
//
// sorters: { key: (a,b) => number }  — same contract as Array.prototype.sort
// filters: { key: { predicate(item, value) } } — value comes from setFilter;
//   a filter is skipped entirely when its current value is null/undefined/'all'.
export function useSortFilter(items, { sorters = {}, filters = {}, defaultSortKey = null, defaultSortDir = 'asc' } = {}) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState(defaultSortDir);
  const [activeFilters, setActiveFilters] = useState({});

  const setFilter = (key, value) => setActiveFilters(f => ({ ...f, [key]: value }));
  const clearFilters = () => setActiveFilters({});
  const toggleSortDir = () => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));

  const result = useMemo(() => {
    let out = items;
    for (const key of Object.keys(activeFilters)) {
      const value = activeFilters[key];
      const def = filters[key];
      if (!def || value == null || value === 'all' || value === '') continue;
      out = out.filter(item => def.predicate(item, value));
    }
    if (sortKey && sorters[sortKey]) {
      const cmp = sorters[sortKey];
      out = [...out].sort((a, b) => cmp(a, b) * (sortDir === 'asc' ? 1 : -1));
    }
    return out;
  }, [items, activeFilters, sortKey, sortDir, sorters, filters]);

  return {
    items: result,
    sortKey, setSortKey,
    sortDir, setSortDir, toggleSortDir,
    filters: activeFilters, setFilter, clearFilters,
    total: items.length,
    resultCount: result.length,
  };
}
