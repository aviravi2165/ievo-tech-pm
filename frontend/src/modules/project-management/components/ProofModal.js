import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { X, Paperclip, FileText, Trash2, Download } from 'lucide-react';
import { taskApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';

// Optional "proof of completion" for one task: the person doing the task (or its manager) can
// attach screenshots / documents, with an optional note. Anyone who can see the task can open and
// download them. Attaching proof is never required and does not change the task's status.

const MAX_FILES = 5;
const MAX_FILE_MB = 20;
const ALLOWED_EXT = ['.xlsx', '.xls', '.xlsm', '.csv', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function ProofModal({ task, onClose, onChanged }) {
  const theme = useTheme();
  const c = theme.colors;
  const [data, setData] = useState(null);     // { proofs, canAdd }
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    try { setData(await taskApi.listProofs(task.taskId)); setError(''); }
    catch (err) { setError(apiErrorMessage(err, 'Could not load the proof files.')); }
  }, [task.taskId]);
  useEffect(() => { load(); }, [load]);

  const pick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const bad = picked.find(f => !ALLOWED_EXT.includes(extOf(f.name)));
    if (bad) { setError(`"${bad.name}" is not allowed. Attach Excel, PDF, Word, PowerPoint, CSV, text or image files.`); return; }
    const big = picked.find(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) { setError(`"${big.name}" is larger than ${MAX_FILE_MB} MB.`); return; }
    setError('');
    setFiles(prev => [...prev, ...picked].slice(0, MAX_FILES));
  };

  const upload = async () => {
    if (!files.length || busy) return;
    setBusy(true); setError('');
    try {
      setData(await taskApi.addProofs(task.taskId, files, note.trim()));
      setFiles([]); setNote('');
      onChanged?.();
    } catch (err) { setError(apiErrorMessage(err, 'Could not attach the files.')); }
    finally { setBusy(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Remove "${p.originalName}"?`)) return;
    try { await taskApi.removeProof(task.taskId, p.proofId); await load(); onChanged?.(); }
    catch (err) { showToast(apiErrorMessage(err, 'Could not remove the file.')); }
  };

  const download = async (p) => {
    try { await taskApi.downloadProof(task.taskId, p); }
    catch (err) { showToast(apiErrorMessage(err, 'Could not download the file.')); }
  };

  const small = { fontSize: 12, color: c.ash };
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Proof of completion" onClick={e => e.stopPropagation()}
        style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.lg, width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: c.onyx }}>Proof of completion</div>
            <div style={{ ...small, marginTop: 2, wordBreak: 'break-word' }}>{task.name}</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex' }}><X size={18} /></button>
        </div>
        <p style={{ ...small, lineHeight: 1.5, margin: '10px 0 14px' }}>
          Optional. Attach a screenshot or document to show this task is done. It does not change the task's status.
        </p>

        {error && <div role="alert" style={{ color: c.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        {!data ? (!error && <div style={small}>Loading…</div>) : (
          <>
            {data.proofs.length === 0 ? (
              <div style={{ ...small, textAlign: 'center', padding: '18px 8px', border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, marginBottom: 14 }}>No proof attached yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {data.proofs.map(p => (
                  <div key={p.proofId} style={{ border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <FileText size={16} color={c.ash} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <button type="button" onClick={() => download(p)} title="Download"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.espresso, fontSize: 13, fontWeight: 600, textAlign: 'left', fontFamily: 'inherit', wordBreak: 'break-word', textDecoration: 'underline' }}>
                        {p.originalName}
                      </button>
                      <div style={small}>{p.uploadedByName} · {fmtWhen(p.uploadedAt)} · {fmtSize(p.fileSize)}</div>
                      {p.note && <div style={{ fontSize: 12.5, color: c.onyx, marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.note}</div>}
                    </div>
                    <button type="button" onClick={() => download(p)} title="Download" aria-label="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex', padding: 2 }}><Download size={15} /></button>
                    {p.canRemove && <button type="button" onClick={() => remove(p)} title="Remove" aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.danger, display: 'flex', padding: 2 }}><Trash2 size={15} /></button>}
                  </div>
                ))}
              </div>
            )}

            {data.canAdd ? (
              <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 14 }}>
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    {files.map((f, i) => (
                      <span key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, background: c.mid, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '5px 8px', minWidth: 0 }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={small}>{fmtSize(f.size)}</span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex', padding: 0 }}><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                )}
                {files.length < MAX_FILES && (
                  <button type="button" onClick={() => fileInput.current?.click()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: c.onyx, border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, padding: '7px 12px', cursor: 'pointer', background: c.white, fontFamily: 'inherit' }}>
                    <Paperclip size={14} /> Choose files
                  </button>
                )}
                <input ref={fileInput} type="file" multiple accept={ALLOWED_EXT.join(',')} onChange={pick} style={{ display: 'none' }} />
                <div style={{ ...small, marginTop: 6 }}>Excel, PDF, Word, PowerPoint, CSV, text or images · up to {MAX_FILES} files at a time · {MAX_FILE_MB} MB each</div>
                {files.length > 0 && (
                  <>
                    <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Add a short note (optional)"
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, background: c.mid, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', color: c.onyx }} />
                    <button type="button" onClick={upload} disabled={busy}
                      style={{ marginTop: 10, background: c.onyx, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                      {busy ? 'Attaching…' : `Attach ${files.length} file${files.length === 1 ? '' : 's'}`}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ ...small, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>Only the people assigned to this task, or its managers, can attach proof.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
