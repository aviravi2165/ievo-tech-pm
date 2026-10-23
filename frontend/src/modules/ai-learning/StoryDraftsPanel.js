import { useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { X, Plus, Trash2, FileText } from 'lucide-react';
import { draftTitle } from './storyDraft';

// The list of saved drafts on this device: open one to keep working on it, delete one, or
// start a new story. Opened from the "Drafts" button (with its count bubble) on the form.

const NAVY = '#334456';
const INK = '#1C2430';
const SLATE = '#4A5462';
const GREY = '#8A939F';
const LINE = '#E2E6EB';
const EDGE = '#C5CCD4';

const fmtWhen = (t) => new Date(t).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function StoryDraftsPanel({ drafts, activeId, onOpen, onDelete, onNew, onClose }) {
  const theme = useTheme();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Your saved drafts"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#fff', borderRadius: theme.radius.lg, width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 4px' }}>
          <div>
            <div style={{ fontFamily: theme.font.display, fontSize: 20, fontWeight: 500, color: INK }}>Your drafts</div>
            <div style={{ fontSize: 12.5, color: SLATE, marginTop: 2 }}>
              {drafts.length === 0 ? 'Nothing saved yet.' : `${drafts.length} saved on this device — pick one to keep working on it.`}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: SLATE, display: 'flex', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '10px 18px', overflowY: 'auto', flex: 1 }}>
          {drafts.length === 0 ? (
            <div style={{ textAlign: 'center', color: GREY, fontSize: 13.5, padding: '28px 8px' }}>
              Your work is saved here automatically as you type, so you can start several stories and finish them later.
            </div>
          ) : drafts.map(d => {
            const active = d.id === activeId;
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 8, border: `1px solid ${active ? NAVY : EDGE}`, borderRadius: 8, background: active ? '#F4F6F8' : '#fff' }}>
                <FileText size={18} color={active ? NAVY : GREY} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draftTitle(d.values)}</div>
                  <div style={{ fontSize: 12, color: GREY, marginTop: 1 }}>
                    Saved {fmtWhen(d.savedAt)}{active ? <span style={{ color: NAVY, fontWeight: 600 }}> · open now</span> : null}
                  </div>
                </div>
                {!active && (
                  <button type="button" onClick={() => onOpen(d.id)}
                    style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Open</button>
                )}
                <button type="button" onClick={() => onDelete(d.id)} aria-label={`Delete draft ${draftTitle(d.values)}`} title="Delete this draft"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D8320C', display: 'flex', padding: 6, flexShrink: 0 }}><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: `1px solid ${LINE}`, padding: '12px 18px 14px' }}>
          <button type="button" onClick={onNew}
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 8, padding: '10px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Start a new story
          </button>
          <div style={{ fontSize: 11.5, color: GREY, marginTop: 8, lineHeight: 1.5 }}>
            Drafts stay in this browser on this device only. Attached files are not saved in drafts — re-attach them before you submit.
          </div>
        </div>
      </div>
    </div>
  );
}
