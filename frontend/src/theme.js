const colors = {
  // ============================================================================
  // SURFACES — ievo.in itself is almost entirely white, with color used only
  // as a deliberate accent (section headings, one CTA block) — not a grey
  // "enterprise dashboard" wash. Matched that here: near-white app background,
  // pure white cards, color reserved for the accent tokens below.
  // ============================================================================

  // Cards, modals, header
  white: '#FFFFFF',
  black : '#000000',

  // Main app background
  greige: '#F8F7F6',

  // Alternate surface
  greigeBorder: '#EFEDEB',

  // Inputs, selects, textarea — a hair darker than white cards so fields
  // read as recessed/editable instead of blending into the card.
  mid: '#F4F2F1',

  // ============================================================================
  // TEXT — warm neutral grey, matching the warm charcoal/copper accent pair
  // (these were cool slate-blue from an earlier palette pass and were never
  // revisited when the accent went warm — that mismatch is what made status
  // tags like "Inactive" look disconnected from "Planning"/buttons next to it)
  // ============================================================================

  // Primary text
  onyx: '#1a1925',

  // Secondary text
  ash: '#79726B',

  // Placeholder / disabled
  ashLight: '#BDB6AE',

  // ============================================================================
  // PRIMARY BRAND
  // ============================================================================

  // Primary action only — main CTA button, active tab. A saturated hue here
  // (teal, blue, violet — all tried earlier) always ends up visually fighting
  // the logo, which is a bold warm red — cool accents clash with it, and any
  // other bold hue competes with it for attention. A warm charcoal doesn't
  // compete: it's neutral enough to sit quietly next to the red logo instead
  // of against it, while still reading as a deliberate, confident color (not
  // grey) against the white surfaces. Still deliberately NOT reused across
  // secondary elements (progress fills, avatars, badges, section titles) —
  // see pm.styles.js — so the whole UI doesn't read as one flat, repeated
  // color.
  espresso: '#363548',

  // Hover
  espressoDark: '#1f376a',

  // ============================================================================
  // BORDERS
  // ============================================================================

  border: '#E5E1DD',

  // ============================================================================
  // SEMANTIC
  // ============================================================================

  success: '#446f17',
  danger: '#c12d16',
  warning: '#d38a3c',
  info: '#256293',
  // Secondary brand accent — warm copper/rust, the true color-wheel
  // complement to navy (this pairing — warm terracotta against deep navy —
  // is a well-established, deliberately non-clashing combination, unlike
  // the previous #bd9d34, which read as a plain mustard/gold yellow next
  // to navy rather than a complementary warm tone). Used where a status
  // pill would otherwise fall back to a washed-out grey (Planning) or
  // double up on the primary's teal (In Review), so those get their own
  // warm, distinct color instead — and it's the Phase-level color family
  // in pm.styles.js's Phase/Activity/Task tinting.
  copper: '#b47027',

  // Deep, desaturated navy — NOT a bright/saturated blue, deliberately.
  // A vivid blue was already tried as the primary accent earlier and
  // rejected for visually fighting the red logo; this is dark and muted
  // enough (closer to charcoal-with-a-blue-cast than "blue") to sit quietly
  // in a button gradient the same way copper did, just a cooler mood.
  navy: '#16355e',

  // A lighter, more saturated blue derived from navy — used ONLY for the
  // Activity-level pastel washes (row/body backgrounds, header gradient)
  // in pm.styles.js, never for buttons/status pills (navy itself stays
  // there). navy is dark enough that even a low-alpha tint of it mostly
  // just greys the white surface instead of visibly reading as blue — a
  // dark, desaturated color needs much more alpha than a bright one to
  // register as a hue at all, so tinting with navy directly made the
  // Activity zone read as "grey" next to Phase's clearly warm copper zone,
  // not as a second distinct color family. This is lighter/brighter enough
  // to actually read as blue at the same low alphas copper uses.
  navyTint: '#5C7DA6',

  // Text on colored backgrounds
  onAccent: '#FFFFFF',
};

const theme = {
  colors,

  font: {
    display:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  radius: {
    sm: '8px',
    lg: '14px',
  },

  shadow: {
    sm: '0 1px 2px rgba(36,43,53,.04)',
    md: '0 6px 18px rgba(36,43,53,.05)',
    lg: '0 16px 40px rgba(36,43,53,.07)',
  },

  // white→greige was the first attempt here and was invisible in practice —
  // same mistake as the first pass at the nesting-depth tints earlier in
  // this project (both colors were only a few RGB points apart). Tied to
  // the brand copper at low alpha instead, so it's still restrained but
  // actually perceptible, and reads as "brand," not just "grey."
  // accent: espresso→espressoDark was the first attempt and was ALSO too
  // subtle to register on buttons — both stops are dark near-black browns,
  // barely distinguishable from each other. Copper→espresso instead: a
  // genuinely visible warm-to-dark transition, still just the two existing
  // brand colors (not a new hue), so buttons read as a deliberate gradient
  // rather than a flat fill.
  gradient: {
    header: `linear-gradient(90deg, ${colors.white} 0%, ${colors.copper}14 100%)`,
    // Navy→espresso (not copper→espresso) per explicit request — still two
    // dark, desaturated tones (not a bright blue), so it reads as a
    // deliberate cool-toned gradient without reintroducing the "competes
    // with the red logo" problem a vivid blue caused earlier.
    accent: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.espresso} 100%)`,
  },

  // Compact row heights for the table-based PM redesign — deliberately
  // tighter than the old card rows so more rows fit without scrolling
  // ("smaller size, wider workspace").
  // Shrunk from 40/36 — ClickUp's default rows run noticeably tighter than
  // this first pass did, which was the actual root cause of the app feeling
  // "zoomed in": not any single element being wrong, but the whole scale
  // (rows, buttons, pills, headers) sitting 15-25% larger than a compact
  // reference app end to end.
  // Second pass — user compared the first pass against the same UI at 80%
  // browser zoom and wants THAT as the actual default, not just "tighter
  // than before." Scaled ~20% down again from 32/30.
  row: {
    group: '26px',  // Phase / Activity group-header rows
    task: '24px',   // Task data rows
  },
};

export default theme;