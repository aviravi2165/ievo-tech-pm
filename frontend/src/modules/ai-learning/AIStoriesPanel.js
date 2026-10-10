import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { FileText, X, ExternalLink, Link2, Search, Download } from 'lucide-react';
import { storyApi, STORY_FORM_PATH } from './api/aiStoryApi';
import { copyText } from './copyText';

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const modelLabel = (s) => (s.aiModel === 'Other' ? (s.aiModelOther || 'Other') : s.aiModel);
const errMsg = (err, fallback) => err?.response?.data?.error || fallback;
const STATUS_TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];
const impactsOf = (s) => [s.improvedProductivity && 'Productivity ↑', s.improvedAccuracy && 'Accuracy ↑'].filter(Boolean);

function Chip({ children, theme, tone }) {
  const color = tone || theme.colors.ash;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}1a`, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{children}</span>
  );
}

function StoryModal({ story, isAdmin, onClose, onReview, onDelete }) {
  const theme = useTheme();
  const c = theme.colors;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(errMsg(err, 'Something went wrong.')); } finally { setBusy(false); }
  };
  const download = (f) => act(() => storyApi.download(story.storyId, f));

  const block = (title, body) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: c.ash, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: c.onyx, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
  const files = (kind, label) => {
    const list = story.files.filter(f => f.kind === kind);
    if (!list.length) return null;
    return (
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 11, color: c.ash, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {list.map(f => (
          <button key={f.fileId} type="button" onClick={() => download(f)} title={`Download ${f.originalName}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontSize: 12.5, color: c.espresso, fontFamily: 'inherit' }}>
            <FileText size={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>{f.originalName}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.lg, width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.onyx, wordBreak: 'break-word' }}>{story.title}</div>
            <div style={{ fontSize: 12.5, color: c.ash, marginTop: 3 }}>
              {story.submitterName} · {story.deptName} · {fmtDate(story.createdAt)}
              {isAdmin && <> · {story.submitterEmail}</>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <Chip theme={theme} tone={c.espresso}>{modelLabel(story)}</Chip>
              {impactsOf(story).map(t => <Chip key={t} theme={theme} tone={c.success}>{t}</Chip>)}
              {isAdmin && <Chip theme={theme} tone={story.status === 'approved' ? c.success : story.status === 'rejected' ? c.danger : c.warning}>{story.status}</Chip>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={() => act(() => storyApi.downloadPdf(story))} disabled={busy} title="Download the one-page PDF"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: c.white, color: c.onyx, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Download size={13} /> PDF
            </button>
            <button type="button" onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex' }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          {block('Their AI story', story.description)}
          {(story.dailyActivities || story.deliverables) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {story.dailyActivities && <div style={{ flex: '1 1 240px', minWidth: 0 }}>{block('Daily activities handed to AI', story.dailyActivities)}</div>}
              {story.deliverables && <div style={{ flex: '1 1 240px', minWidth: 0 }}>{block('Deliverables made with AI', story.deliverables)}</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>{block('Input', story.inputDetails)}</div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>{block('Output', story.outputDetails)}</div>
          </div>
          {story.impactDescription && block('Impact', story.impactDescription)}
          {story.files.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              {files('before', 'Before')}
              {files('after', 'After')}
            </div>
          )}
          {isAdmin && story.reviewedByName && (
            <div style={{ fontSize: 12, color: c.ash, marginBottom: 12 }}>
              {story.status === 'approved' ? 'Approved' : 'Rejected'} by {story.reviewedByName}{story.reviewNote ? ` — "${story.reviewNote}"` : ''}
            </div>
          )}
        </div>

        {isAdmin && (
          <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 14, marginTop: 4 }}>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Optional note (kept with the decision)"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '8px 10px', border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, background: c.mid, marginBottom: 10, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" disabled={busy} onClick={() => { if (window.confirm('Delete this story permanently from the list?')) act(() => onDelete(story)); }}
                style={{ marginRight: 'auto', background: 'none', border: 'none', color: c.danger, fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
              {story.status !== 'rejected' && (
                <button type="button" disabled={busy} onClick={() => act(() => onReview(story, 'reject', note))}
                  style={{ background: c.white, color: c.danger, border: `1px solid ${c.danger}66`, borderRadius: theme.radius.sm, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
              )}
              {story.status !== 'approved' && (
                <button type="button" disabled={busy} onClick={() => act(() => onReview(story, 'approve', note))}
                  style={{ background: c.onyx, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
              )}
            </div>
          </div>
        )}
        {error && <div style={{ color: c.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}

/** AI Learning → AI Stories: approved stories for everyone; admins also review. */
export default function AIStoriesPanel() {
  const theme = useTheme();
  const c = theme.colors;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('pending');
  const [deptId, setDeptId] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [copyState, setCopyState] = useState(null); // null | 'copied' | 'failed'

  // Debounce typing into the search box.
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    try {
      const r = await storyApi.list({ status, deptId: deptId || undefined, aiModel: aiModel || undefined, search: query || undefined });
      setData(r); setError('');
    } catch (err) { setError(errMsg(err, 'Failed to load AI stories.')); }
  }, [status, deptId, aiModel, query]);

  useEffect(() => { load(); }, [load]);

  const formUrl = `${window.location.origin}${STORY_FORM_PATH}`;
  const copyLink = async () => {
    const ok = await copyText(formUrl);
    setCopyState(ok ? 'copied' : 'failed');
    if (ok) setTimeout(() => setCopyState(null), 2500);
  };

  const review = async (story, action, note) => {
    await storyApi.review(story.storyId, action, note);
    setOpen(null); await load();
  };
  const remove = async (story) => {
    await storyApi.remove(story.storyId);
    setOpen(null); await load();
  };

  const isAdmin = Boolean(data?.isAdmin);
  const selectStyle = { fontSize: 12.5, padding: '7px 8px', border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, background: c.white, color: c.onyx, fontFamily: 'inherit' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: c.greige }}>
      <div style={{ padding: '16px 20px 32px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontFamily: theme.font.display, fontSize: 16, fontWeight: 800, color: c.onyx }}>AI Stories</div>
            <div style={{ fontSize: 12.5, color: c.ash, marginTop: 2 }}>How colleagues are using AI in their work. Anyone can share Your AI Story — no login needed.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyLink} title={formUrl}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: c.white, color: c.onyx, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <Link2 size={14} /> {copyState === 'copied' ? 'Link copied!' : 'Copy form link'}
            </button>
            <a href={STORY_FORM_PATH} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: c.onyx, color: c.white, borderRadius: theme.radius.sm, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
              <ExternalLink size={14} /> Share Your AI Story
            </a>
          </div>
        </div>

        {copyState === 'failed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: c.ash, marginBottom: 12 }}>
            Your browser blocked copying — select the link and copy it:
            <input readOnly value={formUrl} onFocus={e => e.target.select()} autoFocus
              style={{ flex: '1 1 260px', maxWidth: 420, fontSize: 12.5, padding: '6px 8px', border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, background: c.white, color: c.onyx }} />
            <button type="button" onClick={() => setCopyState(null)} style={{ background: 'none', border: 'none', color: c.ash, cursor: 'pointer', fontSize: 12.5 }}>Close</button>
          </div>
        )}

        {isAdmin && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${c.border}` }}>
            {STATUS_TABS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setStatus(key)}
                style={{ background: 'none', border: 'none', borderBottom: `2px solid ${status === key ? c.onyx : 'transparent'}`, padding: '8px 12px', fontSize: 12.5, fontWeight: status === key ? 800 : 600, color: status === key ? c.onyx : c.ash, cursor: 'pointer' }}>
                {label}{data?.counts ? ` (${data.counts[key]})` : ''}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
            <Search size={14} color={c.ash} style={{ position: 'absolute', left: 9, top: 9 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stories…"
              style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', paddingLeft: 28 }} />
          </div>
          <select value={deptId} onChange={e => setDeptId(e.target.value)} style={selectStyle}>
            <option value="">All departments</option>
            {(data?.departments || []).map(d => <option key={d.deptId} value={d.deptId}>{d.deptName}</option>)}
          </select>
          <select value={aiModel} onChange={e => setAiModel(e.target.value)} style={selectStyle}>
            <option value="">All AI models</option>
            {(data?.aiModels || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {error ? <div style={{ color: c.danger, fontSize: 13 }}>{error}</div>
          : !data ? <div style={{ color: c.ash, fontSize: 13 }}>Loading…</div>
          : data.stories.length === 0 ? (
            <div style={{ textAlign: 'center', color: c.ash, fontSize: 13, padding: '48px 16px', border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, background: c.white }}>
              {isAdmin && status === 'pending' ? 'No stories waiting for review.'
                : (query || deptId || aiModel) ? 'No stories match these filters.'
                : 'No AI stories yet — be the first to share one!'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {data.stories.map(s => (
                <button key={s.storyId} type="button" onClick={() => setOpen(s)}
                  style={{ textAlign: 'left', background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'inherit', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c.onyx, lineHeight: 1.35, wordBreak: 'break-word' }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: c.ash, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{s.description}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                    <Chip theme={theme} tone={c.espresso}>{modelLabel(s)}</Chip>
                    {impactsOf(s).map(t => <Chip key={t} theme={theme} tone={c.success}>{t}</Chip>)}
                    {s.files.length > 0 && <Chip theme={theme}>{s.files.length} file{s.files.length === 1 ? '' : 's'}</Chip>}
                  </div>
                  <div style={{ fontSize: 11.5, color: c.ashLight }}>{s.submitterName} · {s.deptName} · {fmtDate(s.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
      </div>

      {open && <StoryModal story={open} isAdmin={isAdmin} onClose={() => setOpen(null)} onReview={review} onDelete={remove} />}
    </div>
  );
}
