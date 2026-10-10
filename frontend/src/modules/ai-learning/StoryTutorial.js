import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// Step-by-step "how to fill Your AI Story" guide, each step with a worked
// example. Opened from the form's "How it works" button, and automatically
// once on a person's first visit.

const STEPS = [
  {
    title: 'Welcome to Your AI Story',
    body: 'Used AI to get something done faster or better? Share it here — big or small, every story helps a colleague learn something new. It takes about 5 minutes and you do not need a Specula login.',
    tips: ['Fields marked * are required — everything else is optional.', 'You can share as many stories as you like.'],
  },
  {
    title: 'Step 1 · About you',
    body: 'Enter your name, email and pick your department from the list.',
    example: [['Name', 'Rahul Mehta'], ['Email', 'rahul.mehta@ievo.co.in'], ['Department', 'COST & ESTIMATION']],
    tips: ['Keep "Remember my details" ticked — next time these fill in automatically on this device.', 'Use your work email: your confirmation arrives there.'],
  },
  {
    title: 'Step 2 · Your story',
    body: 'Give your story a short title, choose the AI you used, and tell us what you did — what you were working on, how AI helped, and what changed.',
    example: [
      ['Title', 'Vendor quotation comparison in 15 minutes'],
      ['AI model', 'ChatGPT'],
      ['Your AI story', 'I had 4 vendor quotations to compare for a site order. I gave them to ChatGPT and asked for a side-by-side table of rates, taxes and delivery terms. I checked the numbers and shared it with purchase the same day.'],
    ],
    tips: ['Not in the list? Pick "Other" and type the AI name.'],
  },
  {
    title: 'Step 3 · What you handed to AI',
    body: 'Optionally list the day-to-day activities and deliverables you now do with AI. Then describe the input you gave and the output you got back.',
    example: [
      ['Daily activities', 'Comparing quotations, drafting vendor emails'],
      ['Deliverables', 'Vendor comparison sheet'],
      ['Input', '4 quotation PDFs + "make a comparison table of rate, GST and delivery"'],
      ['Output', 'A clean comparison table with the lowest rate highlighted'],
    ],
  },
  {
    title: 'Step 4 · Impact (optional)',
    body: 'Tick what improved — you can tick both — and describe the impact in a line.',
    example: [['Improved', 'Productivity ✓   Accuracy ✓'], ['Impact', 'Comparison time reduced from 2 hours to 15 minutes (≈ 85%)']],
    tips: ['Rough numbers are fine — "about 50% faster" is perfect.'],
  },
  {
    title: 'Step 5 · Before & after files (optional)',
    body: 'Attach what the work looked like without AI and the AI-assisted result — up to 3 files each.',
    example: [['Before', 'Manual_comparison.xlsx'], ['After', 'AI_comparison_table.pdf']],
    tips: ['Excel, PDF, Word, PowerPoint, CSV, text or images — up to 20 MB per file.'],
  },
  {
    title: 'Submit — what happens next',
    body: 'Press "Submit Your AI Story". You will get a confirmation email with a one-page PDF of your story (check Spam if you do not see it). After a quick review it appears in Specula\'s AI Stories for everyone to learn from.',
    tips: ['Stay Curious!'],
  },
];

export const TUTORIAL_SEEN_KEY = 'specula_ai_story_tutorial_seen';

export function markTutorialSeen() {
  try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch { /* storage blocked */ }
}
export function tutorialSeen() {
  try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; } catch { return true; }
}

export default function StoryTutorial({ onClose }) {
  const theme = useTheme();
  const c = theme.colors;
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI(v => Math.min(v + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setI(v => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const btn = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: theme.radius.sm, padding: '9px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' };

  return (
    <div role="dialog" aria-modal="true" aria-label="How to fill Your AI Story"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: c.white, borderRadius: theme.radius.lg, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: c.ash, textTransform: 'uppercase' }}>
            How it works · {i + 1} / {STEPS.length}
          </span>
          <button type="button" onClick={onClose} aria-label="Close tutorial" style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.ash, display: 'flex', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '8px 18px 4px', overflowY: 'auto' }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: c.onyx, marginBottom: 8 }}>{step.title}</div>
          <div style={{ fontSize: 14.5, color: c.onyx, lineHeight: 1.6 }}>{step.body}</div>

          {step.example && (
            <div style={{ marginTop: 14, border: `1px dashed ${c.border}`, borderRadius: theme.radius.sm, background: c.greige, padding: '10px 12px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', color: c.ash, textTransform: 'uppercase', marginBottom: 6 }}>Example</div>
              {step.example.map(([k, v]) => (
                <div key={k} style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, color: c.onyx }}>{k}: </span>
                  <span style={{ color: c.onyx }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {step.tips && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: c.ash, fontSize: 13, lineHeight: 1.6 }}>
              {step.tips.map(t => <li key={t}>{t}</li>)}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 0 4px' }}>
          {STEPS.map((_, n) => (
            <button key={n} type="button" onClick={() => setI(n)} aria-label={`Go to step ${n + 1}`}
              style={{ width: n === i ? 18 : 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: n === i ? c.onyx : c.border, transition: 'width .15s' }} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px 16px' }}>
          {!last && (
            <button type="button" onClick={onClose} style={{ ...btn, background: 'none', border: 'none', color: c.ash, fontWeight: 600, paddingLeft: 0 }}>Skip</button>
          )}
          <span style={{ flex: 1 }} />
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} style={{ ...btn, background: c.white, color: c.onyx, border: `1px solid ${c.border}` }}>
              <ChevronLeft size={15} /> Back
            </button>
          )}
          <button type="button" onClick={() => (last ? onClose() : setI(i + 1))} style={{ ...btn, background: c.onyx, color: c.white, border: 'none' }}>
            {last ? 'Start writing' : <>Next <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
