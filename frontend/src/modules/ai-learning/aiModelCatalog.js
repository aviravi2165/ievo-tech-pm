/**
 * Local catalog of specific models (with versions) per AI provider — powers
 * the second "Model & version" dropdown on the public /ai-story form, which
 * only appears AFTER a provider is picked in the "AI model used" select.
 *
 * LOCAL FOR NOW (by design): this lives in the frontend, not in the backend's
 * getFormOptions(), so the list can be tested and edited without touching the
 * API or the database. The provider dropdown still uses the backend's
 * `options.aiModels`; this map is keyed by those exact provider names, and a
 * provider missing from here (or 'Other') simply shows no second dropdown —
 * the free-text "Which AI model?" input keeps handling unknown providers.
 *
 * Model/version lists reflect consumer-facing lineups as of Oct 2026
 * (verified against OpenAI/Anthropic/Google/Meta/Perplexity docs) and are
 * expected to drift — that's exactly why they're kept here for now.
 */
export const MODEL_CATALOG = {
  ChatGPT: [
    'GPT-6',
    'GPT-6 Pro',
    'GPT-5.6 Sol',
    'GPT-5.6 Luna',
  ],
  Claude: [
    'Opus 5.5',
    'Sonnet 5.5',
    'Haiku 5.5',
    'Fable 5.1',
    'Opus 5',
  ],
  Gemini: [
    '3.8 Flash',
    '3.7 Flash',
    '3.6 Flash',
  ],
  // Manus routes across Claude/GPT/Gemini per task — no user-facing model
  // picker, so its own product version is the only honest choice here.
  Manus: [
    'Manus 2.0 (auto model routing)',
  ],
  'Meta AI': [
    'Muse Spark — Instant',
    'Muse Spark — Thinking',
    'Llama 4 Maverick',
    'Llama 4 Scout',
  ],
  Perplexity: [
    'Sonar 2',
    'GPT-5.6 Sol',
    'GPT-5.6 Terra',
    'Claude Sonnet 5',
    'Claude Opus 5',
    'Gemini 3.7 Flash',
  ],
};

/** Models for a provider, or null when this provider has no catalog entry. */
export function modelsFor(provider) {
  const list = MODEL_CATALOG[provider];
  return Array.isArray(list) && list.length > 0 ? list : null;
}
