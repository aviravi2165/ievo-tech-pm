import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronLeft } from 'lucide-react';
import { aiLearningApi } from './api/aiLearningApi';
import ChatBox from '../project-management/components/ChatBox';

function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

// Relative activity timestamp for the conversation list — "10:42 AM" for
// today, "Yesterday", else "N days ago" (falling back to a plain date once
// it's far enough back that "N days ago" stops being useful).
function fmtActivity(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// No JS-based mobile-detection hook existed anywhere in this app (layout
// switches elsewhere are pure CSS @media) — this one is intentionally tiny
// and local rather than a new shared dependency, needed here because the
// two-pane→single-pane swap depends on more than CSS (which pane is
// visible is also driven by whether an employee is selected).
function useIsNarrow(breakpoint = 820) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return narrow;
}

const EMPLOYEE_PLACEHOLDER = 'Share what you learned, an AI tool you tried, or a task you completed…  (Enter to send, Shift+Enter for a new line)';
const MANAGER_PLACEHOLDER  = 'Reply…  (Enter to send, Shift+Enter for a new line)';

function EmployeeList({ theme, employees, loading, error, search, setSearch, selected, onSelect }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.white }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${theme.colors.border}` }}>
        <div style={{ fontFamily: theme.font.display, fontSize: 16, fontWeight: 800, color: theme.colors.onyx, marginBottom: 10 }}>AI Learning</div>
        <input
          placeholder="Search employees…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', background: theme.colors.greige, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 10px', fontSize: 12.5, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 16, color: theme.colors.ash, fontSize: 12.5 }}>Loading…</div>}
        {error && <div style={{ padding: 16, color: theme.colors.danger, fontSize: 12.5 }}>{error}</div>}
        {!loading && !error && employees.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: theme.colors.ash, fontSize: 13 }}>No AI learning updates yet.</div>
        )}
        {employees.map(emp => {
          const active = String(selected?.employeeId) === String(emp.employeeId);
          return (
            <button key={emp.employeeId} type="button" onClick={() => onSelect(emp)}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 14px', border: 'none', borderBottom: `1px solid ${theme.colors.border}`,
                background: active ? `${theme.colors.espresso}14` : 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: theme.colors.onyx }}>
                {initials(emp.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</span>
                  <span style={{ fontSize: 10.5, color: theme.colors.ashLight, flexShrink: 0 }}>{fmtActivity(emp.lastMessageAt)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: theme.colors.ash, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {emp.lastMessagePreview || 'No updates yet'}
                </div>
                {emp.deptName && <div style={{ fontSize: 9.5, color: theme.colors.ashLight, marginTop: 2 }}>{emp.deptName}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * AILearningModule — an internal AI-learning journal/timeline, one
 * continuous thread per employee (see ../../../Backend/src/modules/
 * ai-learning). An employee gets their own single chat; a manager/admin
 * instead gets a WhatsApp-style employee list on the left and the selected
 * employee's timeline on the right (same two-pane pattern DPRModule.js
 * already uses for project reports) — reusing ChatBox for the actual
 * conversation either way.
 */
export default function AILearningModule() {
  const theme = useTheme();
  const narrow = useIsNarrow();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [context, setContext] = useState(null); // { isManagerOrAdmin, myThread }

  const [employees, setEmployees] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState(null);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [selectedError, setSelectedError] = useState('');

  useEffect(() => {
    aiLearningApi.getContext()
      .then(setContext)
      .catch(err => setLoadError(err?.response?.data?.error || 'Failed to load AI Learning.'))
      .finally(() => setLoading(false));
  }, []);

  const loadEmployees = useCallback(() => {
    setListLoading(true); setListError('');
    aiLearningApi.listEmployees(search)
      .then(setEmployees)
      .catch(err => setListError(err?.response?.data?.error || 'Failed to load employees.'))
      .finally(() => setListLoading(false));
  }, [search]);

  useEffect(() => {
    if (context?.isManagerOrAdmin) loadEmployees();
  }, [context, loadEmployees]);

  const selectEmployee = async (emp) => {
    setSelected(emp); setSelectedConvId(null); setSelectedError('');
    try {
      const { conversationId } = await aiLearningApi.getEmployeeThread(emp.employeeId);
      setSelectedConvId(conversationId);
    } catch (err) { setSelectedError(err?.response?.data?.error || "Failed to open this employee's timeline."); }
  };

  if (loading) return <div style={{ padding: 24, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>;
  if (loadError) return <div style={{ padding: 24, color: theme.colors.danger, fontSize: 13 }}>{loadError}</div>;

  // ── Employee view — single continuous chat, own journal only ──
  if (!context.isManagerOrAdmin) {
    if (!context.myThread?.conversationId) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: theme.colors.ash, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.colors.onyx }}>Start documenting your AI learning</div>
          <div style={{ fontSize: 13 }}>Share what you learned, the AI tools you explored, or the tasks you completed.</div>
        </div>
      );
    }
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.white, flexShrink: 0 }}>
          <div style={{ fontFamily: theme.font.display, fontSize: 15, fontWeight: 800, color: theme.colors.onyx }}>AI Learning</div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatBox
            conversationId={context.myThread.conversationId}
            placeholder={EMPLOYEE_PLACEHOLDER}
            emptyTitle="Start documenting your AI learning"
            emptySubtitle="Share what you learned, the AI tools you explored, or the tasks you completed."
          />
        </div>
      </div>
    );
  }

  // ── Manager/admin view — employee list + selected timeline ──
  const listPane = (
    <EmployeeList theme={theme} employees={employees} loading={listLoading} error={listError}
      search={search} setSearch={setSearch} selected={selected} onSelect={selectEmployee} />
  );

  const conversationPane = !selected ? (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.ash, fontSize: 13, textAlign: 'center', padding: 24 }}>
      Select an employee to view their AI learning timeline.
    </div>
  ) : (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.white, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {narrow && (
          <button type="button" onClick={() => setSelected(null)} title="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex', padding: 0 }}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        )}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.colors.onyx }}>{selected.name}</div>
          <div style={{ fontSize: 11, color: theme.colors.ash }}>AI Learning</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {selectedError ? (
          <div style={{ padding: 20, color: theme.colors.danger, fontSize: 13 }}>{selectedError}</div>
        ) : !selectedConvId ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.ashLight, fontSize: 13, textAlign: 'center', padding: 24 }}>
            No AI learning updates yet.
          </div>
        ) : (
          <ChatBox key={selectedConvId} conversationId={selectedConvId} placeholder={MANAGER_PLACEHOLDER} />
        )}
      </div>
    </div>
  );

  if (narrow) {
    // Tablet/mobile: one pane at a time — list, or the selected conversation
    // with a back button — rather than a fixed two-column layout.
    return <div style={{ height: '100%', background: theme.colors.greige }}>{selected ? conversationPane : listPane}</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: theme.colors.greige }}>
      <div style={{ width: 300, minWidth: 240, flexShrink: 0, borderRight: `1px solid ${theme.colors.border}` }}>{listPane}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{conversationPane}</div>
    </div>
  );
}
