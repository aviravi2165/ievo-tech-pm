import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@emotion/react';
import { Paperclip, X, CheckCircle2 } from 'lucide-react';
import { publicTechApi, FEED_PATH, FEED_NAME } from './api/aiFeedApi';
import RichTextBox from './RichTextBox';
import PublicShell, { BRAND, EDGE, loadProfile, saveProfile, forgetProfile } from './PublicShell';

// "Share a tech" — the OPEN form (no Specula login) for suggesting a new technology, AI model
// or tool the company could use, with the use case. Rendered by App.js for /ai-tech before the
// login gate. Posts start 'pending'; an admin approves them before they show in the AI Feed.

const MAX_FILES = 5;
const MAX_FILE_MB = 20;
const ALLOWED_EXT = ['.xlsx', '.xls', '.xlsm', '.csv', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();

export default function PublicAITechPage() {
  const theme = useTheme();
  const saved = loadProfile();
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');

  const [name, setName] = useState(saved.name || '');
  const [email, setEmail] = useState(saved.email || '');
  const [deptId, setDeptId] = useState(saved.deptId ? String(saved.deptId) : '');
  const [remember, setRemember] = useState(true);
  const [title, setTitle] = useState('');
  const [techType, setTechType] = useState('');
  const [techTypeOther, setTechTypeOther] = useState('');
  const [summary, setSummary] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [useCase, setUseCase] = useState('');
  const [expectedBenefit, setExpectedBenefit] = useState('');
  const [files, setFiles] = useState([]);
  const [website, setWebsite] = useState(''); // honeypot — hidden from people

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [refCode, setRefCode] = useState('');   // the reference code of the post just sent

  useEffect(() => {
    document.title = 'Share a tech · I.EVO';
    publicTechApi.options().then(setOptions).catch(() => setOptionsError('Could not load the form. Please refresh the page.'));
  }, []);

  // Attached files can't be restored after a refresh, so warn before one would drop them.
  useEffect(() => {
    if (done || !files.length) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [done, files.length]);

  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const bad = picked.find(f => !ALLOWED_EXT.includes(extOf(f.name)));
    if (bad) { setError(`"${bad.name}" is not allowed. Upload Excel, PDF, Word, PowerPoint, CSV, text or image files.`); return; }
    const big = picked.find(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) { setError(`"${big.name}" is larger than ${MAX_FILE_MB} MB.`); return; }
    setError('');
    setFiles([...files, ...picked].slice(0, MAX_FILES));
  };

  const reset = () => {
    setTitle(''); setTechType(''); setTechTypeOther(''); setSummary(''); setLinkUrl(''); setUseCase(''); setExpectedBenefit('');
    setFiles([]); setError(''); setDone(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const req = [[name, 'your name'], [email, 'your email'], [deptId, 'your department'], [title, 'a title'], [techType, 'what kind of technology this is'],
      [summary, 'what it is'], [useCase, 'how we could use it']];
    const missing = req.find(([v]) => !String(v).trim());
    if (missing) { setError(`Please enter ${missing[1]}.`); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (techType === 'Other' && !techTypeOther.trim()) { setError('Please write what kind of technology this is.'); return; }

    setSubmitting(true); setError('');
    try {
      const sent = await publicTechApi.submit({
        name: name.trim(), email: email.trim(), deptId, title: title.trim(), techType,
        techTypeOther: techType === 'Other' ? techTypeOther.trim() : null,
        summary: summary.trim(), linkUrl: linkUrl.trim() || null, useCase: useCase.trim(),
        expectedBenefit: expectedBenefit.trim() || null, website,
      }, files);
      if (remember) saveProfile({ name: name.trim(), email: email.trim(), deptId: Number(deptId) });
      else forgetProfile();
      setRefCode(sent?.refCode || '');
      setDone(true);
      window.scrollTo?.(0, 0);
    } catch (err) {
      console.error('[AI tech] submit failed', err);
      const status = err?.response?.status;
      setError(
        err?.response?.data?.error
        || (status
          ? `The server could not accept your post (error ${status}). Please try again in a minute.`
          : 'Could not reach the server, so we are not sure your post was received. Please check your connection and refresh the page. If it keeps happening, tell IT.'),
      );
    } finally { setSubmitting(false); }
  };

  // ── styles (same family as the AI story form) ──
  const label = { display: 'block', fontSize: 12, color: BRAND.slate, fontWeight: 500, marginBottom: 5 };
  const input = { width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${EDGE}`, borderRadius: theme.radius.sm, padding: '10px 12px', color: BRAND.ink, fontSize: 16, fontFamily: theme.font.body, outline: 'none' };
  const field = { marginBottom: 16 };
  const focusIn = (e) => { e.target.style.borderColor = BRAND.navy; e.target.style.boxShadow = `0 0 0 3px ${BRAND.navy}22`; };
  const focusOut = (e) => { e.target.style.borderColor = EDGE; e.target.style.boxShadow = 'none'; };
  const rtb = (id, value, onChange, placeholder, minHeight, maxChars) => (
    <RichTextBox id={id} value={value} onChange={onChange} placeholder={placeholder} minHeight={minHeight} maxChars={maxChars}
      borderColor={EDGE} accent={BRAND.navy} background="#fff" radius={parseInt(theme.radius.sm, 10) || 6} textColor={BRAND.ink} />
  );
  const req = <span style={{ color: BRAND.red }}>*</span>;
  const sectionTitle = { fontSize: 16, fontWeight: 600, color: BRAND.ink, margin: '10px 0 12px', paddingBottom: 6, borderBottom: `1px solid ${BRAND.line}` };
  const pill = { background: '#fff', color: BRAND.navy, border: `1px solid ${BRAND.navy}`, borderRadius: theme.radius.sm, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' };

  return (
    <PublicShell active="tech">
      <div style={{ background: '#fff', border: `1px solid ${EDGE}`, borderRadius: theme.radius.lg, padding: 'clamp(16px, 4vw, 24px) clamp(14px, 4vw, 24px) 28px' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <CheckCircle2 size={44} color={BRAND.green} strokeWidth={1.8} />
            <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.ink, margin: '10px 0 6px' }}>Thank you for sharing!</div>
            <div style={{ fontSize: 14, color: BRAND.slate, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 22px' }}>
              Your suggestion was submitted. It will appear on {FEED_NAME} once it has been reviewed.
            </div>
            {refCode && (
              <div style={{ display: 'inline-block', margin: '0 auto 20px', padding: '8px 16px', border: `1px dashed ${EDGE}`, borderRadius: 8, fontSize: 13, color: BRAND.slate }}>
                Your reference <strong style={{ color: BRAND.ink, letterSpacing: '.02em', marginLeft: 6 }}>{refCode}</strong>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={reset} style={{ ...pill, background: BRAND.navy, color: '#fff', border: 'none' }}>Share another</button>
              <Link to={FEED_PATH} style={pill}>Open {FEED_NAME}</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h1 style={{ fontFamily: theme.font.display, fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 500, lineHeight: 1.2, color: BRAND.ink, margin: '0 0 6px' }}>Share a technology we could use</h1>
            <p style={{ fontSize: 14, color: BRAND.slate, lineHeight: 1.6, margin: '0 0 20px' }}>
              Found a new AI model, tool or technology that could help our work? Tell us what it is and where we could use it. No login needed.
            </p>

            {optionsError && <div style={{ color: BRAND.red, fontSize: 13, marginBottom: 12 }}>{optionsError}</div>}

            <div style={sectionTitle}>About you</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ ...field, flex: '1 1 220px' }}>
                <label style={label} htmlFor="t-name">Name {req}</label>
                <input id="t-name" style={input} onFocus={focusIn} onBlur={focusOut} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="name" />
              </div>
              <div style={{ ...field, flex: '1 1 220px' }}>
                <label style={label} htmlFor="t-email">Email {req}</label>
                <input id="t-email" type="email" style={input} onFocus={focusIn} onBlur={focusOut} value={email} onChange={e => setEmail(e.target.value)} maxLength={150} autoComplete="email" />
              </div>
            </div>
            <div style={field}>
              <label style={label} htmlFor="t-dept">Department {req}</label>
              <select id="t-dept" style={input} onFocus={focusIn} onBlur={focusOut} value={deptId} onChange={e => setDeptId(e.target.value)} disabled={!options}>
                <option value="">{options ? 'Select your department…' : 'Loading…'}</option>
                {(options?.departments || []).map(d => <option key={d.deptId} value={d.deptId}>{d.deptName}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: BRAND.ink, marginBottom: 18, cursor: 'pointer' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ margin: 0 }} />
              Remember my name, email and department on this device
            </label>

            <div style={sectionTitle}>The technology</div>
            <div style={field}>
              <label style={label} htmlFor="t-title">Name it {req}</label>
              <input id="t-title" style={input} onFocus={focusIn} onBlur={focusOut} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Claude Code for building internal tools" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ ...field, flex: '1 1 220px' }}>
                <label style={label} htmlFor="t-type">What kind is it? {req}</label>
                <select id="t-type" style={input} onFocus={focusIn} onBlur={focusOut} value={techType} onChange={e => setTechType(e.target.value)} disabled={!options}>
                  <option value="">Select…</option>
                  {(options?.techTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {techType === 'Other' && (
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <label style={label} htmlFor="t-type-other">Which kind? {req}</label>
                  <input id="t-type-other" style={input} onFocus={focusIn} onBlur={focusOut} value={techTypeOther} onChange={e => setTechTypeOther(e.target.value)} maxLength={50} placeholder="e.g. Hardware" />
                </div>
              )}
              <div style={{ ...field, flex: '1 1 260px' }}>
                <label style={label} htmlFor="t-link">Link (optional)</label>
                <input id="t-link" style={input} onFocus={focusIn} onBlur={focusOut} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} maxLength={500} placeholder="https://…" inputMode="url" autoComplete="off" />
              </div>
            </div>
            <div style={field}>
              <label style={label} htmlFor="t-summary">What is it? {req}</label>
              {rtb('t-summary', summary, setSummary, 'In a few lines: what it does and why it is interesting.', 110, 4000)}
            </div>

            <div style={sectionTitle}>Where we could use it</div>
            <div style={field}>
              <label style={label} htmlFor="t-usecase">How could we use it at I.EVO? {req}</label>
              {rtb('t-usecase', useCase, setUseCase, 'A concrete use case: which task or team, and what would change.', 110, 4000)}
            </div>
            <div style={field}>
              <label style={label} htmlFor="t-benefit">Expected benefit (optional)</label>
              {rtb('t-benefit', expectedBenefit, setExpectedBenefit, 'e.g. saves ~2 hours per report, fewer errors', 80, 2000)}
            </div>

            <div style={sectionTitle}>Screenshots or documents (optional)</div>
            <div style={{ fontSize: 12.5, color: BRAND.slate, margin: '-4px 0 12px' }}>
              Excel, PDF, Word, PowerPoint, CSV, text or images — up to {MAX_FILES} files, {MAX_FILE_MB} MB per file. Files are shown in the feed once the post is approved.
            </div>
            <div style={{ marginBottom: 20 }}>
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6, maxWidth: 420 }}>
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, background: '#fff', border: `1px solid ${EDGE}`, borderRadius: theme.radius.sm, padding: '5px 8px', minWidth: 0 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.slate, display: 'flex', padding: 0 }}><X size={14} /></button>
                    </span>
                  ))}
                </div>
              )}
              {files.length < MAX_FILES && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BRAND.ink, border: `1px dashed ${EDGE}`, borderRadius: theme.radius.sm, padding: '8px 12px', cursor: 'pointer', background: '#fff' }}>
                  <Paperclip size={14} /> Attach file
                  <input type="file" multiple accept={ALLOWED_EXT.join(',')} onChange={pickFiles} style={{ display: 'none' }} />
                </label>
              )}
            </div>

            {/* Honeypot — invisible to people, bots tend to fill every field. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
              <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} name="website" /></label>
            </div>

            {error && <div role="alert" style={{ color: BRAND.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button type="submit" disabled={submitting || !options}
              style={{ width: '100%', background: BRAND.navy, color: '#fff', border: 'none', borderRadius: theme.radius.sm, padding: '12px 18px', fontSize: 14.5, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting || !options ? 0.6 : 1 }}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
