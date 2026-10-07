import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { X, Paperclip, Send, Pencil, Trash2, FileText, Mail, Maximize2, Minimize2 } from 'lucide-react';
import { meetingMinutesApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { ModalOverlay, Modal, BtnPrimary, BtnGhost } from '../styles/shared.styles';

function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function fmtWhen(d) {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Minutes of Meeting — a chat-like log for one meeting. Only the meeting's
 * creator writes (and can email the minutes to every participant); everyone
 * who can open the meeting reads.
 */
export default function MeetingMinutesModal({ projectId, meeting, onClose }) {
  const theme = useTheme();
  const [entries, setEntries] = useState([]);
  const [canWrite, setCanWrite] = useState(false);
  const [canEmail, setCanEmail] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await meetingMinutesApi.list(projectId, meeting.meetingId);
      setEntries(r.entries); setCanWrite(r.canWrite); setCanEmail(Boolean(r.canEmail)); setCreatorName(r.createdByName || '');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to load minutes.')); }
    finally { setLoading(false); }
  }, [projectId, meeting.meetingId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries.length]);

  const send = async () => {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      await meetingMinutesApi.add(projectId, meeting.meetingId, text.trim(), files);
      setText(''); setFiles([]);
      await load();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to add minutes.')); }
    finally { setSending(false); }
  };

  const saveEdit = async (minuteId) => {
    try {
      await meetingMinutesApi.update(projectId, meeting.meetingId, minuteId, editText);
      setEditingId(null);
      await load();
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to save changes.')); }
  };

  const remove = async (minuteId) => {
    if (!window.confirm('Delete this minutes entry?')) return;
    try {
      await meetingMinutesApi.remove(projectId, meeting.meetingId, minuteId);
      setEntries(prev => prev.filter(e => e.minuteId !== minuteId));
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to delete entry.')); }
  };

  const download = async (file) => {
    try { await meetingMinutesApi.download(projectId, meeting.meetingId, file); }
    catch (err) { showToast(apiErrorMessage(err, 'Download failed.')); }
  };

  const emailParticipants = async () => {
    if (!window.confirm('Email these minutes to every participant of this meeting?')) return;
    setEmailing(true);
    try {
      const r = await meetingMinutesApi.email(projectId, meeting.meetingId);
      const skipped = r.notAttached ? ` ${r.notAttached} large file(s) were listed by name instead of attached.` : '';
      showToast(`Minutes emailed to ${r.recipientCount} participant${r.recipientCount === 1 ? '' : 's'}.${skipped}`, 'success');
    } catch (err) { showToast(apiErrorMessage(err, 'Failed to email the minutes.')); }
    finally { setEmailing(false); }
  };

  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...picked].slice(0, 10));
    e.target.value = '';
  };

  const linkBtn = { background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex', padding: 2 };

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal style={{
        maxWidth: enlarged ? 'none' : 640, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        height: enlarged ? 'calc(100vh - 40px)' : '80vh', maxHeight: enlarged ? 'none' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '18px 22px 12px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Minutes of Meeting</div>
            <div style={{ fontFamily: theme.font.display, fontSize: 16, fontWeight: 800, color: theme.colors.onyx, marginTop: 2 }}>{meeting.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {canEmail && (
              <button type="button" onClick={emailParticipants} disabled={emailing} title="Email the minutes to all participants"
                style={{ ...linkBtn, padding: 4, opacity: emailing ? 0.5 : 1 }}>
                <Mail size={17} strokeWidth={2} />
              </button>
            )}
            <button type="button" onClick={() => setEnlarged(v => !v)} title={enlarged ? 'Restore size' : 'Enlarge'} style={{ ...linkBtn, padding: 4 }}>
              {enlarged ? <Minimize2 size={16} strokeWidth={2} /> : <Maximize2 size={16} strokeWidth={2} />}
            </button>
            <button type="button" onClick={onClose} title="Close" style={{ ...linkBtn, padding: 4 }}><X size={18} strokeWidth={2} /></button>
          </div>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 22px', background: theme.colors.greige }}>
          {loading && <div style={{ fontSize: 12.5, color: theme.colors.ash }}>Loading…</div>}
          {!loading && entries.length === 0 && (
            <div style={{ textAlign: 'center', color: theme.colors.ash, fontSize: 12.5, padding: '40px 10px' }}>
              No minutes yet.{canWrite ? ' Write the first note or upload the minutes file below.' : ''}
            </div>
          )}
          {entries.map(e => (
            <div key={e.minuteId} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: theme.colors.onyx }}>{initials(e.authorName)}</span>
              <div style={{ flex: 1, minWidth: 0, background: theme.colors.white, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.colors.onyx }}>{e.authorName}</span>
                  <span style={{ fontSize: 10.5, color: theme.colors.ashLight }}>{fmtWhen(e.createdAt)}{e.updatedAt ? ' · edited' : ''}</span>
                  <span style={{ flex: 1 }} />
                  {e.canEdit && editingId !== e.minuteId && (
                    <button type="button" title="Edit" style={linkBtn} onClick={() => { setEditingId(e.minuteId); setEditText(e.body || ''); }}><Pencil size={12} strokeWidth={2} /></button>
                  )}
                  {e.canDelete && (
                    <button type="button" title="Delete" style={{ ...linkBtn, color: theme.colors.danger }} onClick={() => remove(e.minuteId)}><Trash2 size={12} strokeWidth={2} /></button>
                  )}
                </div>
                {editingId === e.minuteId ? (
                  <div style={{ marginTop: 6 }}>
                    <textarea value={editText} onChange={ev => setEditText(ev.target.value)} rows={4}
                      style={{ width: '100%', fontSize: 12.5, fontFamily: 'inherit', padding: 8, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, resize: 'vertical', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                      <BtnGhost type="button" onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</BtnGhost>
                      <BtnPrimary type="button" onClick={() => saveEdit(e.minuteId)} style={{ fontSize: 11, padding: '4px 10px' }}>Save</BtnPrimary>
                    </div>
                  </div>
                ) : e.body && (
                  <div style={{ fontSize: 12.5, color: theme.colors.onyx, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4, lineHeight: 1.5 }}>{e.body}</div>
                )}
                {e.files.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {e.files.map(f => (
                      <button key={f.fileId} type="button" onClick={() => download(f)} title="Download"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: theme.colors.onyx, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 10px', cursor: 'pointer', maxWidth: '100%' }}>
                        <FileText size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</span>
                        <span style={{ color: theme.colors.ash, flexShrink: 0 }}>{fmtSize(f.fileSize)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {canWrite ? (
          <div style={{ padding: '12px 22px 16px', borderTop: `1px solid ${theme.colors.border}` }}>
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: 12, padding: '3px 6px 3px 10px' }}>
                    {f.name}
                    <button type="button" title="Remove" style={linkBtn} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><X size={12} strokeWidth={2} /></button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button type="button" title="Attach files" onClick={() => fileInputRef.current?.click()} disabled={sending}
                style={{ ...linkBtn, padding: 8, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm }}>
                <Paperclip size={15} strokeWidth={2} />
              </button>
              <input ref={fileInputRef} type="file" multiple onChange={pickFiles} style={{ display: 'none' }} />
              <textarea value={text} onChange={e => setText(e.target.value)} rows={2} disabled={sending}
                placeholder="Write minutes… (Ctrl+Enter to post)"
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
                style={{ flex: 1, fontSize: 12.5, fontFamily: 'inherit', padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, resize: 'vertical', minHeight: 40, maxHeight: 200, boxSizing: 'border-box' }} />
              <BtnPrimary type="button" onClick={send} disabled={sending || (!text.trim() && files.length === 0)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px' }}>
                <Send size={13} strokeWidth={2} /> {sending ? 'Posting…' : 'Post'}
              </BtnPrimary>
            </div>
          </div>
        ) : (
          <div style={{ padding: '10px 22px', borderTop: `1px solid ${theme.colors.border}`, fontSize: 11.5, color: theme.colors.ash }}>
            Only the meeting's creator{creatorName ? ` (${creatorName})` : ''} can write the minutes.
          </div>
        )}
      </Modal>
    </ModalOverlay>
  );
}
