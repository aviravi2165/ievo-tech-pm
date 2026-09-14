import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { attendanceApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { BtnPrimary, Empty } from '../styles/shared.styles';

const STATUSES = ['Present', 'Absent', 'Half Day', 'Leave'];
const STATUS_COLOR = { Present: 'success', 'Half Day': 'copper', Absent: 'danger', Leave: 'ash' };
const todayStr = () => new Date().toISOString().slice(0, 10);
function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

function StatusBadge({ status, theme }) {
  if (!status) return <span style={{ fontSize: 11, color: theme.colors.ashLight, fontStyle: 'italic' }}>Not marked</span>;
  const color = theme.colors[STATUS_COLOR[status]] || theme.colors.ash;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}1a`, borderRadius: 10, padding: '3px 10px' }}>
      {status}
    </span>
  );
}

/**
 * AttendancePanel — the project's "Attendance" tab. Any member can check
 * themselves in as Present for today; a Manager/Owner (or admin — canEdit)
 * can set anyone's status for any date, with a note. Backed by
 * attendanceApi / attendanceService (pm_attendance: one row per project+
 * member+date).
 */
export default function AttendancePanel({ projectId, myUserId, canEdit }) {
  const theme = useTheme();
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editStatus, setEditStatus] = useState('Present');
  const [editNote, setEditNote] = useState('');

  const month = date.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([attendanceApi.getForDate(projectId, date), attendanceApi.getSummary(projectId, month)]);
      setRows(r); setSummary(s);
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to load attendance.')); }
    finally { setLoading(false); }
  }, [projectId, date, month]);
  useEffect(() => { load(); }, [load]);

  const myRow = rows.find(r => String(r.userId) === String(myUserId));
  const isToday = date === todayStr();

  const checkIn = async () => {
    setBusyId('checkin');
    try { await attendanceApi.checkIn(projectId, { status: 'Present' }); await load(); showToast('Checked in for today.', 'success'); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to check in.')); }
    finally { setBusyId(null); }
  };

  const startEdit = (row) => { setEditingId(row.userId); setEditStatus(row.status || 'Present'); setEditNote(row.note || ''); };

  const saveEdit = async (userId) => {
    setBusyId(userId);
    try { await attendanceApi.setStatus(projectId, userId, { date, status: editStatus, note: editNote || null }); setEditingId(null); await load(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to update attendance.')); }
    finally { setBusyId(null); }
  };

  const presentCount = rows.filter(r => r.status === 'Present').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
            style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', fontSize: 12, color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
          <span style={{ fontSize: 12, color: theme.colors.ash }}>{presentCount}/{rows.length} present</span>
        </div>
        {isToday && (!myRow?.status ? (
          <BtnPrimary onClick={checkIn} disabled={busyId === 'checkin'} style={{ fontSize: 12, padding: '6px 14px' }}>
            {busyId === 'checkin' ? 'Checking in…' : "Check in — I'm Present"}
          </BtnPrimary>
        ) : (
          <span style={{ fontSize: 12, color: theme.colors.ash }}>You're marked <strong style={{ color: theme.colors.onyx }}>{myRow.status}</strong> today</span>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <Empty>No members on this project yet.</Empty>
      ) : (
        <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
          {rows.map(r => (
            <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.white }}>
              <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx }}>{initials(r.name)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>

              {editingId === r.userId ? (
                <>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                    style={{ fontSize: 12, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 8px', color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Note (optional)"
                    style={{ fontSize: 12, width: 140, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 8px', color: theme.colors.onyx, outline: 'none', fontFamily: 'inherit' }} />
                  <BtnPrimary onClick={() => saveEdit(r.userId)} disabled={busyId === r.userId} style={{ fontSize: 11, padding: '4px 10px' }}>Save</BtnPrimary>
                  <button type="button" onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                </>
              ) : (
                <>
                  <StatusBadge status={r.status} theme={theme} />
                  {r.note && <span style={{ fontSize: 11, color: theme.colors.ash, fontStyle: 'italic', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.note}>"{r.note}"</span>}
                  {canEdit && (
                    <button type="button" onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', color: theme.colors.espresso, cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>Edit</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── This month's summary ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', margin: '22px 0 10px' }}>
        This month ({month})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {summary.map(s => (
          <div key={s.userId} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '8px 12px', minWidth: 140, background: theme.colors.white }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.colors.onyx, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
            <div style={{ fontSize: 11, color: theme.colors.ash }}>
              <strong style={{ color: theme.colors.success }}>{s.presentDays}</strong> present · <strong style={{ color: theme.colors.danger }}>{s.absentDays}</strong> absent · <strong style={{ color: theme.colors.copper }}>{s.halfDays}</strong> half · <strong style={{ color: theme.colors.ash }}>{s.leaveDays}</strong> leave
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
