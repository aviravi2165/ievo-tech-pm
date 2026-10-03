import { useState } from 'react';
import { useTheme } from '@emotion/react';
import { groupApi } from '../api/groupApi';
import { BtnGhost, BtnPrimary } from '../styles/shared.styles';

/**
 * "Email team" — one email to every member of a chat group, all together in
 * To:. Replies go to the sender; Reply All reaches the whole team.
 */
export default function EmailTeamModal({ groupId, groupName, onClose }) {
  const theme = useTheme();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const send = async () => {
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (!message.trim()) { setError('Message is required.'); return; }
    setSending(true); setError('');
    try { setResult(await groupApi.emailTeam(groupId, subject.trim(), message.trim())); }
    catch (err) { setError(err.response?.data?.error || err.message || 'Failed to send the email.'); }
    finally { setSending(false); }
  };

  const input = { width: '100%', boxSizing: 'border-box', fontSize: 13, fontFamily: 'inherit', padding: '9px 12px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.mid, color: theme.colors.onyx, outline: 'none' };
  const label = { display: 'block', fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 5 };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: theme.colors.white, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.lg, padding: 24, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: theme.colors.onyx }}>Email team</div>
        <div style={{ fontSize: 12, color: theme.colors.ash, marginTop: 2, marginBottom: 16 }}>
          One email to every member of <strong>{groupName}</strong>, all in the same mail.
        </div>

        {result ? (
          <>
            <div style={{ fontSize: 13, color: theme.colors.onyx, padding: '12px 14px', borderRadius: theme.radius.sm, background: `${theme.colors.success}1a`, border: `1px solid ${theme.colors.success}55` }}>
              Email sent to {result.recipientCount} team member{result.recipientCount === 1 ? '' : 's'} (including you).
              {result.skipped > 0 && <> {result.skipped} member{result.skipped === 1 ? ' has' : 's have'} no email address and didn't get it.</>}
              <div style={{ fontSize: 12, color: theme.colors.ash, marginTop: 4 }}>If someone doesn't see it, ask them to check their Spam / Junk folder.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <BtnPrimary type="button" onClick={onClose}>Done</BtnPrimary>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Subject</label>
              <input style={input} value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} autoFocus placeholder="e.g. Site visit moved to Friday" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Message</label>
              <textarea style={{ ...input, resize: 'vertical' }} rows={7} value={message} onChange={e => setMessage(e.target.value)} maxLength={5000} placeholder="Write your message…" />
            </div>
            {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <BtnGhost type="button" onClick={onClose} disabled={sending}>Cancel</BtnGhost>
              <BtnPrimary type="button" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send email'}</BtnPrimary>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
