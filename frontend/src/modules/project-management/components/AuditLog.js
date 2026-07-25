import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@emotion/react';
import { projectApi } from '../api/projectApi';
import { Audit, AuditRow, AuditTime, AuditWho, AuditText } from '../styles/shared.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { usePagination } from '../../shared/hooks/usePagination';
import { SortSelect, FilterSelect, FilterToggle, LoadMoreBar } from '../../shared/components/TableControls';

const PAGE_SIZE = 25;

function fmtDate(d) {
  return new Date(d).toLocaleString([], { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

export default function AuditLog({ projectId }) {
  const theme = useTheme();
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    projectApi.getAudit(projectId)
      .then(setLog)
      .finally(() => setLoading(false));
  }, [projectId]);

  const actionOptions = useMemo(() => [...new Set(log.map(e => e.action).filter(Boolean))].map(a => ({ value: a, label: a })), [log]);
  const entityOptions = useMemo(() => [...new Set(log.map(e => e.entityType).filter(Boolean))].map(t => ({ value: t, label: t })), [log]);

  // Sort direction is explicit and toggleable now (BUG report asked to
  // verify the "newest first" default rather than assume it) — the API
  // already returns newest-first, defaultSortDir:'desc' just makes that
  // an intentional, user-visible, toggleable choice instead of an implicit
  // assumption about server ordering.
  const { items: filtered, sortDir, toggleSortDir, filters, setFilter } = useSortFilter(log, {
    sorters: { time: (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime() },
    filters: {
      action: { predicate: (e, v) => e.action === v },
      entity: { predicate: (e, v) => e.entityType === v },
    },
    defaultSortKey: 'time',
    defaultSortDir: 'desc',
  });

  const { pageItems, hasMore, loadMore, total } = usePagination(filtered, PAGE_SIZE);

  if (loading) return <div style={{ color:theme.colors.ash, fontSize:13 }}>Loading audit log…</div>;
  if (!log.length) return <div style={{ color:theme.colors.ash, fontSize:13 }}>No audit entries yet.</div>;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', marginBottom: showFilters ? 6 : 10 }}>
        <FilterToggle open={showFilters} onClick={() => setShowFilters(v => !v)}
          active={!!(filters.action || filters.entity)} title="Sort & filter" />
      </div>
      {showFilters && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, flexWrap:'wrap', padding:'8px 10px', background:theme.colors.greige, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm }}>
          <SortSelect
            value="time" onChange={() => {}} dir={sortDir} onToggleDir={toggleSortDir}
            options={[{ value:'time', label: sortDir === 'desc' ? 'Newest first' : 'Oldest first' }]}
          />
          <FilterSelect placeholder="All actions" value={filters.action} onChange={v => setFilter('action', v)} options={actionOptions} />
          <FilterSelect placeholder="All entity types" value={filters.entity} onChange={v => setFilter('entity', v)} options={entityOptions} />
        </div>
      )}

      {!filtered.length && <div style={{ color:theme.colors.ash, fontSize:13 }}>No audit entries match the current filters.</div>}

      <Audit>
        {pageItems.map(entry => (
          <AuditRow key={entry.id}>
            <AuditTime>{fmtDate(entry.changedAt)}</AuditTime>
            <AuditWho>{entry.userName || '—'}</AuditWho>
            <AuditText>
              <strong>{entry.entityType}</strong> #{entry.entityId} — {entry.action}
              {entry.fieldChanged && <> · <em>{entry.fieldChanged}</em></>}
              {entry.oldValue && <> from <code>{entry.oldValue}</code></>}
              {entry.newValue && <> → <code>{entry.newValue}</code></>}
            </AuditText>
          </AuditRow>
        ))}
      </Audit>

      <LoadMoreBar hasMore={hasMore} onLoadMore={loadMore} remaining={total - pageItems.length} />
    </div>
  );
}
