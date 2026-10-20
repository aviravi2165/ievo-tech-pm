import { useRef, useEffect, useState, useCallback } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link2, RemoveFormatting } from 'lucide-react';

// A text box with a small formatting toolbar (bold, italic, underline,
// bullets, numbering, link). Value is an HTML string; the server sanitises it
// again before storing, so this only has to produce sensible markup.

const STYLE_ID = 'specula-rich-text-styles';
const CSS = `
.rtb-editor:empty:before { content: attr(data-placeholder); color: #9a928a; white-space: pre-line; pointer-events: none; }
.rtb-editor ul, .rtb-editor ol { margin: 4px 0 4px 22px; padding: 0; }
.rtb-editor a { color: #1c5cab; text-decoration: underline; }
.rtb-editor p, .rtb-editor div { margin: 0; }
.rtb-view ul, .rtb-view ol { margin: 4px 0 4px 20px; padding: 0; }
.rtb-view a { color: #1c5cab; text-decoration: underline; }
.rtb-view p { margin: 0 0 6px; }
`;
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID; el.textContent = CSS;
  document.head.appendChild(el);
}

export const stripHtml = (html) => {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').replace(/ /g, ' ').trim();
};

const isEmptyHtml = (html) => !stripHtml(html) && !/<(ul|ol|li)\b/i.test(html || '');

export default function RichTextBox({ id, value, onChange, placeholder, minHeight = 110, maxChars, borderColor, background, radius = 6, fontSize = 16, textColor, accent }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState({});

  useEffect(ensureStyles, []);

  // Keep the DOM in step with `value` only when it changed from outside (e.g.
  // the form resetting) — rewriting it on every keystroke would jump the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value || '')) el.innerHTML = value || '';
  }, [value]);

  const refreshActive = useCallback(() => {
    try {
      setActive({
        bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'),
      });
    } catch { /* queryCommandState can throw when nothing is focused */ }
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    onChange(isEmptyHtml(el.innerHTML) ? '' : el.innerHTML);
    refreshActive();
  };

  const run = (cmd, arg) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const addLink = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { window.alert('Select the text you want to turn into a link first.'); return; }
    const url = window.prompt('Link address (https://…)', 'https://');
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) { window.alert('The link must start with http://, https:// or mailto:'); return; }
    run('createLink', url.trim());
  };

  // Paste as plain text: formatting copied from Word/web pages is messy and
  // can carry hidden styles. People can still format with the toolbar.
  const onPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const plainLen = stripHtml(value).length;
  const over = maxChars && plainLen > maxChars;
  const edge = focused ? (accent || borderColor) : borderColor;

  const btn = (isOn) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 28,
    background: isOn ? 'rgba(0,0,0,0.10)' : 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: textColor || '#1f1f1f', padding: 0,
  });
  // mousedown preventDefault keeps the text selection while a toolbar button is clicked.
  const tool = (label, icon, on, action) => (
    <button type="button" title={label} aria-label={label} aria-pressed={!!on} style={btn(on)}
      onMouseDown={e => e.preventDefault()} onClick={action}>{icon}</button>
  );

  return (
    <div style={{ border: `1px solid ${edge}`, borderRadius: radius, background, overflow: 'hidden', boxShadow: focused ? `0 0 0 3px ${edge}22` : 'none' }}>
      <div role="toolbar" aria-label="Text formatting" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', borderBottom: `1px solid ${borderColor}`, background: 'rgba(0,0,0,0.03)', flexWrap: 'wrap' }}>
        {tool('Bold', <Bold size={15} />, active.bold, () => run('bold'))}
        {tool('Italic', <Italic size={15} />, active.italic, () => run('italic'))}
        {tool('Underline', <Underline size={15} />, active.underline, () => run('underline'))}
        <span style={{ width: 1, height: 18, background: borderColor, margin: '0 4px' }} />
        {tool('Bulleted list', <List size={16} />, active.ul, () => run('insertUnorderedList'))}
        {tool('Numbered list', <ListOrdered size={16} />, active.ol, () => run('insertOrderedList'))}
        {tool('Link', <Link2 size={15} />, false, addLink)}
        {tool('Clear formatting', <RemoveFormatting size={15} />, false, () => run('removeFormat'))}
        {maxChars ? <span style={{ marginLeft: 'auto', fontSize: 11, color: over ? '#c12d16' : '#79726B', paddingRight: 4 }}>{plainLen}/{maxChars}</span> : null}
      </div>
      <div ref={ref} id={id} className="rtb-editor" role="textbox" aria-multiline="true" contentEditable suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit} onKeyUp={refreshActive} onMouseUp={refreshActive}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPaste={onPaste}
        style={{ minHeight, maxHeight: 360, overflowY: 'auto', padding: '10px 12px', outline: 'none', fontSize, lineHeight: 1.5, color: textColor, fontFamily: 'inherit', wordBreak: 'break-word' }} />
    </div>
  );
}

// Read-only display of a rich value that came back (already sanitised) from the server.
export function RichView({ html, style }) {
  useEffect(ensureStyles, []);
  return <div className="rtb-view" style={{ wordBreak: 'break-word', ...style }} dangerouslySetInnerHTML={{ __html: html || '' }} />;
}
