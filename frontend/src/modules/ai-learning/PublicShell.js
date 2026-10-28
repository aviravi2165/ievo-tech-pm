import { Link } from 'react-router-dom';
import { useTheme } from '@emotion/react';
// Transparent copy of the I.EVO wordmark (the original logo.png has a solid white background).
import ievoLogo from '../../shell/assets/ievo-logo-transparent.png';
// Official Specula logo, "colour" version (navy + red) for light backgrounds.
import speculaLogoColour from '../../assets/brand/specula-horizontal-colour.svg';

// Brand Identity Guide v1.0 colours, shared by the open (no-login) pages.
export const BRAND = { navy: '#334456', red: '#D8320C', ink: '#1C2430', slate: '#4A5462', grey: '#8A939F', line: '#E2E6EB', mist: '#F4F6F8', green: '#2F7D5B' };
// Field/card outline: the guide's Line is too faint against white, so one step darker.
export const EDGE = '#C5CCD4';

export const PROFILE_KEY = 'specula_ai_story_profile';   // shared by all three open pages
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || {}; } catch { return {}; }
}
export function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...loadProfile(), ...p })); } catch { /* storage blocked — just don't remember */ }
}
export function forgetProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
}

const PAGES = [['feed', '/ai-feed', 'AI Feed'], ['story', '/ai-story', 'Share your AI story'], ['tech', '/ai-tech', 'Share a tech']];

/** The three open pages link to each other through this strip. */
export function PublicNav({ active }) {
  return (
    <nav aria-label="AI pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {PAGES.map(([key, to, label]) => {
        const on = key === active;
        return (
          <Link key={key} to={to} aria-current={on ? 'page' : undefined}
            style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 20,
              background: on ? BRAND.navy : '#fff', color: on ? '#fff' : BRAND.ink, border: `1px solid ${on ? BRAND.navy : EDGE}` }}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Page frame for the open pages: watermark, logo band, nav strip, footer. */
export default function PublicShell({ active, maxWidth = 760, children }) {
  const theme = useTheme();
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BRAND.mist, position: 'relative' }}>
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `url(${ievoLogo})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        backgroundSize: 'min(80vw, 760px) auto', opacity: 0.07,
      }} />
      <div style={{ maxWidth, margin: '0 auto', padding: '28px 16px 40px', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14,
          background: '#fff', border: '1px solid #DDD6CC', borderRadius: theme.radius.lg, padding: '2px clamp(10px, 3vw, 18px)',
        }}>
          <a href="/Specula_The_Name.pdf" target="_blank" rel="noopener noreferrer" title="About the name Specula"
            style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', minWidth: 0 }}>
            <img src={speculaLogoColour} alt="Specula" draggable={false} style={{ height: 'clamp(50px, 11vw, 62px)', width: 'auto', display: 'block' }} />
          </a>
          <img src={ievoLogo} alt="I.EVO" style={{ height: 32, width: 'auto', maxWidth: '40%', flexShrink: 1 }} />
        </div>
        <PublicNav active={active} />
        {children}
        <footer style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, color: BRAND.grey }}>
          <span>Specula · CTO Office Projects &amp; Programs</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src={ievoLogo} alt="I.EVO" style={{ height: 16, width: 'auto' }} />
            <span>Iraj Evolution Design Company Private Limited</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
