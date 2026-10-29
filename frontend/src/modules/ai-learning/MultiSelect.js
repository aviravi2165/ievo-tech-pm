import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * A dropdown where several options can be ticked. Looks like the form's <select> (the page passes
 * the same `style`), opens a checkbox list, closes on an outside click or Escape, and works with
 * the keyboard (Tab to the box, Enter/Space to open, Tab through the options, Space to tick).
 */
export default function MultiSelect({ id, options, value, onChange, placeholder = 'Select…', style, borderColor, accent, disabled }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = (opt) => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);

  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button type="button" id={id} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', cursor: disabled ? 'default' : 'pointer', boxShadow: open ? `0 0 0 3px ${accent}22` : 'none' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: value.length ? 1 : 0.6 }}>
          {value.length ? value.join(', ') : placeholder}
        </span>
        <ChevronDown size={16} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div role="group" aria-label="Choose one or more" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: '#fff', border: `1px solid ${borderColor}`, borderRadius: 6, boxShadow: '0 8px 24px rgba(28,36,48,0.14)', padding: 4, maxHeight: 340, overflowY: 'auto' }}>
          {options.map(opt => {
            const on = value.includes(opt);
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 15, background: on ? `${accent}10` : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(opt)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                <span aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, boxSizing: 'border-box', borderRadius: 4, border: `1.5px solid ${on ? accent : borderColor}`, background: on ? accent : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Check size={13} color="#fff" strokeWidth={3} />}
                </span>
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
