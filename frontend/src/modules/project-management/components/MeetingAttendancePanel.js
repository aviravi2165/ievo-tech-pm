import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { meetingAttendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { BtnPrimary, Empty } from '../styles/shared.styles';
import MeetingFormModal from './MeetingFormModal';
import MeetingDetailPanel from './MeetingDetailPanel';

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function MeetingRow({ m, theme, onOpen }) {
  const total = m.totalMembers || 0;
  const summary = total === 0
    ? 'No members on this meeting'
    : `${m.presentCount} Present · ${m.absentCount} Absent`;
  return (
    <button type="button" onClick={() => onOpen(m.meetingId)}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3,
        padding: '12px 14px', border: 'none', borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.white, cursor: 'pointer', fontFamily: 'inherit',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
        <span style={{ fontSize: 11.5, color: theme.colors.ash, flexShrink: 0 }}>{fmtDate(m.meetingDate)}</span>
      </div>
      <div style={{ fontSize: 12, color: theme.colors.ash }}>{summary}</div>
      {typeof m.pendingRequestCount === 'number' && m.pendingRequestCount > 0 && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.colors.copper }}>
          {m.pendingRequestCount} attendance request{m.pendingRequestCount === 1 ? '' : 's'} pending
        </div>
      )}
    </button>
  );
}

/**
 * MeetingAttendancePanel — the "Attendance" project tab. Meeting/session
 * list (searchable, date-filterable, latest first) → click a meeting for
 * its full attendance sheet (MeetingDetailPanel). Reads project.members for
 * the Add/Edit Meeting roster picker — no separate member-search endpoint
 * needed, meetings only ever draw from CURRENT project members.
 */
export default function MeetingAttendancePanel({ projectId, myUserId, myRole, projectMembers }) {
  const theme = useTheme();
  const canManage = myRole === 'Manager';

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setMeetings(await meetingAttendanceApi.list(projectId, { search: search || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })); }
    catch (err) { setError(apiErrorMessage(err, 'Failed to load meetings.')); }
    finally { setLoading(false); }
  }, [projectId, search, dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);

  if (selectedMeetingId) {
    return (
      <MeetingDetailPanel
        projectId={projectId} meetingId={selectedMeetingId} myUserId={myUserId} myRole={myRole}
        projectMembers={projectMembers} onBack={() => setSelectedMeetingId(null)} onChanged={load}
      />
    );
  }

  const totalPending = canManage ? meetings.reduce((s, m) => s + (m.pendingRequestCount || 0), 0) : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings…"
            style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', fontSize: 12, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit', width: 170 }} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date"
            style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 8px', fontSize: 12, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
          <span style={{ fontSize: 11, color: theme.colors.ashLight }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date"
            style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 8px', fontSize: 12, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
          {(search || dateFrom || dateTo) && (
            <button type="button" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
              style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 11.5 }}>Clear</button>
          )}
          {totalPending > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: theme.colors.copper, background: `${theme.colors.copper}1a`, borderRadius: 10, padding: '3px 10px' }}>
              {totalPending} pending request{totalPending === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {canManage && (
          <BtnPrimary onClick={() => setShowAdd(true)} style={{ fontSize: 12, padding: '7px 16px' }}>+ Add Meeting</BtnPrimary>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>
      ) : error ? (
        <Empty>{error}</Empty>
      ) : meetings.length === 0 ? (
        <Empty>
          {search || dateFrom || dateTo ? 'No meetings match your filters.' : 'No meetings recorded yet.'}
        </Empty>
      ) : (
        <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
          {meetings.map(m => <MeetingRow key={m.meetingId} m={m} theme={theme} onOpen={setSelectedMeetingId} />)}
        </div>
      )}

      {showAdd && (
        <MeetingFormModal
          mode="create" projectId={projectId} projectMembers={projectMembers}
          onClose={() => setShowAdd(false)}
          onSaved={(meetingId) => { load(); setSelectedMeetingId(meetingId); }}
        />
      )}
    </div>
  );
}
