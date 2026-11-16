import { useState, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { X, FileSpreadsheet, Download, CheckCircle2 } from 'lucide-react';
import { importApi } from '../api/projectApi';
import { apiErrorMessage } from '../hooks/toastStore';

// "Import from Excel": download the format, fill it in, choose it here. The file is checked first
// (a preview, nothing is created); only when it is clean can it be imported.

export default function ImportExcelModal({ projectId, onClose, onImported }) {
  const theme = useTheme();
  const c = theme.colors;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);   // { ok, counts, problems, moreProblems, outline }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');           // '' | 'checking' | 'importing'
  const [done, setDone] = useState(null);         // { counts }
  const input = useRef(null);

  const choose = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f); setPreview(null); setError('');
    if (!/\.xlsx$/i.test(f.name)) { setError('Please choose an Excel file in .xlsx format.'); return; }
    setBusy('checking');
    try { setPreview(await importApi.preview(projectId, f)); }
    catch (err) { setError(apiErrorMessage(err, 'Could not read the file.')); }
    finally { setBusy(''); }
  };

  const download = async () => {
    try { await importApi.downloadFormat(projectId); }
    catch (err) { setError(apiErrorMessage(err, 'Could not download the format.')); }
  };

  const run = async () => {
    if (!file || busy) return;
    setBusy('importing'); setError('');
    try { const r = await importApi.run(projectId, file); setDone(r); onImported?.(); }
    catch (err) {
      const problems = err?.response?.data?.meta?.problems;
      if (problems) setPreview(p => ({ ...(p || {}), ok: false, problems, outline: [] }));
      setError(apiErrorMessage(err, 'The import failed.'));
    } finally { setBusy(''); }
  };

  const small = { fontSize: 12, color: c.ash };
  const btn = { borderRadius: theme.radius.sm, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const counts = preview?.counts;

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Import from Excel" onClick={e => e.stopPropagation()}
        style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.lg, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: c.onyx }}>Import from Excel</div>
          <button type="button" onClick={onClose} disabled={!!busy} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex' }}><X size={18} /></button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 8px 8px' }}>
            <CheckCircle2 size={40} color={c.success} strokeWidth={1.8} />
            <div style={{ fontSize: 16, fontWeight: 800, color: c.onyx, margin: '10px 0 4px' }}>Imported</div>
            <div style={{ ...small, fontSize: 13, lineHeight: 1.6 }}>
              {done.counts.phases} phases, {done.counts.activities} activities and {done.counts.tasks} tasks were created.
              People named as task assignees have received their assignment requests.
            </div>
            <button type="button" onClick={onClose} style={{ ...btn, marginTop: 16, background: c.onyx, color: c.white, border: 'none' }}>Done</button>
          </div>
        ) : (
          <>
            <ol style={{ margin: '12px 0 14px', paddingLeft: 18, fontSize: 13, color: c.onyx, lineHeight: 1.7 }}>
              <li>
                Download the format (it holds a filled-in sample and a "How to fill" sheet).{' '}
                <button type="button" onClick={download} style={{ background: 'none', border: 'none', padding: 0, color: c.espresso, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline' }}>
                  <Download size={12} style={{ verticalAlign: '-1px' }} /> Download format
                </button>
              </li>
              <li>Replace the sample rows with your own phases, activities and tasks.</li>
              <li>Choose the file here. It is checked first — nothing is created until you confirm.</li>
            </ol>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
                style={{ ...btn, background: c.white, color: c.onyx, border: `1px solid ${c.border}`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet size={15} /> {file ? 'Choose another file' : 'Choose Excel file'}
              </button>
              {file && <span style={{ ...small, fontSize: 12.5, wordBreak: 'break-all' }}>{file.name}</span>}
              <input ref={input} type="file" accept=".xlsx" onChange={choose} style={{ display: 'none' }} />
            </div>

            {busy === 'checking' && <div style={{ ...small, marginTop: 14 }}>Checking the file…</div>}
            {error && <div role="alert" style={{ color: c.danger, fontSize: 12.5, marginTop: 12 }}>{error}</div>}

            {preview && !preview.ok && preview.problems?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.danger, marginBottom: 6 }}>
                  {preview.problems.length + (preview.moreProblems || 0)} problem{preview.problems.length + (preview.moreProblems || 0) === 1 ? '' : 's'} to fix — nothing was imported
                </div>
                <div style={{ border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, maxHeight: 240, overflowY: 'auto' }}>
                  {preview.problems.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 10px', fontSize: 12.5, borderBottom: i < preview.problems.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                      <span style={{ flexShrink: 0, width: 52, color: c.ash, fontWeight: 700 }}>Row {p.row}</span>
                      <span style={{ flexShrink: 0, width: 110, color: c.ash }}>{p.column}</span>
                      <span style={{ color: c.onyx }}>{p.message}</span>
                    </div>
                  ))}
                </div>
                {preview.moreProblems > 0 && <div style={{ ...small, marginTop: 6 }}>…and {preview.moreProblems} more. Fix these first, then upload again.</div>}
                <div style={{ ...small, marginTop: 8 }}>Fix the file in Excel, then choose it again.</div>
              </div>
            )}

            {preview?.ok && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.success, marginBottom: 8 }}>
                  The file is ready: {counts.phases} phase{counts.phases === 1 ? '' : 's'}, {counts.activities} activit{counts.activities === 1 ? 'y' : 'ies'}, {counts.tasks} task{counts.tasks === 1 ? '' : 's'}
                </div>
                <div style={{ border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, maxHeight: 230, overflowY: 'auto', padding: '8px 12px' }}>
                  {preview.outline.map((p, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c.onyx }}>{p.name} <span style={{ ...small, fontWeight: 400 }}>· {p.weightage}%</span></div>
                      {p.activities.map((a, j) => (
                        <div key={j} style={{ fontSize: 12.5, color: c.onyx, paddingLeft: 14 }}>
                          {a.name} <span style={small}>· {a.weightage}% · {a.tasks} task{a.tasks === 1 ? '' : 's'}{a.owner ? ` · owner ${a.owner}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={onClose} disabled={!!busy} style={{ ...btn, background: c.white, color: c.onyx, border: `1px solid ${c.border}` }}>Cancel</button>
                  <button type="button" onClick={run} disabled={!!busy}
                    style={{ ...btn, background: c.onyx, color: c.white, border: 'none', opacity: busy ? 0.6 : 1 }}>
                    {busy === 'importing' ? 'Importing…' : 'Import to this project'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
