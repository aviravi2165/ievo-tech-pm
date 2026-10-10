import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { Paperclip, X, CheckCircle2, PlayCircle } from 'lucide-react';
import ievoLogo from '../../shell/assets/logo.png';
import speculaIcon from '../../shell/assets/specula-icon.png';
import { publicStoryApi } from './api/aiStoryApi';
import { copyText } from './copyText';
import StoryTutorial, { tutorialSeen, markTutorialSeen } from './StoryTutorial';

// "Your AI Story" — the OPEN form (no Specula login). Rendered by
// App.js for /ai-story before the login gate.

const PROFILE_KEY = 'specula_ai_story_profile';
const MAX_FILES = 3;
const MAX_FILE_MB = 20;
const ALLOWED_EXT = ['.xlsx', '.xls', '.xlsm', '.csv', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
const DESCRIPTION_GUIDE = 'What were you working on?\nHow did AI help you with it?\nWhat changed for you?';
const IMPACT_GUIDE = 'e.g. Deliverable preparation time reduced by 20% or 50%';

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || {}; } catch { return {}; }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* storage blocked — just don't remember */ }
}
function forgetProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
}
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();

export default function PublicAIStoryPage() {
  const theme = useTheme();
  const saved = loadProfile();
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');

  const [name, setName] = useState(saved.name || '');
  const [email, setEmail] = useState(saved.email || '');
  const [deptId, setDeptId] = useState(saved.deptId ? String(saved.deptId) : '');
  const [remember, setRemember] = useState(true);
  const [title, setTitle] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModelOther, setAiModelOther] = useState('');
  const [description, setDescription] = useState('');
  const [inputDetails, setInputDetails] = useState('');
  const [outputDetails, setOutputDetails] = useState('');
  const [dailyActivities, setDailyActivities] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [improvedProductivity, setImprovedProductivity] = useState(false);
  const [improvedAccuracy, setImprovedAccuracy] = useState(false);
  const [impactDescription, setImpactDescription] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [beforeFiles, setBeforeFiles] = useState([]);
  const [afterFiles, setAfterFiles] = useState([]);
  const [website, setWebsite] = useState(''); // honeypot — hidden from people

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // First visit on this device → open the guide once automatically.
  const [showTutorial, setShowTutorial] = useState(() => !tutorialSeen());
  const closeTutorial = () => { setShowTutorial(false); markTutorialSeen(); };
  const [copyState, setCopyState] = useState(null); // null | 'copied' | 'failed'
  const formUrl = `${window.location.origin}${window.location.pathname}`;

  useEffect(() => {
    document.title = 'Your AI Story · I.EVO';
    publicStoryApi.options().then(setOptions).catch(() => setOptionsError('Could not load the form. Please refresh the page.'));
  }, []);

  const pickFiles = (setter, current) => (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const bad = picked.find(f => !ALLOWED_EXT.includes(extOf(f.name)));
    if (bad) { setError(`"${bad.name}" is not allowed. Upload Excel, PDF, Word, PowerPoint, CSV, text or image files.`); return; }
    const big = picked.find(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) { setError(`"${big.name}" is larger than ${MAX_FILE_MB} MB.`); return; }
    setError('');
    setter([...current, ...picked].slice(0, MAX_FILES));
  };

  const copyLink = async () => {
    const ok = await copyText(formUrl);
    setCopyState(ok ? 'copied' : 'failed');
    if (ok) setTimeout(() => setCopyState(null), 2500);
  };

  const resetStory = () => {
    setTitle(''); setAiModel(''); setAiModelOther(''); setDescription(''); setInputDetails(''); setOutputDetails('');
    setDailyActivities(''); setDeliverables(''); setImprovedProductivity(false); setImprovedAccuracy(false); setImpactDescription('');
    setBeforeFiles([]); setAfterFiles([]); setError(''); setDone(false); setCopyState(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const req = [[name, 'your name'], [email, 'your email'], [deptId, 'your department'], [title, 'a title'], [aiModel, 'the AI model'],
      [description, 'a description'], [inputDetails, 'the input details'], [outputDetails, 'the output details']];
    const missing = req.find(([v]) => !String(v).trim());
    if (missing) { setError(`Please enter ${missing[1]}.`); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (aiModel === 'Other' && !aiModelOther.trim()) { setError('Please write which AI model you used.'); return; }

    setSubmitting(true); setError('');
    try {
      await publicStoryApi.submit({
        name: name.trim(), email: email.trim(), deptId, title: title.trim(), aiModel,
        aiModelOther: aiModel === 'Other' ? aiModelOther.trim() : null,
        description: description.trim(), inputDetails: inputDetails.trim(), outputDetails: outputDetails.trim(),
        dailyActivities: dailyActivities.trim() || null, deliverables: deliverables.trim() || null,
        improvedProductivity: improvedProductivity ? 'true' : 'false', improvedAccuracy: improvedAccuracy ? 'true' : 'false',
        impactDescription: impactDescription.trim() || null, website,
      }, beforeFiles, afterFiles);
      setSubmittedEmail(email.trim());
      if (remember) saveProfile({ name: name.trim(), email: email.trim(), deptId: Number(deptId) });
      else forgetProfile();
      setDone(true);
      window.scrollTo?.(0, 0);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not submit your story. Please try again.');
    } finally { setSubmitting(false); }
  };

  // ── styles ──
  const c = theme.colors;
  const label = { display: 'block', fontSize: 11, color: c.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 5 };
  const input = { width: '100%', boxSizing: 'border-box', background: c.mid, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '10px 12px', color: c.onyx, fontSize: 16, fontFamily: 'inherit', outline: 'none' };
  const checkRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: c.onyx, cursor: 'pointer', padding: '6px 0' };
  const field = { marginBottom: 16 };
  const req = <span style={{ color: c.espresso }}>*</span>;
  const sectionTitle = { fontSize: 13, fontWeight: 800, color: c.onyx, margin: '8px 0 12px', paddingBottom: 6, borderBottom: `1px solid ${c.border}` };

  const fileBox = (labelText, hint, files, setter) => (
    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
      <div style={label}>{labelText}</div>
      <div style={{ fontSize: 12, color: c.ash, marginBottom: 6 }}>{hint}</div>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, background: c.mid, border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, padding: '5px 8px', minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setter(files.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex', padding: 0 }}><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      {files.length < MAX_FILES && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: c.onyx, border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, padding: '8px 12px', cursor: 'pointer', background: c.white }}>
          <Paperclip size={14} /> Attach file
          <input type="file" multiple accept={ALLOWED_EXT.join(',')} onChange={pickFiles(setter, files)} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: c.greige }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
          {/* Specula (the product) on the left, I.EVO (the company) on the right. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <img src={speculaIcon} alt="" style={{ width: 34, height: 34, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: theme.font.display, fontSize: 20, fontWeight: 800, letterSpacing: '0.08em', color: c.onyx, lineHeight: 1.1 }}>SPECULA</div>
              <div style={{ fontSize: 12, color: c.ash }}>Your AI Story</div>
            </div>
          </div>
          <img src={ievoLogo} alt="I.EVO" style={{ height: 26, width: 'auto', maxWidth: '40%', flexShrink: 1 }} />
        </div>

        <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: theme.radius.lg, padding: 'clamp(16px, 4vw, 24px) clamp(14px, 4vw, 24px) 28px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <CheckCircle2 size={44} color={c.success} strokeWidth={1.8} />
              <div style={{ fontSize: 20, fontWeight: 800, color: c.onyx, margin: '10px 0 6px' }}>Thank you for sharing!</div>
              <div style={{ fontSize: 14, color: c.ash, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 22px' }}>
                Your AI story was submitted. A confirmation email is on its way{submittedEmail ? <> to <strong>{submittedEmail}</strong></> : ''} — if you don't see it, check your Spam folder. It will appear in Specula's AI Stories once it has been reviewed.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={resetStory}
                  style={{ background: c.onyx, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  Share another story
                </button>
                <button type="button" onClick={copyLink}
                  style={{ background: c.white, color: copyState === 'copied' ? c.success : c.onyx, border: `1px solid ${copyState === 'copied' ? c.success : c.border}`, borderRadius: theme.radius.sm, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  {copyState === 'copied' ? 'Link copied!' : 'Copy link to share with colleagues'}
                </button>
              </div>
              {copyState === 'failed' && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: c.ash }}>
                  Your browser blocked copying — select the link below and copy it:
                  <input readOnly value={formUrl} onFocus={e => e.target.select()} autoFocus
                    style={{ display: 'block', width: '100%', maxWidth: 420, margin: '6px auto 0', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: `1px solid ${c.border}`, borderRadius: theme.radius.sm, background: c.mid, color: c.onyx, textAlign: 'center' }} />
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 800, color: c.onyx, margin: 0 }}>Your AI Story</h1>
                <button type="button" onClick={() => setShowTutorial(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c.white, color: c.onyx, border: `1px solid ${c.border}`, borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <PlayCircle size={16} /> How it works · Demo
                </button>
              </div>
              <p style={{ fontSize: 14, color: c.ash, lineHeight: 1.6, margin: '0 0 20px' }}>
                Used AI to get something done faster or better? Tell us your story — big or small, it helps colleagues learn. No login needed.
              </p>

              {optionsError && <div style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>{optionsError}</div>}

              <div style={sectionTitle}>About you</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <label style={label} htmlFor="s-name">Name {req}</label>
                  <input id="s-name" style={input} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="name" />
                </div>
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <label style={label} htmlFor="s-email">Email {req}</label>
                  <input id="s-email" type="email" style={input} value={email} onChange={e => setEmail(e.target.value)} maxLength={150} autoComplete="email" />
                </div>
              </div>
              <div style={field}>
                <label style={label} htmlFor="s-dept">Department {req}</label>
                <select id="s-dept" style={input} value={deptId} onChange={e => setDeptId(e.target.value)} disabled={!options}>
                  <option value="">{options ? 'Select your department…' : 'Loading…'}</option>
                  {(options?.departments || []).map(d => <option key={d.deptId} value={d.deptId}>{d.deptName}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.onyx, marginBottom: 18, cursor: 'pointer' }}>
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ margin: 0 }} />
                Remember my name, email and department on this device
              </label>

              <div style={sectionTitle}>Your story</div>
              <div style={field}>
                <label style={label} htmlFor="s-title">Give your story a title {req}</label>
                <input id="s-title" style={input} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Monthly P&L variance summary in 10 minutes" />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <label style={label} htmlFor="s-model">AI model used {req}</label>
                  <select id="s-model" style={input} value={aiModel} onChange={e => setAiModel(e.target.value)} disabled={!options}>
                    <option value="">Select…</option>
                    {(options?.aiModels || []).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {aiModel === 'Other' && (
                  <div style={{ ...field, flex: '1 1 220px' }}>
                    <label style={label} htmlFor="s-model-other">Which AI model? {req}</label>
                    <input id="s-model-other" style={input} value={aiModelOther} onChange={e => setAiModelOther(e.target.value)} maxLength={50} placeholder="e.g. DeepSeek" />
                  </div>
                )}
              </div>
              <div style={field}>
                <label style={label} htmlFor="s-desc">Tell us your AI story {req}</label>
                <textarea id="s-desc" style={{ ...input, resize: 'vertical' }} rows={5} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} placeholder={DESCRIPTION_GUIDE} />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-input">Input — what you gave the AI {req}</label>
                  <textarea id="s-input" style={{ ...input, resize: 'vertical' }} rows={4} value={inputDetails} onChange={e => setInputDetails(e.target.value)} maxLength={4000} placeholder="The data, file or prompt you used" />
                </div>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-output">Output — what you got back {req}</label>
                  <textarea id="s-output" style={{ ...input, resize: 'vertical' }} rows={4} value={outputDetails} onChange={e => setOutputDetails(e.target.value)} maxLength={4000} placeholder="The result and how you used it" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-activities">Daily activities handed to AI (optional)</label>
                  <textarea id="s-activities" style={{ ...input, resize: 'vertical' }} rows={3} value={dailyActivities} onChange={e => setDailyActivities(e.target.value)} maxLength={2000} placeholder="e.g. Drafting emails, comparing quotations, formatting reports" />
                </div>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-deliverables">Deliverables made with AI (optional)</label>
                  <textarea id="s-deliverables" style={{ ...input, resize: 'vertical' }} rows={3} value={deliverables} onChange={e => setDeliverables(e.target.value)} maxLength={2000} placeholder="e.g. BOQ summary, P&L variance note, site report" />
                </div>
              </div>

              <div style={sectionTitle}>Impact (optional)</div>
              {/* Checkboxes, not radios — productivity and accuracy can both improve. */}
              <div style={{ display: 'flex', gap: '4px 24px', flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={checkRow}>
                  <input type="checkbox" checked={improvedProductivity} onChange={e => setImprovedProductivity(e.target.checked)} style={{ margin: 0, width: 17, height: 17 }} />
                  Productivity improved
                </label>
                <label style={checkRow}>
                  <input type="checkbox" checked={improvedAccuracy} onChange={e => setImprovedAccuracy(e.target.checked)} style={{ margin: 0, width: 17, height: 17 }} />
                  Accuracy improved
                </label>
              </div>
              <div style={field}>
                <label style={label} htmlFor="s-impact">Describe the impact</label>
                <textarea id="s-impact" style={{ ...input, resize: 'vertical' }} rows={2} value={impactDescription} onChange={e => setImpactDescription(e.target.value)} maxLength={1000} placeholder={IMPACT_GUIDE} />
              </div>

              <div style={sectionTitle}>Before &amp; after (optional)</div>
              <div style={{ fontSize: 12.5, color: c.ash, margin: '-4px 0 12px' }}>
                Excel, PDF, Word, PowerPoint, CSV, text or images — up to {MAX_FILES} files each, {MAX_FILE_MB} MB per file.
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                {fileBox('Before', 'What it looked like without AI', beforeFiles, setBeforeFiles)}
                {fileBox('After', 'The AI-assisted result', afterFiles, setAfterFiles)}
              </div>

              {/* Honeypot — invisible to people, bots tend to fill every field. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} name="website" /></label>
              </div>

              {error && <div role="alert" style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <button type="submit" disabled={submitting || !options}
                style={{ width: '100%', background: c.onyx, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '12px 18px', fontSize: 14.5, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting || !options ? 0.6 : 1 }}>
                {submitting ? 'Submitting…' : 'Submit Your AI Story'}
              </button>
            </form>
          )}
        </div>
      </div>
      {showTutorial && <StoryTutorial onClose={closeTutorial} />}
    </div>
  );
}
