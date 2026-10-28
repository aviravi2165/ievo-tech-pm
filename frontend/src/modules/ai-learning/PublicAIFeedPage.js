import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@emotion/react';
import { Heart, MessageCircle, ExternalLink, FileText, Search, Send } from 'lucide-react';
import { publicFeedApi, publicTechApi } from './api/aiFeedApi';
import { RichView } from './RichTextBox';
import PublicShell, { BRAND, EDGE, loadProfile, saveProfile, forgetProfile } from './PublicShell';

// "AI Feed" — the OPEN feed (no Specula login) of approved AI stories and approved tech posts,
// newest first, Instagram-style. A visitor is only the name + email they type (honour system):
// it lets them like (once per email per post) and comment. Email is never shown to anyone.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPE_TABS = [['', 'All'], ['story', 'AI Stories'], ['tech', 'New Tech']];

const initials = (name = '') => (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function ago(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const errText = (err, fallback) => err?.response?.data?.error || fallback;

function Avatar({ name, size = 38 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', background: BRAND.navy, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700 }}>
      {initials(name)}
    </span>
  );
}

function Pill({ children, tone }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: tone, background: `${tone}1a`, borderRadius: 10, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>;
}

// ── Who is looking: name + email, remembered on this device ─────────────────────────────
function IdentityBar({ identity, onSave, onForget, prompt, barRef }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(identity?.name || '');
  const [email, setEmail] = useState(identity?.email || '');
  const [error, setError] = useState('');
  const open = !identity || editing;
  const input = { flex: '1 1 180px', minWidth: 0, boxSizing: 'border-box', background: '#fff', border: `1px solid ${EDGE}`, borderRadius: theme.radius.sm, padding: '9px 11px', color: BRAND.ink, fontSize: 16, fontFamily: theme.font.body, outline: 'none' };

  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setError(''); setEditing(false);
    onSave({ name: name.trim(), email: email.trim().toLowerCase() });
  };

  return (
    <div ref={barRef} style={{ background: '#fff', border: `1px solid ${prompt && !identity ? BRAND.navy : EDGE}`, boxShadow: prompt && !identity ? `0 0 0 3px ${BRAND.navy}33` : 'none', borderRadius: theme.radius.lg, padding: '12px 14px', marginBottom: 14 }}>
      {open ? (
        <form onSubmit={save} noValidate>
          <div style={{ fontSize: 13, color: BRAND.slate, marginBottom: 8, lineHeight: 1.5 }}>
            {prompt && !identity ? <strong style={{ color: BRAND.ink }}>Enter your name and email to like or comment. </strong> : null}
            Reading is open to everyone. To like or comment, tell us who you are — there is no password, and your email is never shown to anyone.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input aria-label="Your name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="name" style={input} />
            <input aria-label="Your email" type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} maxLength={150} autoComplete="email" style={input} />
            <button type="submit" style={{ background: BRAND.navy, color: '#fff', border: 'none', borderRadius: theme.radius.sm, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            {identity && <button type="button" onClick={() => { setEditing(false); setName(identity.name); setEmail(identity.email); setError(''); }} style={{ background: 'none', border: 'none', color: BRAND.slate, cursor: 'pointer', fontSize: 13 }}>Cancel</button>}
          </div>
          {error && <div role="alert" style={{ color: BRAND.red, fontSize: 12.5, marginTop: 6 }}>{error}</div>}
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: BRAND.ink }}>
          <Avatar name={identity.name} size={28} />
          <span style={{ flex: '1 1 160px', minWidth: 0 }}>Liking and commenting as <strong>{identity.name}</strong></span>
          <button type="button" onClick={() => { setName(identity.name); setEmail(identity.email); setEditing(true); }} style={{ background: 'none', border: 'none', color: BRAND.navy, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Change</button>
          <button type="button" onClick={onForget} style={{ background: 'none', border: 'none', color: BRAND.slate, cursor: 'pointer', fontSize: 13 }}>Forget me</button>
        </div>
      )}
    </div>
  );
}

// ── Comments under a post ────────────────────────────────────────────────────────────────
function Comments({ item, identity, onNeedIdentity, onCount }) {
  const theme = useTheme();
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    publicFeedApi.comments(item.type, item.id)
      .then(r => { if (live) setList(r.comments); })
      .catch(err => { if (live) setLoadError(errText(err, 'Could not load comments.')); });
    return () => { live = false; };
  }, [item.type, item.id]);

  const post = async (e) => {
    e.preventDefault();
    if (!identity) { onNeedIdentity(); return; }
    if (!body.trim()) { setError('Write a comment first.'); return; }
    setBusy(true); setError('');
    try {
      const r = await publicFeedApi.addComment(item.type, item.id, identity, body.trim(), website);
      if (r.comment) { setList(l => [...(l || []), r.comment]); onCount((list?.length || 0) + 1); }
      setBody('');
    } catch (err) {
      setError(errText(err, 'Could not post your comment. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 10, marginTop: 10 }}>
      {loadError ? <div style={{ color: BRAND.red, fontSize: 13 }}>{loadError}</div>
        : !list ? <div style={{ color: BRAND.grey, fontSize: 13 }}>Loading comments…</div>
        : list.length === 0 ? <div style={{ color: BRAND.grey, fontSize: 13, marginBottom: 8 }}>No comments yet — be the first.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            {list.map(c => (
              <div key={c.commentId} style={{ display: 'flex', gap: 8 }}>
                <Avatar name={c.authorName} size={28} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ background: BRAND.mist, borderRadius: 10, padding: '7px 11px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.ink }}>{c.authorName}</div>
                    {/* Plain text only — React escapes it; newlines are kept. */}
                    <div style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: BRAND.grey, margin: '2px 0 0 8px' }}>{ago(c.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      <form onSubmit={post} noValidate>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea aria-label="Write a comment" value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={1}
            placeholder={identity ? `Comment as ${identity.name}…` : 'Add a comment…'}
            onFocus={() => { if (!identity) onNeedIdentity(); }}
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', resize: 'vertical', background: '#fff', border: `1px solid ${EDGE}`, borderRadius: theme.radius.sm, padding: '9px 11px', fontSize: 16, color: BRAND.ink, fontFamily: theme.font.body, outline: 'none' }} />
          <button type="submit" disabled={busy} aria-label="Post comment"
            style={{ background: BRAND.navy, color: '#fff', border: 'none', borderRadius: theme.radius.sm, padding: '10px 14px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700 }}>
            <Send size={14} /> Post
          </button>
        </div>
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} name="website" /></label>
        </div>
        {error && <div role="alert" style={{ color: BRAND.red, fontSize: 12.5, marginTop: 6 }}>{error}</div>}
      </form>
    </div>
  );
}

// ── One post ─────────────────────────────────────────────────────────────────────────────
function FeedCard({ item, identity, onNeedIdentity, onPatch }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likeError, setLikeError] = useState('');
  const isTech = item.type === 'tech';
  const images = item.files.filter(f => f.isImage);
  const docs = item.files.filter(f => !f.isImage);
  const first = item.sections[0];
  const clipped = (first?.html || '').length > 320;          // the first section is long enough to be cut short
  const long = item.sections.length > 1 || clipped;           // there is more to read

  const like = async () => {
    if (!identity) { onNeedIdentity(); return; }
    setLikeError('');
    const before = { likedByMe: item.likedByMe, likeCount: item.likeCount };
    onPatch(item.key, { likedByMe: !before.likedByMe, likeCount: before.likeCount + (before.likedByMe ? -1 : 1) });   // optimistic
    try {
      const r = await publicFeedApi.toggleLike(item.type, item.id, identity);
      onPatch(item.key, { likedByMe: r.liked, likeCount: r.likeCount });
    } catch (err) {
      onPatch(item.key, before);
      setLikeError(errText(err, 'Could not save your like.'));
    }
  };

  const action = (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: on ? BRAND.red : BRAND.slate, fontFamily: 'inherit' });

  return (
    <article style={{ background: '#fff', border: `1px solid ${EDGE}`, borderRadius: theme.radius.lg, padding: 'clamp(12px, 3vw, 18px)', marginBottom: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Avatar name={item.authorName} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: BRAND.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.authorName}</div>
          <div style={{ fontSize: 12, color: BRAND.grey }}>{item.deptName} · {ago(item.createdAt)}</div>
        </div>
        <Pill tone={isTech ? BRAND.green : BRAND.navy}>{isTech ? 'New tech' : 'AI story'}</Pill>
      </header>

      <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.ink, lineHeight: 1.35, margin: '0 0 8px', wordBreak: 'break-word' }}>{item.title}</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <Pill tone={BRAND.slate}>{item.badge}</Pill>
        {item.chips.map(t => <Pill key={t} tone={BRAND.green}>{t}</Pill>)}
      </div>

      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, marginBottom: 10 }}>
          {images.map(f => (
            <a key={f.fileId} href={publicTechApi.fileUrl(item.id, f.fileId)} target="_blank" rel="noopener noreferrer" title={f.originalName}>
              <img src={publicTechApi.fileUrl(item.id, f.fileId)} alt={f.originalName} loading="lazy"
                style={{ width: '100%', maxHeight: images.length === 1 ? 420 : 220, objectFit: images.length === 1 ? 'contain' : 'cover', background: BRAND.mist, borderRadius: 8, border: `1px solid ${BRAND.line}`, display: 'block' }} />
            </a>
          ))}
        </div>
      )}

      {/* Collapsed: the first section, clipped. Expanded: every section with its heading. */}
      {expanded ? item.sections.map(s => (
        <div key={s.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: BRAND.slate, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 3 }}>{s.label}</div>
          <RichView html={s.html} style={{ fontSize: 14.5, color: BRAND.ink, lineHeight: 1.6 }} />
        </div>
      )) : first && (
        <div style={{ position: 'relative', maxHeight: clipped ? 118 : 'none', overflow: 'hidden' }}>
          <RichView html={first.html} style={{ fontSize: 14.5, color: BRAND.ink, lineHeight: 1.6 }} />
          {clipped && <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, background: 'linear-gradient(rgba(255,255,255,0), #fff)' }} />}
        </div>
      )}
      {long && (
        <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
          style={{ background: 'none', border: 'none', padding: '4px 0', color: BRAND.navy, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {(item.linkUrl || docs.length > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {item.linkUrl && (
            <a href={item.linkUrl} target="_blank" rel="noopener noreferrer nofollow"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BRAND.navy, border: `1px solid ${BRAND.navy}`, borderRadius: 8, padding: '5px 10px', textDecoration: 'none', maxWidth: '100%' }}>
              <ExternalLink size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.linkUrl.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
          {docs.map(f => (
            <a key={f.fileId} href={publicTechApi.fileUrl(item.id, f.fileId)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BRAND.slate, border: `1px solid ${EDGE}`, borderRadius: 8, padding: '5px 10px', textDecoration: 'none', maxWidth: '100%' }}>
              <FileText size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</span>
            </a>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, borderTop: `1px solid ${BRAND.line}`, paddingTop: 6 }}>
        <button type="button" onClick={like} aria-pressed={item.likedByMe} aria-label={item.likedByMe ? 'Unlike' : 'Like'} style={action(item.likedByMe)}>
          <Heart size={19} fill={item.likedByMe ? BRAND.red : 'none'} color={item.likedByMe ? BRAND.red : BRAND.slate} />
          <span>{item.likeCount}</span>
        </button>
        <button type="button" onClick={() => setShowComments(v => !v)} aria-expanded={showComments} aria-label="Comments" style={action(false)}>
          <MessageCircle size={19} />
          <span>{item.commentCount}</span>
        </button>
        {likeError && <span role="alert" style={{ color: BRAND.red, fontSize: 12.5, marginLeft: 6 }}>{likeError}</span>}
      </div>

      {showComments && <Comments item={item} identity={identity} onNeedIdentity={onNeedIdentity} onCount={(n) => onPatch(item.key, { commentCount: n })} />}
    </article>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────────────────
export default function PublicAIFeedPage() {
  const theme = useTheme();
  const [identity, setIdentity] = useState(() => {
    const p = loadProfile();
    return p.name && EMAIL_RE.test(p.email || '') ? { name: p.name, email: String(p.email).toLowerCase() } : null;
  });
  const [prompt, setPrompt] = useState(false);
  const barRef = useRef(null);

  const [type, setType] = useState('');
  const [deptId, setDeptId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqId = useRef(0);   // ignore answers of an older request

  useEffect(() => {
    document.title = 'AI Feed · I.EVO';
    publicFeedApi.options().then(o => setDepartments(o.departments || [])).catch(() => { /* the filter just stays empty */ });
  }, []);
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const email = identity?.email;
  const load = useCallback(async (pageNo, replace) => {
    const my = ++reqId.current;
    setLoading(true); setError('');
    try {
      const r = await publicFeedApi.list({ type: type || undefined, deptId: deptId || undefined, q: query || undefined, page: pageNo, email: email || undefined });
      if (my !== reqId.current) return;
      setItems(prev => (replace ? r.items : [...prev, ...r.items.filter(n => !prev.some(p => p.key === n.key))]));
      setHasMore(r.hasMore); setPage(r.page);
    } catch (err) {
      if (my === reqId.current) setError(errText(err, 'Could not load the feed. Please refresh the page.'));
    } finally { if (my === reqId.current) setLoading(false); }
  }, [type, deptId, query, email]);

  useEffect(() => { load(1, true); }, [load]);

  const patchItem = (key, patch) => setItems(list => list.map(i => (i.key === key ? { ...i, ...patch } : i)));
  const needIdentity = () => {
    setPrompt(true);
    barRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    barRef.current?.querySelector('input')?.focus();
  };
  const saveIdentity = (who) => { saveProfile(who); setIdentity(who); setPrompt(false); };
  const forgetIdentity = () => { forgetProfile(); setIdentity(null); setPrompt(false); };

  const filtered = Boolean(type || deptId || query);
  const field = { fontSize: 14, padding: '8px 10px', border: `1px solid ${EDGE}`, borderRadius: theme.radius.sm, background: '#fff', color: BRAND.ink, fontFamily: 'inherit' };

  return (
    <PublicShell active="feed" maxWidth={640}>
      <h1 style={{ fontFamily: theme.font.display, fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 500, lineHeight: 1.2, color: BRAND.ink, margin: '0 0 4px' }}>AI Feed</h1>
      <p style={{ fontSize: 14, color: BRAND.slate, lineHeight: 1.6, margin: '0 0 14px' }}>
        How colleagues use AI, and the new technology worth trying. Read, like and comment — no login needed.
      </p>

      <IdentityBar key={identity ? 'in' : 'out'} identity={identity} onSave={saveIdentity} onForget={forgetIdentity} prompt={prompt} barRef={barRef} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TYPE_TABS.map(([key, label]) => (
          <button key={key || 'all'} type="button" onClick={() => setType(key)} aria-pressed={type === key}
            style={{ background: type === key ? BRAND.ink : '#fff', color: type === key ? '#fff' : BRAND.ink, border: `1px solid ${type === key ? BRAND.ink : EDGE}`, borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={15} color={BRAND.grey} style={{ position: 'absolute', left: 10, top: 11 }} />
          <input aria-label="Search the feed" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the feed…"
            style={{ ...field, width: '100%', boxSizing: 'border-box', paddingLeft: 30, fontSize: 16 }} />
        </div>
        <select aria-label="Department" value={deptId} onChange={e => setDeptId(e.target.value)} style={{ ...field, fontSize: 16, flex: '1 1 180px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.deptId} value={d.deptId}>{d.deptName}</option>)}
        </select>
      </div>

      {error && <div role="alert" style={{ color: BRAND.red, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}

      {items.map(item => <FeedCard key={item.key} item={item} identity={identity} onNeedIdentity={needIdentity} onPatch={patchItem} />)}

      {loading && <div style={{ textAlign: 'center', color: BRAND.grey, fontSize: 13.5, padding: 16 }}>Loading…</div>}

      {!loading && !error && items.length === 0 && (
        <div style={{ textAlign: 'center', color: BRAND.slate, fontSize: 14, lineHeight: 1.7, padding: '40px 16px', border: `1px dashed ${EDGE}`, borderRadius: theme.radius.lg, background: '#fff' }}>
          {filtered ? 'Nothing matches these filters.' : 'Nothing here yet.'}
          <div>
            <Link to="/ai-story" style={{ color: BRAND.navy, fontWeight: 700 }}>Share your AI story</Link>
            {' or '}
            <Link to="/ai-tech" style={{ color: BRAND.navy, fontWeight: 700 }}>suggest a technology</Link>
            {' to get it started.'}
          </div>
        </div>
      )}

      {!loading && hasMore && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <button type="button" onClick={() => load(page + 1, false)}
            style={{ background: '#fff', color: BRAND.navy, border: `1px solid ${BRAND.navy}`, borderRadius: theme.radius.sm, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Load more
          </button>
        </div>
      )}
    </PublicShell>
  );
}
