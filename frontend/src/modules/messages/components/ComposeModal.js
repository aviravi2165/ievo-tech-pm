import { useState, useRef } from 'react';
import RecipientPicker from './RecipientPicker';
import { messageApi } from '../api/messageApi';
import { fileApi } from '../api/fileApi';

/**
 * ComposeModal
 * Props:
 *   onClose()
 *   onSent(conversationId)
 *   groups — from useGroups
 */
export default function ComposeModal({ onClose, onSent, groups = [] }) {
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [allowReply, setAllowReply] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  const ALLOWED = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'text/plain'];

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) { setError(`File type not allowed: ${file.name}`); continue; }
      if (file.size > 25 * 1024 * 1024) { setError(`File too large: ${file.name}`); continue; }
      setError('');
      const tempId = `tmp_${Date.now()}`;
      setAttachments(prev => [...prev, { tempId, name: file.name, uploading: true, progress: 0 }]);
      try {
        const result = await fileApi.upload(file, pct => {
          setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, progress: pct } : a));
        });
        setAttachments(prev => prev.map(a =>
          a.tempId === tempId ? { ...a, uploading: false, attachmentId: result.attachmentId } : a
        ));
      } catch {
        setError(`Upload failed: ${file.name}`);
        setAttachments(prev => prev.filter(a => a.tempId !== tempId));
      }
    }
  };

  const handleSend = async () => {
    if (recipients.length === 0) { setError('Please add at least one recipient.'); return; }
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (!body.trim()) { setError('Message body is required.'); return; }
    if (attachments.some(a => a.uploading)) { setError('Wait for uploads to finish.'); return; }

    setSending(true);
    setError('');
    try {
      const recipientIds = recipients.filter(r => r.type === 'user').map(r => r.id);
      const groupIds = recipients.filter(r => r.type === 'group').map(r => r.id);

      const result = await messageApi.send({
        recipientIds,
        groupIds,
        subject: subject.trim(),
        bodyHtml: body.trim(),
        allowReply,
        attachmentIds: attachments.filter(a => a.attachmentId).map(a => a.attachmentId),
      });
      onSent?.(result.conversationId);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <h3>New Message</h3>
          <button className="icon-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* To */}
          <div>
            <label className="field-label">To</label>
            <RecipientPicker value={recipients} onChange={setRecipients} groups={groups} />
          </div>

          {/* Subject */}
          <div>
            <label className="field-label">Subject</label>
            <input
              className="field-input"
              type="text"
              placeholder="Enter subject…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div>
            <label className="field-label">Message</label>
            <textarea
              className="field-input field-textarea"
              placeholder="Write your message…"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="field-label">Attachments</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{
                padding: '7px 14px',
                background: 'var(--slate)',
                border: '1px solid var(--divider)',
                borderRadius: 'var(--radius)',
                fontSize: 12, color: 'var(--muted)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                Attach Files
                <input type="file" multiple style={{ display: 'none' }} onChange={handleFile}
                  accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.txt" />
              </label>
              {attachments.map(a => (
                <div key={a.tempId} className="composer-attach-chip">
                  {a.uploading
                    ? <span style={{ color: 'var(--gold)', fontSize: 11 }}>{a.progress}%</span>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  }
                  <span>{a.name}</span>
                  <button className="composer-attach-remove"
                    onClick={() => setAttachments(prev => prev.filter(x => x.tempId !== a.tempId))}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Allow reply toggle */}
          <div className="toggle-row">
            <div>
              <div className="toggle-label">Allow Replies</div>
              <div className="toggle-sub">Disable to send a broadcast-only message</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={allowReply} onChange={e => setAllowReply(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 12, padding: '6px 10px', background: 'rgba(192,57,43,0.1)', borderRadius: 'var(--radius)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
}