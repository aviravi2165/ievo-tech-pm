import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@emotion/react';
import { Paperclip, X, CheckCircle2, PlayCircle, FolderOpen, Plus, Save } from 'lucide-react';
// Transparent copy of the I.EVO wordmark — the original logo.png has a solid
// white background that showed as a white box on this page.
import ievoLogo from '../../shell/assets/ievo-logo-transparent.png';
// Official Specula logo, "colour" version (navy + red) for light backgrounds — from the
// Specula Logo Kit. The file already includes the required clear space.
import speculaLogoColour from '../../assets/brand/specula-horizontal-colour.svg';
import { publicStoryApi } from './api/aiStoryApi';
import { copyText } from './copyText';
import RichTextBox from './RichTextBox';
import { saveDraftEntry, listDrafts, getDraft, deleteDraft, hasContent, draftTitle, DRAFTS_KEY } from './storyDraft';
import StoryDraftsPanel from './StoryDraftsPanel';
import StoryTutorial, { tutorialSeen, markTutorialSeen } from './StoryTutorial';
import { modelsFor } from './aiModelCatalog';
import { PublicNav } from './PublicShell';
import MultiSelect from './MultiSelect';

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
  // Drafts saved on this device (text only — files can't be kept). The most recent one is
  // opened; the "Drafts" button lists them all so several stories can be worked on.
  const [initialDrafts] = useState(() => listDrafts());
  const draft0 = initialDrafts[0] || null;
  const d0 = draft0?.values || {};
  const activeIdRef = useRef(draft0?.id || null);   // the draft the form is currently writing into
  const [activeId, setActiveIdState] = useState(draft0?.id || null);
  const setActive = (id) => { activeIdRef.current = id; setActiveIdState(id); };
  const [drafts, setDrafts] = useState(initialDrafts);
  const [showDrafts, setShowDrafts] = useState(false);
  const [saveState, setSaveState] = useState(null);   // null | 'saved' | 'empty' | 'failed' — feedback on the Save draft button
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');

  const [name, setName] = useState(d0.name || saved.name || '');
  const [email, setEmail] = useState(d0.email || saved.email || '');
  const [deptId, setDeptId] = useState(d0.deptId ? String(d0.deptId) : (saved.deptId ? String(saved.deptId) : ''));
  const [remember, setRemember] = useState(true);
  const [title, setTitle] = useState(d0.title || '');
  const [aiModel, setAiModel] = useState(d0.aiModel || '');
  const [aiModelOther, setAiModelOther] = useState(d0.aiModelOther || '');
  // Specific model + version within the chosen provider (e.g. Claude →
  // "Opus 5.5") — options come from the LOCAL aiModelCatalog.js, so this is
  // required only for providers that have a catalog entry.
  const [aiModelVersion, setAiModelVersion] = useState(d0.aiModelVersion || '');
  // "I use multiple AI tools": several tools can be ticked and no version is asked for.
  const [multiTools, setMultiTools] = useState(Boolean(d0.multiTools));
  const [switchFocus, setSwitchFocus] = useState(false);   // keyboard focus ring for the switch
  const [aiModels, setAiModels] = useState(Array.isArray(d0.aiModels) ? d0.aiModels : []);
  const [description, setDescription] = useState(d0.description || '');
  const [inputDetails, setInputDetails] = useState(d0.inputDetails || '');
  const [outputDetails, setOutputDetails] = useState(d0.outputDetails || '');
  const [dailyActivities, setDailyActivities] = useState(d0.dailyActivities || '');
  const [deliverables, setDeliverables] = useState(d0.deliverables || '');
  const [improvedProductivity, setImprovedProductivity] = useState(Boolean(d0.improvedProductivity));
  const [improvedAccuracy, setImprovedAccuracy] = useState(Boolean(d0.improvedAccuracy));
  const [customerAppreciation, setCustomerAppreciation] = useState(Boolean(d0.customerAppreciation));
  const [impactDescription, setImpactDescription] = useState(d0.impactDescription || '');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [submittedRef, setSubmittedRef] = useState('');   // the reference code of the story just sent
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
  const [savedAt, setSavedAt] = useState(draft0?.savedAt || null);   // when the active draft was last written
  const [restored, setRestored] = useState(Boolean(draft0));          // show the "we opened your latest draft" note
  const formUrl = `${window.location.origin}${window.location.pathname}`;

  const currentValues = () => ({
    name, email, deptId, title, aiModel, aiModelOther, aiModelVersion, multiTools, aiModels, description, inputDetails, outputDetails,
    dailyActivities, deliverables, improvedProductivity, improvedAccuracy, customerAppreciation, impactDescription,
  });
  const refreshDrafts = () => setDrafts(listDrafts());

  // Write the form into its draft (creating the draft the first time there is something to
  // keep). Returns { id, savedAt } or null when nothing was written.
  const persist = () => {
    const r = saveDraftEntry(activeIdRef.current, currentValues());
    if (r) { setActive(r.id); setSavedAt(r.savedAt); }
    else if (!hasContent(currentValues())) { setActive(null); setSavedAt(null); }
    refreshDrafts();
    return r;
  };

  // Autosave: shortly after the last keystroke, write the story into its draft. Stops once
  // the story is submitted.
  useEffect(() => {
    if (done) return undefined;
    const t = setTimeout(persist, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, name, email, deptId, title, aiModel, aiModelOther, aiModelVersion, multiTools, aiModels, description, inputDetails, outputDetails,
    dailyActivities, deliverables, improvedProductivity, improvedAccuracy, customerAppreciation, impactDescription]);

  // Another tab on this device changed the drafts → keep the count bubble honest.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === DRAFTS_KEY || e.key === null) refreshDrafts(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Attached files can't be autosaved, so warn before a refresh/close would drop them.
  useEffect(() => {
    if (done || (!beforeFiles.length && !afterFiles.length)) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [done, beforeFiles.length, afterFiles.length]);

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
    setTitle(''); setAiModel(''); setAiModelOther(''); setAiModelVersion(''); setMultiTools(false); setAiModels([]); setDescription(''); setInputDetails(''); setOutputDetails('');
    setDailyActivities(''); setDeliverables(''); setImprovedProductivity(false); setImprovedAccuracy(false); setCustomerAppreciation(false); setImpactDescription('');
    setBeforeFiles([]); setAfterFiles([]); setError(''); setDone(false); setCopyState(null);
  };

  const saveNow = () => {
    if (!hasContent(currentValues())) { setSaveState('empty'); setTimeout(() => setSaveState(null), 2500); return; }
    const r = persist();
    setSaveState(r ? 'saved' : 'failed');
    if (r) setTimeout(() => setSaveState(null), 2500);
  };

  const otherChosen = multiTools ? aiModels.includes('Other') : aiModel === 'Other';
  // Ticking/unticking "I use multiple AI tools". Ticking carries a single choice over into the
  // list; unticking starts the single dropdown (and its version) fresh, so a version picked for
  // one model can never be sent along with another.
  const toggleMulti = (on) => {
    setMultiTools(on);
    setAiModels(on && aiModel ? [aiModel] : []);
    setAiModel(''); setAiModelVersion('');
    if (!on) setAiModelOther('');
  };

  const filesAttached = beforeFiles.length + afterFiles.length > 0;
  // Attached files can't live in a draft, so confirm before moving away from a form that has some.
  const okToLeaveFiles = () => !filesAttached || window.confirm('The files you attached are not saved in drafts and will be removed. Continue?');

  const startNewStory = () => {
    if (!okToLeaveFiles()) return;
    persist();                 // the story being left stays in the drafts
    resetStory();
    setActive(null); setSavedAt(null); setRestored(false); setShowDrafts(false);
    refreshDrafts();
    window.scrollTo?.(0, 0);
  };

  const applyValues = (v) => {
    setName(v.name || saved.name || ''); setEmail(v.email || saved.email || '');
    setDeptId(v.deptId ? String(v.deptId) : (saved.deptId ? String(saved.deptId) : ''));
    setTitle(v.title || ''); setAiModel(v.aiModel || ''); setAiModelOther(v.aiModelOther || ''); setAiModelVersion(v.aiModelVersion || '');
    setMultiTools(Boolean(v.multiTools)); setAiModels(Array.isArray(v.aiModels) ? v.aiModels : []);
    setDescription(v.description || ''); setInputDetails(v.inputDetails || ''); setOutputDetails(v.outputDetails || '');
    setDailyActivities(v.dailyActivities || ''); setDeliverables(v.deliverables || '');
    setImprovedProductivity(Boolean(v.improvedProductivity)); setImprovedAccuracy(Boolean(v.improvedAccuracy)); setCustomerAppreciation(Boolean(v.customerAppreciation));
    setImpactDescription(v.impactDescription || '');
    setBeforeFiles([]); setAfterFiles([]); setError(''); setDone(false);
  };

  const openDraft = (id) => {
    if (id === activeIdRef.current) { setShowDrafts(false); return; }
    const target = getDraft(id);
    if (!target) { refreshDrafts(); return; }
    if (!okToLeaveFiles()) return;
    persist();                 // keep what was being worked on
    applyValues(target.values);
    setActive(id); setSavedAt(target.savedAt); setRestored(false); setShowDrafts(false);
    refreshDrafts();
    window.scrollTo?.(0, 0);
  };

  const removeDraft = (id) => {
    const target = drafts.find(d => d.id === id);
    if (!window.confirm(`Delete the draft "${draftTitle(target?.values)}"? This cannot be undone.`)) return;
    deleteDraft(id);
    if (id === activeIdRef.current) { resetStory(); setActive(null); setSavedAt(null); setRestored(false); }
    refreshDrafts();
  };

  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtWhen = (t) => new Date(t).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const submit = async (e) => {
    e.preventDefault();
    const req = [[name, 'your name'], [email, 'your email'], [deptId, 'your department'], [title, 'a title'],
      [description, 'a description'], [inputDetails, 'the input details'], [outputDetails, 'the output details']];
    // One tool: the model (and its version when it has a list). Several tools: at least two, no version.
    if (!multiTools) {
      req.splice(4, 0, [aiModel, 'the AI model']);
      if (modelsFor(aiModel)) req.push([aiModelVersion, 'the model & version']);
    }
    const missing = req.find(([v]) => !String(v).trim());
    if (missing) { setError(`Please enter ${missing[1]}.`); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (multiTools && aiModels.length < 2) { setError('Please choose at least two AI tools, or untick "I use multiple AI tools".'); return; }
    if (otherChosen && !aiModelOther.trim()) { setError('Please write which AI model you used.'); return; }

    setSubmitting(true); setError('');
    try {
      const sent = await publicStoryApi.submit({
        name: name.trim(), email: email.trim(), deptId, title: title.trim(),
        // One tool → aiModel; several → multiTools + the list (never a version, even if one was picked earlier).
        aiModel: multiTools ? null : aiModel,
        multiTools: multiTools ? 'true' : 'false',
        aiModels: multiTools ? JSON.stringify(aiModels) : null,
        aiModelOther: otherChosen ? aiModelOther.trim() : null,
        // Sent for forward-compat — the backend currently whitelists its
        // fields on submit, so this is ignored server-side until it learns
        // to store it (that change comes after this UI is tested).
        aiModelVersion: !multiTools && modelsFor(aiModel) ? aiModelVersion.trim() : null,
        description: description.trim(), inputDetails: inputDetails.trim(), outputDetails: outputDetails.trim(),
        dailyActivities: dailyActivities.trim() || null, deliverables: deliverables.trim() || null,
        improvedProductivity: improvedProductivity ? 'true' : 'false', improvedAccuracy: improvedAccuracy ? 'true' : 'false',
        // Sent for forward-compat like aiModelVersion — ignored server-side
        // until the backend learns to store it (column not added yet).
        customerAppreciation: customerAppreciation ? 'true' : 'false',
        impactDescription: impactDescription.trim() || null, website,
      }, beforeFiles, afterFiles);
      if (activeIdRef.current) deleteDraft(activeIdRef.current);
      setActive(null);
      setSavedAt(null);
      refreshDrafts();
      setSubmittedEmail(email.trim());
      setSubmittedRef(sent?.refCode || '');
      if (remember) saveProfile({ name: name.trim(), email: email.trim(), deptId: Number(deptId) });
      else forgetProfile();
      setDone(true);
      window.scrollTo?.(0, 0);
    } catch (err) {
      console.error('[AI story] submit failed', err);
      const status = err?.response?.status;
      setError(
        err?.response?.data?.error
        || (status
          ? `The server could not accept your story (error ${status}). Please try again in a minute.`
          : 'Could not reach the server, so we are not sure your story was received. Please check your connection and refresh the page. If it keeps happening, tell IT.'),
      );
    } finally { setSubmitting(false); }
  };

  // ── styles ──
  // Brand Identity Guide v1.0 colours. Navy carries the brand; Beacon Red only for
  // required marks and errors; neutrals for text, borders and the page tint.
  const BRAND = { navy: '#334456', red: '#D8320C', ink: '#1C2430', slate: '#4A5462', grey: '#8A939F', line: '#E2E6EB', mist: '#F4F6F8', green: '#2F7D5B' };
  const c = {
    ...theme.colors,
    onyx: BRAND.ink, ash: BRAND.slate, ashLight: BRAND.grey, greige: BRAND.mist, white: '#FFFFFF', mid: '#FFFFFF',
    espresso: BRAND.navy, success: BRAND.green, danger: BRAND.red, border: BRAND.line,
  };
  // Field/card outline: the guide's Line (#E2E6EB) is too faint against white (the CTO asked for
  // visible borders), so use one step darker in the same cool-grey family.
  const edge = '#C5CCD4';
  const label = { display: 'block', fontSize: 12, color: c.ash, fontWeight: 500, marginBottom: 5 };
  const input = { width: '100%', boxSizing: 'border-box', background: c.mid, border: `1px solid ${edge}`, borderRadius: theme.radius.sm, padding: '10px 12px', color: c.onyx, fontSize: 16 /* 16px keeps iPhones from zooming into fields; guide body is 15px */, fontFamily: theme.font.body, outline: 'none' };
  const checkRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: c.onyx, cursor: 'pointer', padding: '6px 0' };
  const field = { marginBottom: 16 };
  const focusIn = (e) => { e.target.style.borderColor = c.espresso; e.target.style.boxShadow = `0 0 0 3px ${c.espresso}22`; };
  const focusOut = (e) => { e.target.style.borderColor = edge; e.target.style.boxShadow = 'none'; };
  const rtb = (id, value, onChange, placeholder, minHeight, maxChars) => (
    <RichTextBox id={id} value={value} onChange={onChange} placeholder={placeholder} minHeight={minHeight} maxChars={maxChars}
      borderColor={edge} accent={c.espresso} background={c.mid} radius={parseInt(theme.radius.sm, 10) || 6} textColor={c.onyx} />
  );
  const req = <span style={{ color: BRAND.red }}>*</span>;
  const sectionTitle = { fontSize: 16, fontWeight: 600, color: BRAND.ink, margin: '10px 0 12px', paddingBottom: 6, borderBottom: `1px solid ${BRAND.line}` };

  const fileBox = (labelText, hint, files, setter) => (
    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
      <div style={label}>{labelText}</div>
      <div style={{ fontSize: 12, color: c.ash, marginBottom: 6 }}>{hint}</div>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, background: c.mid, border: `1px solid ${edge}`, borderRadius: theme.radius.sm, padding: '5px 8px', minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setter(files.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex', padding: 0 }}><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      {files.length < MAX_FILES && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: c.onyx, border: `1px dashed ${edge}`, borderRadius: theme.radius.sm, padding: '8px 12px', cursor: 'pointer', background: c.white }}>
          <Paperclip size={14} /> Attach file
          <input type="file" multiple accept={ALLOWED_EXT.join(',')} onChange={pickFiles(setter, files)} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: c.greige, position: 'relative' }}>
      {/* Large faded I.EVO watermark — fixed, so it stays put while the form scrolls. */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `url(${ievoLogo})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        backgroundSize: 'min(80vw, 760px) auto', opacity: 0.07,
      }} />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 40px', position: 'relative', zIndex: 1 }}>
        {/* Logo band: Specula (the product) on the left, I.EVO (the company) on the right, in a
            softly outlined white band. The Specula logo is one real link (pointer cursor, keyboard
            friendly) to the note on the name. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18,
          background: c.white, border: '1px solid #DDD6CC', borderRadius: theme.radius.lg,
          padding: '2px clamp(10px, 3vw, 18px)',
        }}>
          <a href="/Specula_The_Name.pdf" target="_blank" rel="noopener noreferrer" title="About the name Specula"
            style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer', minWidth: 0 }}>
            <img src={speculaLogoColour} alt="Specula" draggable={false} style={{ height: 'clamp(50px, 11vw, 62px)', width: 'auto', display: 'block' }} />
          </a>
          <img src={ievoLogo} alt="I.EVO" style={{ height: 32, width: 'auto', maxWidth: '40%', flexShrink: 1 }} />
        </div>
        <PublicNav active="story" />

        <div style={{ background: c.white, border: `1px solid ${edge}`, borderRadius: theme.radius.lg, padding: 'clamp(16px, 4vw, 24px) clamp(14px, 4vw, 24px) 28px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <CheckCircle2 size={44} color={c.success} strokeWidth={1.8} />
              <div style={{ fontSize: 20, fontWeight: 800, color: c.onyx, margin: '10px 0 6px' }}>Thank you for sharing!</div>
              <div style={{ fontSize: 14, color: c.ash, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 22px' }}>
                Your AI story was submitted. A confirmation email is on its way{submittedEmail ? <> to <strong>{submittedEmail}</strong></> : ''} — if you don't see it, check your Spam folder. It will appear in Specula's AI Stories once it has been reviewed.
              </div>
              {submittedRef && (
                <div style={{ display: 'inline-block', margin: '0 auto 20px', padding: '8px 16px', border: `1px dashed ${edge}`, borderRadius: 8, fontSize: 13, color: c.ash }}>
                  Your reference <strong style={{ color: c.onyx, letterSpacing: '.02em', marginLeft: 6 }}>{submittedRef}</strong>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={resetStory}
                  style={{ background: BRAND.navy, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  Share another story
                </button>
                {drafts.length > 0 && (
                  <button type="button" onClick={() => { resetStory(); setShowDrafts(true); }}
                    style={{ background: c.white, color: BRAND.navy, border: `1px solid ${BRAND.navy}`, borderRadius: theme.radius.sm, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                    Continue a draft ({drafts.length})
                  </button>
                )}
                <button type="button" onClick={copyLink}
                  style={{ background: c.white, color: copyState === 'copied' ? c.success : c.onyx, border: `1px solid ${copyState === 'copied' ? c.success : edge}`, borderRadius: theme.radius.sm, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  {copyState === 'copied' ? 'Link copied!' : 'Copy link to share with colleagues'}
                </button>
              </div>
              {copyState === 'failed' && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: c.ash }}>
                  Your browser blocked copying — select the link below and copy it:
                  <input readOnly value={formUrl} onFocus={e => e.target.select()} autoFocus
                    style={{ display: 'block', width: '100%', maxWidth: 420, margin: '6px auto 0', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: `1px solid ${edge}`, borderRadius: theme.radius.sm, background: c.mid, color: c.onyx, textAlign: 'center' }} />
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h1 style={{ fontFamily: theme.font.display, fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 500, lineHeight: 1.2, color: BRAND.ink, margin: '0 0 12px' }}>Tell us how you used AI</h1>
              {/* Tool row: the everyday actions on the left (outlined pills); Drafts sits alone on the
                  right as the one filled button, so it stands apart from them. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button type="button" onClick={startNewStory}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c.white, color: c.onyx, border: `1px solid ${edge}`, borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={16} /> New story
                </button>
                <button type="button" onClick={() => setShowTutorial(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c.white, color: c.onyx, border: `1px solid ${edge}`, borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <PlayCircle size={16} /> How it works · Demo
                </button>
                <button type="button" onClick={() => setShowDrafts(true)} aria-label={`Drafts, ${drafts.length} saved`}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: BRAND.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(28,36,48,0.25)' }}>
                  <FolderOpen size={16} /> Drafts
                  {drafts.length > 0 && (
                    <span aria-hidden="true" style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 10, background: BRAND.red, color: '#fff', fontSize: 11.5, fontWeight: 700, lineHeight: '20px', textAlign: 'center' }}>
                      {drafts.length}
                    </span>
                  )}
                </button>
              </div>
              <p style={{ fontSize: 14, color: c.ash, lineHeight: 1.6, margin: '0 0 20px' }}>
                Used AI to get something done faster or better? Tell us your story — big or small, it helps colleagues learn. No login needed.
              </p>

              {optionsError && <div style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>{optionsError}</div>}

              {restored && draft0 && (
                <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FFF8E6', border: '1px solid #E8D5A0', borderRadius: 6, padding: '9px 12px', fontSize: 13, color: c.onyx, marginBottom: 16 }}>
                  <span style={{ flex: '1 1 240px' }}>
                    We opened your latest draft, <strong>{draftTitle(draft0.values)}</strong> (saved {fmtWhen(draft0.savedAt)}).
                    {drafts.length > 1 ? <> You have {drafts.length} drafts in all.</> : null} Attached files are not saved in drafts, so re-attach them if you had any.
                  </span>
                  {drafts.length > 1 && <button type="button" onClick={() => setShowDrafts(true)} style={{ background: 'none', border: 'none', color: BRAND.navy, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>View drafts</button>}
                  <button type="button" onClick={() => setRestored(false)} style={{ background: 'none', border: 'none', color: c.ash, cursor: 'pointer', fontSize: 13 }}>Dismiss</button>
                  <button type="button" onClick={startNewStory} style={{ background: 'none', border: 'none', color: c.danger, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Start a new story</button>
                </div>
              )}

              <div style={sectionTitle}>About you</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <label style={label} htmlFor="s-name">Name {req}</label>
                  <input id="s-name" style={input} onFocus={focusIn} onBlur={focusOut} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="name" />
                </div>
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <label style={label} htmlFor="s-email">Email {req}</label>
                  <input id="s-email" type="email" style={input} onFocus={focusIn} onBlur={focusOut} value={email} onChange={e => setEmail(e.target.value)} maxLength={150} autoComplete="email" />
                </div>
              </div>
              <div style={field}>
                <label style={label} htmlFor="s-dept">Department {req}</label>
                <select id="s-dept" style={input} onFocus={focusIn} onBlur={focusOut} value={deptId} onChange={e => setDeptId(e.target.value)} disabled={!options}>
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
                <input id="s-title" style={input} onFocus={focusIn} onBlur={focusOut} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Monthly P&L variance summary in 10 minutes" />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <label style={{ ...label, marginBottom: 0 }} htmlFor="s-model">{multiTools ? 'AI models used' : 'AI model used'} {req}</label>
                    {/* A small on/off switch (a real checkbox underneath, so keyboard and screen readers work). */}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.ash, cursor: options ? 'pointer' : 'default', whiteSpace: 'nowrap', position: 'relative' }}>
                      <input type="checkbox" id="s-multi" checked={multiTools} onChange={e => toggleMulti(e.target.checked)} disabled={!options}
                        onFocus={() => setSwitchFocus(true)} onBlur={() => setSwitchFocus(false)}
                        style={{ position: 'absolute', opacity: 0, width: 28, height: 16, margin: 0, left: 0, cursor: 'inherit' }} />
                      <span aria-hidden="true" style={{ width: 28, height: 16, borderRadius: 8, flexShrink: 0, background: multiTools ? c.espresso : edge, position: 'relative', transition: 'background .15s', boxShadow: switchFocus ? `0 0 0 3px ${c.espresso}33` : 'none' }}>
                        <span style={{ position: 'absolute', top: 2, left: multiTools ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                      </span>
                      I use multiple AI tools
                    </label>
                  </div>
                  {multiTools ? (
                    <MultiSelect id="s-model" options={options?.aiModels || []} value={aiModels} disabled={!options}
                      onChange={(v) => setAiModels((options?.aiModels || []).filter(m => v.includes(m)))}
                      placeholder="Select two or more…" style={input} borderColor={edge} accent={c.espresso} />
                  ) : (
                    <select id="s-model" style={input} onFocus={focusIn} onBlur={focusOut} value={aiModel} onChange={e => { setAiModel(e.target.value); setAiModelVersion(''); }} disabled={!options}>
                      <option value="">Select…</option>
                      {(options?.aiModels || []).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                </div>
                {otherChosen && (
                  <div style={{ ...field, flex: '1 1 220px' }}>
                    <label style={label} htmlFor="s-model-other">Which AI model? {req}</label>
                    <input id="s-model-other" style={input} onFocus={focusIn} onBlur={focusOut} value={aiModelOther} onChange={e => setAiModelOther(e.target.value)} maxLength={50} placeholder="e.g. DeepSeek" />
                  </div>
                )}
                {/* Appears only after a provider with a local catalog entry is
                    chosen — switching providers resets it (see onChange above). */}
                {multiTools && (
                  <div style={{ ...field, flex: '1 1 220px' }}>
                    <label style={label} htmlFor="s-model-version">Model &amp; version</label>
                    <select id="s-model-version" style={{ ...input, background: c.greige, cursor: 'not-allowed' }} value="" disabled aria-describedby="s-model-version-note">
                      <option value="">Not available</option>
                    </select>
                    <div id="s-model-version-note" style={{ fontSize: 12, color: c.ash, marginTop: 5 }}>
                      Version selection is unavailable when multiple AI tools are selected.
                    </div>
                  </div>
                )}
                {!multiTools && modelsFor(aiModel) && (
                  <div style={{ ...field, flex: '1 1 220px' }}>
                    <label style={label} htmlFor="s-model-version">Model &amp; version {req}</label>
                    <select id="s-model-version" style={input} onFocus={focusIn} onBlur={focusOut} value={aiModelVersion} onChange={e => setAiModelVersion(e.target.value)}>
                      <option value="">Select…</option>
                      {modelsFor(aiModel).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div style={field}>
                <label style={label} htmlFor="s-desc">Tell us your AI story {req}</label>
                {rtb('s-desc', description, setDescription, DESCRIPTION_GUIDE, 120, 4000)}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-input">Input — what you gave the AI {req}</label>
                  {rtb('s-input', inputDetails, setInputDetails, "The data, file or prompt you used", 90, 4000)}
                </div>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-output">Output — what you got back {req}</label>
                  {rtb('s-output', outputDetails, setOutputDetails, "The result and how you used it", 90, 4000)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-activities">Daily activities handed to AI (optional)</label>
                  {rtb('s-activities', dailyActivities, setDailyActivities, "e.g. Drafting emails, comparing quotations, formatting reports", 80, 2000)}
                </div>
                <div style={{ ...field, flex: '1 1 260px' }}>
                  <label style={label} htmlFor="s-deliverables">Deliverables made with AI (optional)</label>
                  {rtb('s-deliverables', deliverables, setDeliverables, "e.g. BOQ summary, P&L variance note, site report", 80, 2000)}
                </div>
              </div>

              <div style={sectionTitle}>Impact (optional)</div>
              {/* Checkboxes, not radios — productivity, accuracy and customer
                  appreciation can all apply at once. */}
              <div style={{ display: 'flex', gap: '4px 24px', flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={checkRow}>
                  <input type="checkbox" checked={improvedProductivity} onChange={e => setImprovedProductivity(e.target.checked)} style={{ margin: 0, width: 17, height: 17 }} />
                  Productivity improved
                </label>
                <label style={checkRow}>
                  <input type="checkbox" checked={improvedAccuracy} onChange={e => setImprovedAccuracy(e.target.checked)} style={{ margin: 0, width: 17, height: 17 }} />
                  Accuracy improved
                </label>
                <label style={checkRow}>
                  <input type="checkbox" checked={customerAppreciation} onChange={e => setCustomerAppreciation(e.target.checked)} style={{ margin: 0, width: 17, height: 17 }} />
                  Customer Appreciation
                </label>
              </div>
              <div style={field}>
                <label style={label} htmlFor="s-impact">Describe the impact</label>
                {rtb('s-impact', impactDescription, setImpactDescription, IMPACT_GUIDE, 80, 4000)}
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: c.ash, marginBottom: 12, minHeight: 18 }}>
                {savedAt ? (
                  <>
                    <span>✓ Saved to your drafts on this device at {fmtTime(savedAt)} — it autosaves as you type, so you can close this page and come back to it.</span>
                    {activeId && <button type="button" onClick={() => removeDraft(activeId)} style={{ background: 'none', border: 'none', color: c.ash, textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 }}>Delete this draft</button>}
                  </>
                ) : <span>Your work is saved to your drafts on this device as you type. You can keep more than one story going.</span>}
              </div>
              {error && <div role="alert" style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
              {saveState === 'failed' && <div role="alert" style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>Could not save the draft — this browser's storage is full or blocked. Your text is still on screen; submit it or copy it somewhere safe.</div>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={saveNow}
                  style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: c.white, color: saveState === 'saved' ? c.success : BRAND.navy, border: `1px solid ${saveState === 'saved' ? c.success : BRAND.navy}`, borderRadius: theme.radius.sm, padding: '12px 18px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
                  <Save size={16} /> {saveState === 'saved' ? 'Draft saved ✓' : saveState === 'empty' ? 'Nothing to save yet' : 'Save draft'}
                </button>
                <button type="submit" disabled={submitting || !options}
                  style={{ flex: '1 1 220px', background: BRAND.navy, color: c.white, border: 'none', borderRadius: theme.radius.sm, padding: '12px 18px', fontSize: 14.5, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting || !options ? 0.6 : 1 }}>
                  {submitting ? 'Submitting…' : 'Submit Your AI Story'}
                </button>
              </div>
            </form>
          )}
        </div>

        <footer style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, color: BRAND.grey }}>
          <span>Specula · CTO Office Projects &amp; Programs</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src={ievoLogo} alt="I.EVO" style={{ height: 16, width: 'auto' }} />
            <span>Iraj Evolution Design Company Private Limited</span>
          </span>
        </footer>
      </div>
      {showTutorial && <StoryTutorial onClose={closeTutorial} />}
      {showDrafts && <StoryDraftsPanel drafts={drafts} activeId={activeId} onOpen={openDraft} onDelete={removeDraft} onNew={startNewStory} onClose={() => setShowDrafts(false)} />}
    </div>
  );
}
