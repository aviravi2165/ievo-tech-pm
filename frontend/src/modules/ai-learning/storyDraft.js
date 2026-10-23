// Drafts of the "Your AI Story" form, kept in this browser's localStorage so a refresh,
// a closed tab or a crash doesn't lose the work — and so several stories can be worked on
// side by side before any of them is submitted.
//
// Drafts live on THIS device/browser only (the form has no login to attach them to
// anywhere else), and attached files can't be stored in a browser draft — only the text,
// choices and ticks.

export const DRAFTS_KEY = 'specula_ai_story_drafts_v2';
const LEGACY_KEY = 'specula_ai_story_draft_v1';   // the earlier single-draft format
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;      // forget drafts after 30 days
export const MAX_DRAFTS = 20;

// What is saved. `website` (the anti-bot field) and the files are left out.
export const DRAFT_FIELDS = [
  'name', 'email', 'deptId',
  'title', 'aiModel', 'aiModelOther', 'aiModelVersion',
  'description', 'inputDetails', 'outputDetails', 'dailyActivities', 'deliverables',
  'improvedProductivity', 'improvedAccuracy', 'customerAppreciation', 'impactDescription',
];

// The parts that are actual story content (not just who you are): a draft is only worth
// keeping if one of these has something in it.
const CONTENT_FIELDS = ['title', 'aiModel', 'description', 'inputDetails', 'outputDetails', 'dailyActivities', 'deliverables', 'impactDescription'];
const CHECKS = ['improvedProductivity', 'improvedAccuracy', 'customerAppreciation'];

const textOf = (html) => String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

export function hasContent(values) {
  return CONTENT_FIELDS.some(k => textOf(values?.[k])) || CHECKS.some(k => values?.[k] === true);
}

const pick = (values) => Object.fromEntries(DRAFT_FIELDS.map(k => [k, values?.[k] ?? (CHECKS.includes(k) ? false : '')]));

export function newDraftId() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Shown in the drafts list.
export function draftTitle(values) {
  return textOf(values?.title) || 'Untitled story';
}

function readStore(storage, now) {
  let store = { drafts: [] };
  try {
    const raw = storage.getItem(DRAFTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.drafts)) store = parsed;
    }
  } catch { /* unreadable → treat as empty */ }

  // One-time carry-over of the earlier single draft.
  try {
    const legacyRaw = storage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy?.values && typeof legacy.savedAt === 'number' && hasContent(legacy.values)) {
        store.drafts.push({ id: newDraftId(), savedAt: legacy.savedAt, values: pick(legacy.values) });
      }
      storage.removeItem(LEGACY_KEY);
      writeStore(storage, store);
    }
  } catch { /* ignore */ }

  store.drafts = store.drafts
    .filter(d => d && typeof d.id === 'string' && typeof d.savedAt === 'number' && d.values && now - d.savedAt <= MAX_AGE_MS && hasContent(d.values))
    .map(d => ({ id: d.id, savedAt: d.savedAt, values: pick(d.values) }));
  return store;
}

function writeStore(storage, store) {
  try { storage.setItem(DRAFTS_KEY, JSON.stringify({ drafts: store.drafts })); return true; } catch { return false; }
}

// Newest first. [] when none (or storage is unavailable).
export function listDrafts(storage = globalThis.localStorage, now = Date.now()) {
  try { return readStore(storage, now).drafts.sort((a, b) => b.savedAt - a.savedAt); } catch { return []; }
}

export function getDraft(id, storage = globalThis.localStorage, now = Date.now()) {
  return listDrafts(storage, now).find(d => d.id === id) || null;
}

// Create or update the draft `id` (null → a new one). Returns { id, savedAt }, or null when
// nothing was written: an empty form removes its draft instead of keeping a blank one, and a
// full or blocked storage can't save (the caller can tell the person).
export function saveDraftEntry(id, values, storage = globalThis.localStorage, now = Date.now()) {
  try {
    const store = readStore(storage, now);
    if (!hasContent(values)) {
      if (id && store.drafts.some(d => d.id === id)) {
        store.drafts = store.drafts.filter(d => d.id !== id);
        writeStore(storage, store);
      }
      return null;
    }
    const useId = id || newDraftId();
    const entry = { id: useId, savedAt: now, values: pick(values) };
    const i = store.drafts.findIndex(d => d.id === useId);
    if (i >= 0) store.drafts[i] = entry; else store.drafts.push(entry);
    if (store.drafts.length > MAX_DRAFTS) {
      // Over the cap: drop the oldest, never the one just saved.
      store.drafts.sort((a, b) => b.savedAt - a.savedAt);
      store.drafts = store.drafts.slice(0, MAX_DRAFTS);
    }
    return writeStore(storage, store) ? { id: useId, savedAt: now } : null;
  } catch { return null; }
}

export function deleteDraft(id, storage = globalThis.localStorage, now = Date.now()) {
  try {
    const store = readStore(storage, now);
    store.drafts = store.drafts.filter(d => d.id !== id);
    writeStore(storage, store);
  } catch { /* ignore */ }
}
