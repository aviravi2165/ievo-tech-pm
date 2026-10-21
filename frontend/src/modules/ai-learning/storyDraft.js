// Autosaved draft of the "Your AI Story" form, kept in this browser's
// localStorage so a refresh, a closed tab or a crash doesn't lose the work.
//
// It lives on THIS device only (there is no login on the form to attach it to
// anywhere else), and attached files can't be stored in a browser draft —
// only the text, choices and ticks.

export const DRAFT_KEY = 'specula_ai_story_draft_v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // forget drafts after 30 days

// What is saved. `website` (the anti-bot field) and the files are left out.
export const DRAFT_FIELDS = [
  'name', 'email', 'deptId',
  'title', 'aiModel', 'aiModelOther', 'aiModelVersion',
  'description', 'inputDetails', 'outputDetails', 'dailyActivities', 'deliverables',
  'improvedProductivity', 'improvedAccuracy', 'customerAppreciation', 'impactDescription',
];

// The parts that are actual story content (not just who you are): a draft is
// only worth keeping if one of these has something in it.
const CONTENT_FIELDS = ['title', 'aiModel', 'description', 'inputDetails', 'outputDetails', 'dailyActivities', 'deliverables', 'impactDescription'];
const CHECKS = ['improvedProductivity', 'improvedAccuracy', 'customerAppreciation'];

const textOf = (html) => String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

export function hasContent(values) {
  return CONTENT_FIELDS.some(k => textOf(values?.[k])) || CHECKS.some(k => values?.[k] === true);
}

const pick = (values) => Object.fromEntries(DRAFT_FIELDS.map(k => [k, values?.[k] ?? (CHECKS.includes(k) ? false : '')]));

// Returns the saved-at timestamp, or null when nothing was written (empty
// form → any old draft is removed) or storage is unavailable.
export function saveDraft(values, storage = globalThis.localStorage, now = Date.now()) {
  try {
    if (!hasContent(values)) { storage.removeItem(DRAFT_KEY); return null; }
    storage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: now, values: pick(values) }));
    return now;
  } catch { return null; }
}

// { values, savedAt } or null (none, expired, unreadable, or empty).
export function loadDraft(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.values || typeof parsed.savedAt !== 'number') return null;
    if (now - parsed.savedAt > MAX_AGE_MS) { storage.removeItem(DRAFT_KEY); return null; }
    const values = pick(parsed.values);
    return hasContent(values) ? { values, savedAt: parsed.savedAt } : null;
  } catch { return null; }
}

export function clearDraft(storage = globalThis.localStorage) {
  try { storage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
