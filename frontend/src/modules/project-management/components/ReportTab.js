import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import ChatBox from './ChatBox';
import UserSearchInput from './UserSearchInput';
import { reportApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { BtnPrimary, BtnGhost } from '../styles/shared.styles';

/**
 * ReportTab — a project's Report chat. It reuses the messaging ChatWindow
 * (so messages + file attachments + live updates come for free), plus an
 * admin-only strip to curate who's in the report (pm_report_members). The
 * conversation is created lazily on first open (reportApi.get).
 */
export default function ReportTab({ projectId, projectName }) {
  const theme = useTheme();
  const [report,     setReport]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [pick,       setPick]       = useState(null);
  const [memberErr,  setMemberErr]  = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setReport(await reportApi.get(projectId)); }
    catch (err) {
      setError(err?.response?.status === 403
        ? "You don't have access to this project's report."
        : apiErrorMessage(err, 'Failed to load the report.'));
    } finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const addMember = async () => {
    if (!pick) return;
    setMemberErr('');
    try { const members = await reportApi.addMember(projectId, pick.userId); setReport(r => ({ ...r, members })); setPick(null); }
    catch (err) { setMemberErr(apiErrorMessage(err, 'Failed to add member.')); }
  };
  const removeMember = async (uid) => {
    try { const members = await reportApi.removeMember(projectId, uid); setReport(r => ({ ...r, members })); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove member.')); }
  };

  if (loading) return <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading report…</div>;
  if (error)   return <div style={{ padding: 20, color: theme.colors.danger, fontSize: 13 }}>{error}</div>;
  if (!report) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Admin-only: curate who can see & post in this report. */}
      {report.canManage && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.white, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Report members ({report.members?.length || 0})
            </span>
            {(report.members || []).map(m => (
              <span key={m.userId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '2px 8px' }} title={m.email}>
                {m.name}
                <button type="button" onClick={() => removeMember(m.userId)}
                  style={{ background: 'none', border: 'none', color: theme.colors.ash, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
            <BtnGhost onClick={() => setManageOpen(v => !v)} style={{ fontSize: 11, padding: '3px 10px' }}>
              {manageOpen ? 'Done' : '+ Add member'}
            </BtnGhost>
          </div>
          {manageOpen && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, maxWidth: 440 }}>
              <UserSearchInput selectedUser={pick} onSelect={setPick} placeholder="Search a user to add…" />
              <BtnPrimary onClick={addMember} disabled={!pick} style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}>Add</BtnPrimary>
            </div>
          )}
          {memberErr && <div style={{ color: theme.colors.danger, fontSize: 11, marginTop: 6 }}>{memberErr}</div>}
        </div>
      )}

      {/* The chat itself — clean messenger-style bubbles. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ChatBox conversationId={report.conversationId} />
      </div>
    </div>
  );
}
