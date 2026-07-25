import { useEffect, useState } from 'react';

// Client-side "load more" pagination over an already-fully-loaded array
// (not a server request — see useSortFilter.js for why). Clamps back down
// to the first page whenever a filter/sort shrinks the result set below
// the current scroll position, so switching a filter never leaves the
// list showing zero rows because the old page offset no longer applies.
export function usePagination(items, pageSize = 25) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(c => (items.length < c ? pageSize : c));
  }, [items.length, pageSize]);

  const pageItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const loadMore = () => setVisibleCount(c => c + pageSize);
  const reset = () => setVisibleCount(pageSize);

  return { pageItems, hasMore, loadMore, reset, visibleCount, total: items.length };
}
