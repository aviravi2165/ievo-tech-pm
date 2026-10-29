import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { FileText, X, ExternalLink, Link2, Search, Trash2 } from 'lucide-react';
import { techApi, feedAdminApi, TECH_FORM_PATH, FEED_PATH, FEED_NAME } from './api/aiFeedApi';
import { RichView, stripHtml } from './RichTextBox';
import { copyText } from './copyText';

// Admin side of "Share a tech" and the AI Feed: review submitted tech posts (only approved ones
// reach the public feed) and remove unwanted feed comments. Both are admin-only.

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const typeLabel = (p) => (p.techType === 'Other' ? (p.techTypeOther || 'Other') : p.techType);
const errMsg = (err, fallback) => err?.response?.data?.error || fallback;
const STATUS_TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];

function Chip({ children, tone }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: tone, background: `${tone}1a`, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{children}</span>;
}

function PostModal({ post, onClose, onReview, onDelete }) {
  const theme = useTheme();
  const c = theme.colors;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(errMsg(err, 'Something went wrong.')); } finally { setBusy(false); }
  };
  const block = (title, body) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: c.ash, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <RichView html={body} style={{ fontSize: 13, color: c.onyx, lineHeight: 1.6 }} />
    </div>
  );
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.lg, width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.onyx, wordBreak: 'break-word' }}>{post.title}</div>
            <div style={{ fontSize: 12.5, color: c.ash, marginTop: 3 }}>{post.submitterName} · {post.deptName} · {fmtDate(post.createdAt)} · {post.submitterEmail} · {post.refCode}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <Chip tone={c.espresso}>{typeLabel(post)}</Chip>
              <Chip tone={post.status === 'approved' ? c.success : post.status === 'rejected' ? c.danger : c.warning}>{post.status}</Chip>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ marginTop: 18 }}>
          {block('What it is', post.summary)}
          {post.linkUrl && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: c.ash, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>Link</div>
              <a href={post.linkUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: 13, color: c.espresso, wordBreak: 'break-all' }}>{post.linkUrl}</a>
            </div>
          )}
          {block('How we could use it', post.useCase)}
          {post.expectedBenefit && block('Expected benefit', post.expectedBenefit)}
          {post.files.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: c.ash, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>Files</div>
              {post.files.map(f => (
                <button key={f.fileId} type="button" onClick={() => act(() => techApi.download(post.postId, f))} title={`Download ${f.originalName}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontSize: 12.5, color: c.espresso, fontFamily: 'inherit' }}>
                  <FileText size={13} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>{f.originalName}</span>
                </button>
              ))}
            </div>
          )}
          {post.reviewedByName && (
            <div style={{ fontSize: 12, color: c.ash, marginBottom: 12 }}>
              {post.status === 'approved' ? 'Approved' : 'Rejected'} by {post.reviewedByName}{post.reviewNote ? ` — "${post.reviewNote}"` : ''}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 14, marginTop: 4 }}>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Optional note (kept with the decision)"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '8px 10px', border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, background: c.mid, marginBottom: 10, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm('Delete this post permanently from the list?')) act(() => onDelete(post)); }}
              style={{ marginRight: 'auto', background: 'none', border: 'none', color: c.danger, fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            {post.status !== 'rejected' && (
              <button type="button" disabled={busy} onClick={() => act(() => onReview(post, 'reject', note))}
                style={{ background: c.white, color: c.danger, border: `1px solid ${c.danger}66`, borderRadius: theme.radius.sm, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
            )}
            {post.status !== 'approved' && (
              <button type="button" disabled={busy} onClick={() => act(() => onReview(post, 'approve', note))}
                style={{ background: c.onyx, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
            )}
          </div>
        </div>
        {error && <div style={{ color: c.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}

/** AI Learning → AI Tech: review the technology suggestions submitted through the open form. */
export default function AITechPanel() {
  const theme = useTheme();
  const c = theme.colors;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('pending');
  const [deptId, setDeptId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState(null);   // which link was copied: 'tech' | 'feed'

  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    try {
      setData(await techApi.list({ status, deptId: deptId || undefined, search: query || undefined })); setError('');
    } catch (err) { setError(errMsg(err, 'Failed to load tech posts.')); }
  }, [status, deptId, query]);
  useEffect(() => { load(); }, [load]);

  const copyLink = async (key, path) => {
    if (await copyText(`${window.location.origin}${path}`)) { setCopied(key); setTimeout(() => setCopied(null), 2500); }
  };
  const review = async (post, action, note) => { await techApi.review(post.postId, action, note); setOpen(null); await load(); };
  const remove = async (post) => { await techApi.remove(post.postId); setOpen(null); await load(); };

  const selectStyle = { fontSize: 12.5, padding: '7px 8px', border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, background: c.white, color: c.onyx, fontFamily: 'inherit' };
  const linkBtn = { display: 'flex', alignItems: 'center', gap: 6, background: c.white, color: c.onyx, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: c.greige }}>
      <div style={{ padding: '16px 20px 32px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontFamily: theme.font.display, fontSize: 16, fontWeight: 800, color: c.onyx }}>AI Tech</div>
            <div style={{ fontSize: 12.5, color: c.ash, marginTop: 2 }}>New technology, AI models and tools suggested by colleagues. Approved posts appear on the public {FEED_NAME} page.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => copyLink('tech', TECH_FORM_PATH)} style={linkBtn}><Link2 size={14} /> {copied === 'tech' ? 'Link copied!' : 'Copy form link'}</button>
            <button type="button" onClick={() => copyLink('feed', FEED_PATH)} style={linkBtn}><Link2 size={14} /> {copied === 'feed' ? 'Link copied!' : `Copy ${FEED_NAME} link`}</button>
            <a href={FEED_PATH} target="_blank" rel="noopener noreferrer"
              style={{ ...linkBtn, background: c.onyx, color: c.white, border: 'none', fontWeight: 700, textDecoration: 'none' }}>
              <ExternalLink size={14} /> Open {FEED_NAME}
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${c.border}` }}>
          {STATUS_TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStatus(key)}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${status === key ? c.onyx : 'transparent'}`, padding: '8px 12px', fontSize: 12.5, fontWeight: status === key ? 800 : 600, color: status === key ? c.onyx : c.ash, cursor: 'pointer' }}>
              {label}{data?.counts ? ` (${data.counts[key]})` : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
            <Search size={14} color={c.ash} style={{ position: 'absolute', left: 9, top: 9 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tech posts or a reference code…"
              style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', paddingLeft: 28 }} />
          </div>
          <select value={deptId} onChange={e => setDeptId(e.target.value)} style={selectStyle}>
            <option value="">All departments</option>
            {(data?.departments || []).map(d => <option key={d.deptId} value={d.deptId}>{d.deptName}</option>)}
          </select>
        </div>

        {error ? <div style={{ color: c.danger, fontSize: 13 }}>{error}</div>
          : !data ? <div style={{ color: c.ash, fontSize: 13 }}>Loading…</div>
          : data.posts.length === 0 ? (
            <div style={{ textAlign: 'center', color: c.ash, fontSize: 13, padding: '48px 16px', border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, background: c.white }}>
              {status === 'pending' && !query && !deptId ? 'No tech posts waiting for review.' : (query || deptId) ? 'No tech posts match these filters.' : 'Nothing here yet.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {data.posts.map(p => (
                <button key={p.postId} type="button" onClick={() => setOpen(p)}
                  style={{ textAlign: 'left', background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'inherit', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c.onyx, lineHeight: 1.35, wordBreak: 'break-word' }}>{p.title}</div>
                  <div style={{ fontSize: 12.5, color: c.ash, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{stripHtml(p.summary)}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                    <Chip tone={c.espresso}>{typeLabel(p)}</Chip>
                    {p.files.length > 0 && <Chip tone={c.ash}>{p.files.length} file{p.files.length === 1 ? '' : 's'}</Chip>}
                  </div>
                  <div style={{ fontSize: 11.5, color: c.ashLight }}>{p.submitterName} · {p.deptName} · {fmtDate(p.createdAt)}</div>
                  <div style={{ fontSize: 11, color: c.ashLight, letterSpacing: '.02em' }}>{p.refCode}</div>
                </button>
              ))}
            </div>
          )}
      </div>
      {open && <PostModal post={open} onClose={() => setOpen(null)} onReview={review} onDelete={remove} />}
    </div>
  );
}

/** AI Learning → Feed comments: newest first; remove anything inappropriate. */
export function FeedCommentsPanel() {
  const theme = useTheme();
  const c = theme.colors;
  const [comments, setComments] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setComments((await feedAdminApi.recentComments()).comments); setError(''); }
    catch (err) { setError(errMsg(err, 'Failed to load comments.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (cm) => {
    if (!window.confirm(`Delete ${cm.authorName}'s comment? It disappears from the feed.`)) return;
    try { await feedAdminApi.removeComment(cm.commentId); await load(); }
    catch (err) { setError(errMsg(err, 'Could not delete the comment.')); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: c.greige }}>
      <div style={{ padding: '16px 20px 32px', maxWidth: 900 }}>
        <div style={{ fontFamily: theme.font.display, fontSize: 16, fontWeight: 800, color: c.onyx }}>Feed comments</div>
        <div style={{ fontSize: 12.5, color: c.ash, margin: '2px 0 14px' }}>The latest 100 comments on the public {FEED_NAME} page. Visitors identify themselves by name and email only, so remove anything inappropriate here.</div>
        {error && <div style={{ color: c.danger, fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {!comments ? (!error && <div style={{ color: c.ash, fontSize: 13 }}>Loading…</div>)
          : comments.length === 0 ? (
            <div style={{ textAlign: 'center', color: c.ash, fontSize: 13, padding: '48px 16px', border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, background: c.white }}>No comments yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comments.map(cm => (
                <div key={cm.commentId} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '10px 12px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: c.ash }}>
                      <strong style={{ color: c.onyx }}>{cm.authorName}</strong> ({cm.authorEmail}) on <em>{cm.itemTitle || '(removed post)'}</em> · {cm.itemType === 'tech' ? 'tech' : 'story'} · {fmtDate(cm.createdAt)}
                    </div>
                    <div style={{ fontSize: 13.5, color: c.onyx, marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{cm.body}</div>
                  </div>
                  <button type="button" onClick={() => remove(cm)} title="Delete comment" aria-label="Delete comment"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.danger, display: 'flex', padding: 4 }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
