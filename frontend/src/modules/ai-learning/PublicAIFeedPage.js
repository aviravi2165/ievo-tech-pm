import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@emotion/react';
import { Heart, MessageCircle, ExternalLink, FileText, Search, Send, Home, PenLine, Lightbulb, User } from 'lucide-react';
import { publicFeedApi, publicTechApi, FEED_PATH, FEED_NAME } from './api/aiFeedApi';
import { RichView } from './RichTextBox';
import { PublicNav, BRAND, EDGE, loadProfile, saveProfile, forgetProfile } from './PublicShell';
import ievoLogo from '../../shell/assets/ievo-logo-transparent.png';
import speculaLogoColour from '../../assets/brand/specula-horizontal-colour.svg';

// The open (no Specula login) timeline of approved AI stories and approved tech posts, newest
// first, laid out like a social timeline: navigation on the left, the posts in the middle,
// search and shortcuts on the right (stacked on a phone). A visitor is only the name + email they
// type (honour system): it lets them like (once per email per post) and comment. Email is never shown.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPE_TABS = [['', 'All'], ['story', 'AI Stories'], ['tech', 'New Tech']];
const TAGLINE = "What's happening with AI at I.EVO";

// Layout + hover states (inline styles can't do media queries or :hover).
const PULSE_CSS = `
.pulse-root{background:#fff}
.pulse-wrap{display:grid;grid-template-columns:minmax(0,1fr);max-width:640px;margin:0 auto;padding:0 0 40px}
.pulse-left{display:none}
.pulse-right{order:-1;padding:12px 12px 0}
.pulse-wide{display:none}
.pulse-narrow{display:block}
.pulse-center{background:#fff;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line}}
html{scroll-behavior:smooth}
@keyframes pulse-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.pulse-post{transition:background .15s;animation:pulse-in .25s ease-out both}
@media (prefers-reduced-motion:reduce){.pulse-post,.pulse-skel{animation:none}html{scroll-behavior:auto}}
.pulse-post:hover{background:#FAFBFC}
.pulse-act{display:inline-flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:7px 10px;border-radius:20px;font:inherit;font-size:13.5px;font-weight:600;color:${BRAND.slate}}
.pulse-act:hover{background:${BRAND.navy}14;color:${BRAND.navy}}
.pulse-act.like:hover{background:${BRAND.red}14;color:${BRAND.red}}
.pulse-navlink{display:flex;align-items:center;gap:14px;padding:11px 16px;border-radius:26px;text-decoration:none;font-size:17px;color:${BRAND.ink};transition:background .12s}
.pulse-navlink:hover{background:${BRAND.navy}12}
.pulse-tab{flex:1;background:none;border:none;cursor:pointer;padding:0;font:inherit;font-size:14.5px;color:${BRAND.slate};position:relative}
.pulse-tab:hover{background:${BRAND.navy}0d}
.pulse-tab:focus-visible,.pulse-act:focus-visible{outline:2px solid ${BRAND.navy};outline-offset:-2px}
.pulse-right input:focus,.pulse-right select:focus{outline:none;border-color:${BRAND.navy};box-shadow:0 0 0 3px ${BRAND.navy}22}
@keyframes pulse-skel{0%,100%{opacity:1}50%{opacity:.5}}
.pulse-skel{animation:pulse-skel 1.4s ease-in-out infinite}
@media (min-width:1000px){
  .pulse-root{background:${BRAND.mist}}
  .pulse-wrap{grid-template-columns:240px minmax(0,620px) 300px;gap:0 32px;max-width:1260px;padding:20px 24px 48px;justify-content:center}
  .pulse-left,.pulse-right{display:block;position:sticky;top:20px;align-self:start;padding:0}
  .pulse-left{padding-top:4px}
  .pulse-right{order:0}
  .pulse-wide{display:block}
  .pulse-narrow{display:none}
  .pulse-center{border:1px solid ${BRAND.line};border-radius:16px;box-shadow:0 1px 3px rgba(28,36,48,.06);min-height:70vh}
  .pulse-head{border-radius:16px 16px 0 0}
}
`;

const initials = (name = '') => (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function ago(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const errText = (err, fallback) => err?.response?.data?.error || fallback;

function Avatar({ name, size = 44 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', background: BRAND.navy, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700 }}>
      {initials(name)}
    </span>
  );
}

// ── Who is looking: name + email, remembered on this device ─────────────────────────────
function IdentityBar({ identity, onSave, onForget, onCancel, prompt, barRef }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(identity?.name || '');
  const [email, setEmail] = useState(identity?.email || '');
  const [error, setError] = useState('');
  // Signed out: one quiet line. The form opens when asked for, or when a like/comment needs it.
  const open = identity ? editing : (editing || prompt);
  const input = { flex: '1 1 160px', minWidth: 0, boxSizing: 'border-box', background: '#fff', border: `1px solid ${EDGE}`, borderRadius: 8, padding: '9px 11px', color: BRAND.ink, fontSize: 16, fontFamily: theme.font.body, outline: 'none' };

  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setError(''); setEditing(false);
    onSave({ name: name.trim(), email: email.trim().toLowerCase() });
  };

  return (
    <div ref={barRef} style={{ padding: open ? '14px 20px' : '10px 20px', borderBottom: `1px solid ${BRAND.line}`, background: prompt && !identity ? `${BRAND.navy}0d` : '#fff', transition: 'background .2s' }}>
      {open ? (
        <form onSubmit={save} noValidate>
          <div style={{ fontSize: 14, color: BRAND.slate, marginBottom: 10, lineHeight: 1.5 }}>
            {prompt && !identity ? <strong style={{ color: BRAND.ink }}>Enter your name and email to like or comment.</strong> : <strong style={{ color: BRAND.ink }}>Your name and email</strong>}
            {' '}No password. Your email is never shown to anyone.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input aria-label="Your name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="name" style={input} />
            <input aria-label="Your email" type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} maxLength={150} autoComplete="email" style={input} />
            <button type="submit" style={{ background: BRAND.navy, color: '#fff', border: 'none', borderRadius: 20, padding: '9px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={() => { setEditing(false); setName(identity?.name || ''); setEmail(identity?.email || ''); setError(''); onCancel(); }} style={{ background: 'none', border: 'none', color: BRAND.slate, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
          {error && <div role="alert" style={{ color: BRAND.red, fontSize: 12.5, marginTop: 6 }}>{error}</div>}
        </form>
      ) : identity ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: BRAND.slate }}>
          <Avatar name={identity.name} size={26} />
          <span style={{ flex: '1 1 160px', minWidth: 0 }}>Liking and commenting as <strong style={{ color: BRAND.ink }}>{identity.name}</strong></span>
          <button type="button" onClick={() => { setName(identity.name); setEmail(identity.email); setEditing(true); }} style={{ background: 'none', border: 'none', color: BRAND.navy, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Change</button>
          <button type="button" onClick={onForget} style={{ background: 'none', border: 'none', color: BRAND.slate, cursor: 'pointer', fontSize: 13 }}>Forget me</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: BRAND.slate }}>
          <User size={18} color={BRAND.grey} />
          <span style={{ flex: '1 1 160px', minWidth: 0 }}>Want to like or comment?</span>
          <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: BRAND.navy, cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>Add your name</button>
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
    <div style={{ marginTop: 8 }}>
      {loadError ? <div style={{ color: BRAND.red, fontSize: 13 }}>{loadError}</div>
        : !list ? <div style={{ color: BRAND.grey, fontSize: 13 }}>Loading comments…</div>
        : list.length === 0 ? <div style={{ color: BRAND.grey, fontSize: 13, marginBottom: 8 }}>No comments yet — be the first.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            {list.map(c => (
              <div key={c.commentId} style={{ display: 'flex', gap: 8 }}>
                <Avatar name={c.authorName} size={30} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ background: BRAND.mist, borderRadius: 14, padding: '7px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink }}>{c.authorName} <span style={{ fontWeight: 400, color: BRAND.grey }}>· {ago(c.createdAt)}</span></div>
                    {/* Plain text only — React escapes it; newlines are kept. */}
                    <div style={{ fontSize: 14.5, color: BRAND.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      <form onSubmit={post} noValidate>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea aria-label="Write a comment" value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={1}
            placeholder={identity ? `Reply as ${identity.name}…` : 'Post your reply…'}
            onFocus={() => { if (!identity) onNeedIdentity(); }}
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', resize: 'vertical', background: '#fff', border: `1px solid ${EDGE}`, borderRadius: 12, padding: '9px 12px', fontSize: 16, color: BRAND.ink, fontFamily: theme.font.body, outline: 'none' }} />
          <button type="submit" disabled={busy} aria-label="Post comment"
            style={{ background: BRAND.navy, color: '#fff', border: 'none', borderRadius: 20, padding: '10px 16px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>
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
function FeedPost({ item, identity, onNeedIdentity, onPatch }) {
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

  return (
    <article className="pulse-post" style={{ display: 'flex', gap: 14, padding: '18px 20px', borderBottom: `1px solid ${BRAND.line}` }}>
      <Avatar name={item.authorName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', fontSize: 14.5, lineHeight: 1.3 }}>
          <strong style={{ color: BRAND.ink }}>{item.authorName}</strong>
          <span style={{ color: BRAND.grey, fontSize: 13.5 }}>{item.deptName} · {ago(item.createdAt)}</span>
          <span style={{ marginLeft: 'auto', color: BRAND.grey, fontSize: 11.5, letterSpacing: '.03em' }} title="Reference code">{item.refCode}</span>
        </header>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.ink, lineHeight: 1.35, margin: '8px 0 4px', wordBreak: 'break-word' }}>{item.title}</h2>
        {/* One quiet line instead of a row of pills: what it is, the tool, and the impact. */}
        <div style={{ fontSize: 13, color: BRAND.slate, marginBottom: 10, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: isTech ? BRAND.green : BRAND.navy }}>{isTech ? 'New tech' : 'AI story'}</span>
          {' · '}{item.badge}
          {item.chips.map(t => <span key={t} style={{ color: BRAND.green }}>{' · '}{t}</span>)}
        </div>

        {/* Collapsed: the first section, clipped. Expanded: every section with its heading. */}
        {expanded ? item.sections.map(s => (
          <div key={s.label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: BRAND.slate, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 3 }}>{s.label}</div>
            <RichView html={s.html} style={{ fontSize: 15, color: BRAND.ink, lineHeight: 1.55 }} />
          </div>
        )) : first && (
          <div style={{ position: 'relative', maxHeight: clipped ? 118 : 'none', overflow: 'hidden' }}>
            <RichView html={first.html} style={{ fontSize: 15, color: BRAND.ink, lineHeight: 1.55 }} />
            {clipped && <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, background: 'linear-gradient(rgba(255,255,255,0), #fff)' }} />}
          </div>
        )}
        {long && (
          <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            style={{ background: 'none', border: 'none', padding: '4px 0', color: BRAND.navy, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}

        {images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 2, margin: '10px 0', borderRadius: 16, overflow: 'hidden', border: `1px solid ${BRAND.line}` }}>
            {images.map(f => (
              <a key={f.fileId} href={publicTechApi.fileUrl(item.id, f.fileId)} target="_blank" rel="noopener noreferrer" title={f.originalName} style={{ display: 'block', background: BRAND.mist }}>
                <img src={publicTechApi.fileUrl(item.id, f.fileId)} alt={f.originalName} loading="lazy"
                  style={{ width: '100%', maxHeight: images.length === 1 ? 420 : 220, objectFit: images.length === 1 ? 'contain' : 'cover', display: 'block' }} />
              </a>
            ))}
          </div>
        )}

        {(item.linkUrl || docs.length > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            {item.linkUrl && (
              <a href={item.linkUrl} target="_blank" rel="noopener noreferrer nofollow"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BRAND.navy, border: `1px solid ${EDGE}`, borderRadius: 20, padding: '5px 12px', textDecoration: 'none', maxWidth: '100%' }}>
                <ExternalLink size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.linkUrl.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            {docs.map(f => (
              <a key={f.fileId} href={publicTechApi.fileUrl(item.id, f.fileId)} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BRAND.slate, border: `1px solid ${EDGE}`, borderRadius: 20, padding: '5px 12px', textDecoration: 'none', maxWidth: '100%' }}>
                <FileText size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</span>
              </a>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6, marginLeft: -10 }}>
          <button type="button" className="pulse-act" onClick={() => setShowComments(v => !v)} aria-expanded={showComments} aria-label="Comments">
            <MessageCircle size={18} />
            <span>{item.commentCount}</span>
          </button>
          <button type="button" className="pulse-act like" onClick={like} aria-pressed={item.likedByMe} aria-label={item.likedByMe ? 'Unlike' : 'Like'}
            style={item.likedByMe ? { color: BRAND.red } : undefined}>
            <Heart size={18} fill={item.likedByMe ? BRAND.red : 'none'} color={item.likedByMe ? BRAND.red : 'currentColor'} />
            <span>{item.likeCount}</span>
          </button>
          {likeError && <span role="alert" style={{ color: BRAND.red, fontSize: 12.5 }}>{likeError}</span>}
        </div>

        {showComments && <Comments item={item} identity={identity} onNeedIdentity={onNeedIdentity} onCount={(n) => onPatch(item.key, { commentCount: n })} />}
      </div>
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
    document.title = `${FEED_NAME} · I.EVO`;
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
      if (my === reqId.current) {
        const status = err?.response?.status;
        setError(errText(err, status
          ? `The server had a problem loading ${FEED_NAME} (error ${status}).`
          : `Could not reach the server. Please check your connection.`));
      }
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
  const field = { fontSize: 16, padding: '10px 14px', border: `1px solid ${EDGE}`, borderRadius: 22, background: '#fff', color: BRAND.ink, fontFamily: 'inherit', boxSizing: 'border-box', minWidth: 0 };

  return (
    <div className="pulse-root" style={{ height: '100%', overflowY: 'auto' }}>
      <style>{PULSE_CSS}</style>

      {/* Phone / tablet: logo band + page links on top (the left column takes over on a wide screen). */}
      <div className="pulse-narrow" style={{ maxWidth: 640, margin: '0 auto', padding: '14px 12px 0', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, background: '#fff', border: '1px solid #DDD6CC', borderRadius: theme.radius.lg, padding: '2px 14px' }}>
          <img src={speculaLogoColour} alt="Specula" style={{ height: 50, width: 'auto', display: 'block' }} />
          <img src={ievoLogo} alt="I.EVO" style={{ height: 28, width: 'auto', maxWidth: '40%' }} />
        </div>
        <PublicNav active="feed" />
      </div>

      <div className="pulse-wrap">
        {/* ── Left column: brand and navigation ── */}
        <aside className="pulse-left" aria-label="Navigation">
          <img src={speculaLogoColour} alt="Specula" style={{ height: 56, width: 'auto', display: 'block', margin: '0 0 18px 8px' }} />
          <nav aria-label="AI pages">
            <Link to={FEED_PATH} className="pulse-navlink" aria-current="page" style={{ fontWeight: 800 }}><Home size={24} strokeWidth={2.4} /> {FEED_NAME}</Link>
            <Link to="/ai-story" className="pulse-navlink"><PenLine size={24} /> Share your AI story</Link>
            <Link to="/ai-tech" className="pulse-navlink"><Lightbulb size={24} /> Share a tech</Link>
          </nav>
          <div style={{ margin: '28px 8px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: BRAND.grey }}>
            <img src={ievoLogo} alt="I.EVO" style={{ height: 18, width: 'auto' }} />
            <span>Iraj Evolution Design Company Private Limited</span>
          </div>
        </aside>

        {/* ── Middle: the timeline ── */}
        <main className="pulse-center">
          <div className="pulse-head" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${BRAND.line}` }}>
            <div style={{ padding: '16px 20px 10px' }}>
              <h1 style={{ fontFamily: theme.font.display, fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: BRAND.ink, margin: 0 }}>{FEED_NAME}</h1>
              <div style={{ fontSize: 13, color: BRAND.grey, marginTop: 2 }}>{TAGLINE}</div>
            </div>
            <div style={{ display: 'flex' }}>
              {TYPE_TABS.map(([key, label]) => (
                <button key={key || 'all'} type="button" className="pulse-tab" onClick={() => setType(key)} aria-pressed={type === key}>
                  <span style={{ display: 'inline-block', padding: '13px 4px 11px', fontWeight: type === key ? 800 : 500, color: type === key ? BRAND.ink : BRAND.slate, borderBottom: `4px solid ${type === key ? BRAND.navy : 'transparent'}`, borderRadius: 2 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <IdentityBar key={identity ? 'in' : 'out'} identity={identity} onSave={saveIdentity} onForget={forgetIdentity} onCancel={() => setPrompt(false)} prompt={prompt} barRef={barRef} />

          {items.map(item => <FeedPost key={item.key} item={item} identity={identity} onNeedIdentity={needIdentity} onPatch={patchItem} />)}

          {/* First load: grey placeholder posts, so the page never looks empty or broken while waiting. */}
          {loading && items.length === 0 && [0, 1, 2].map(i => (
            <div key={i} aria-hidden="true" className="pulse-skel" style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: `1px solid ${BRAND.line}` }}>
              <span style={{ width: 44, height: 44, borderRadius: '50%', background: BRAND.mist, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, width: '38%', background: BRAND.mist, borderRadius: 6, marginBottom: 12 }} />
                <div style={{ height: 16, width: '70%', background: BRAND.mist, borderRadius: 6, marginBottom: 10 }} />
                <div style={{ height: 12, width: '95%', background: BRAND.mist, borderRadius: 6, marginBottom: 6 }} />
                <div style={{ height: 12, width: '80%', background: BRAND.mist, borderRadius: 6 }} />
              </div>
            </div>
          ))}
          {loading && items.length > 0 && <div style={{ textAlign: 'center', color: BRAND.grey, fontSize: 13.5, padding: 18 }}>Loading…</div>}

          {error && !loading && (
            <div role="alert" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.ink, marginBottom: 6 }}>Something went wrong</div>
              <div style={{ fontSize: 14.5, color: BRAND.slate, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 16px' }}>{error}</div>
              <button type="button" onClick={() => load(1, true)}
                style={{ background: BRAND.navy, color: '#fff', border: 'none', borderRadius: 22, padding: '10px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div style={{ textAlign: 'center', color: BRAND.slate, fontSize: 15, lineHeight: 1.7, padding: '56px 24px' }}>
              <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: '50%', background: BRAND.mist, color: BRAND.navy, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Lightbulb size={26} /></span>
              <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.ink, marginBottom: 4 }}>{filtered ? 'Nothing matches these filters' : `Be the first on ${FEED_NAME}`}</div>
              {filtered ? (
                <button type="button" onClick={() => { setType(''); setDeptId(''); setSearch(''); }}
                  style={{ background: 'none', border: 'none', color: BRAND.navy, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Clear filters</button>
              ) : (
                'Stories and technology ideas appear here once they have been reviewed.'
              )}
            </div>
          )}

          {!loading && hasMore && (
            <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
              <button type="button" onClick={() => load(page + 1, false)}
                style={{ background: '#fff', color: BRAND.navy, border: `1px solid ${BRAND.navy}`, borderRadius: 22, padding: '10px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Load more
              </button>
            </div>
          )}
        </main>

        {/* ── Right column: search, filter, shortcuts (on a phone it sits above the timeline) ── */}
        <aside className="pulse-right" aria-label="Search and filters">
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={16} color={BRAND.grey} style={{ position: 'absolute', left: 14, top: 13 }} />
            <input aria-label="Search the feed" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${FEED_NAME}`}
              style={{ ...field, width: '100%', paddingLeft: 38 }} />
          </div>
          <select aria-label="Department" value={deptId} onChange={e => setDeptId(e.target.value)} style={{ ...field, width: '100%', marginBottom: 14 }}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.deptId} value={d.deptId}>{d.deptName}</option>)}
          </select>

          <div className="pulse-wide">
            <div style={{ fontSize: 12, color: BRAND.grey, lineHeight: 1.6, padding: '0 6px' }}>
              Specula · CTO Office Projects &amp; Programs<br />
              <a href="/Specula_The_Name.pdf" target="_blank" rel="noopener noreferrer" style={{ color: BRAND.grey }}>About the name Specula</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
