import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { X } from 'lucide-react';
import { projectApi, templateApi } from '../api/projectApi';
import { ModalOverlay, Modal, Field, FieldHint, ModalFooter, BtnGhost, BtnPrimary } from '../styles/shared.styles';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import TemplatePreview from './TemplatePreview';

/**
 * ProjectFormModal — fixed:
 * 1. Solid white background (was transparent due to undefined --surface)
 * 2. Dates are required with validation
 * 3. End date must be after start date
 * 4. Description is included
 *
 * presetTemplateId — set when opened via "Use this template" on the
 * Templates page, so the picker below is pre-selected and effectively
 * locked in (still shown, so the user can still change their mind before
 * submitting).
 */
// YYYY-MM-DD for today in the LOCAL timezone — Date#toISOString() is UTC,
// which rolls over to tomorrow's date for anyone west of UTC in the
// evening; that's exactly the kind of one-day-off "the template dates look
// wrong" bug this component needs to avoid introducing.
function todayLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
// The template's total span — the furthest any phase's own end offset
// reaches — so End Date can be pre-filled to actually cover every
// phase/activity/task the template will create, not just a guess.
function templateSpanDays(template) {
  return template.phases.reduce((max, ph) => Math.max(max, ph.startOffsetDays + ph.durationDays), 0);
}

export default function ProjectFormModal({ onClose, onCreated, presetTemplateId = null }) {
  const theme = useTheme();
  const TODAY = todayLocal();
  const [form, setForm] = useState({ name:'', description:'', plannedStart:'', plannedEnd:'' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(presetTemplateId ? String(presetTemplateId) : '');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEscapeKey(onClose);

  useEffect(() => {
    templateApi.list().then(setTemplates).catch(() => {});
  }, []);

  // Whenever a template is (re)selected, fill Start Date to TODAY (never
  // the past — a template scheduled starting before today would have every
  // task read as immediately overdue, which defeats the point of using one)
  // and fill End Date to span the template's own full length from there.
  // Both stay fully editable afterward — this is a sensible default, not a
  // lock.
  useEffect(() => {
    if (!templateId) return;
    templateApi.get(templateId).then(t => {
      const start = (form.plannedStart && form.plannedStart >= TODAY) ? form.plannedStart : TODAY;
      const span = templateSpanDays(t);
      setForm(f => ({ ...f, plannedStart: start, plannedEnd: addDaysISO(start, span) }));
      setErrors(e => ({ ...e, plannedStart: '', plannedEnd: '' }));
    }).catch(() => {});
    // Deliberately keyed only on templateId, not form.plannedStart/TODAY —
    // this should re-run when the template selection changes, not on every
    // keystroke in the date fields (which would fight the user's own edits).
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())        e.name = 'Project name is required';
    if (!form.plannedStart)       e.plannedStart = 'Start date is required';
    if (!form.plannedEnd)         e.plannedEnd = 'End date is required';
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart)
      e.plannedEnd = 'End date must be after start date';
    // Only enforced for template projects — every phase/activity/task's
    // date is computed as an offset from this one, so a past start date
    // here means the entire generated schedule opens already late. A
    // blank/manual project has no such computed dependency, so it can
    // still be legitimately backdated.
    if (templateId && form.plannedStart && form.plannedStart < TODAY)
      e.plannedStart = "Can't start a template in the past — every generated date is relative to this one.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiError('');
    try {
      // A template has no absolute dates of its own — every phase/activity/
      // task offset is resolved against whatever plannedStart is entered
      // here, same fields either way, just a different endpoint.
      const project = templateId
        ? await templateApi.instantiate(templateId, form)
        : await projectApi.create(form);
      onCreated(project);
    } catch (err) {
      setApiError(err?.response?.data?.error || 'Failed to create project');
    } finally { setSaving(false); }
  };

  return (
    <ModalOverlay onClick={e => e.target === e.currentTarget && onClose()}>
      <Modal>
        <button
          onClick={onClose}
          style={{ position:'absolute', top:16, right:16, background:'none', border:'none', cursor:'pointer', color:theme.colors.ash, display:'flex' }}
          title="Close"
        ><X size={18} strokeWidth={2} /></button>

        <h3>New Project</h3>

        {templates.length > 0 && (
          <Field>
            <label>Start from a template</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)}
              style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'8px 10px', color:theme.colors.onyx, fontSize:13, fontFamily:'inherit', outline:'none' }}>
              <option value="">None — start blank</option>
              {templates.map(t => (
                <option key={t.templateId} value={t.templateId}>{t.name}{t.category ? ` (${t.category})` : ''}</option>
              ))}
            </select>
            {templateId && (
              <FieldHint>
                Start/End Date below have been filled in from today, spanning the template's full length — adjust either if needed.{' '}
                <button type="button" onClick={() => setPreviewOpen(true)}
                  style={{ background:'none', border:'none', padding:0, color:theme.colors.espresso, fontSize:11, fontWeight:600, cursor:'pointer', textDecoration:'underline' }}>
                  Preview this template
                </button>
              </FieldHint>
            )}
          </Field>
        )}

        <Field>
          <label>Project Name <span className="req">*</span></label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Q3 Product Launch"
            autoFocus
            className={errors.name ? 'error' : ''}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          {errors.name && <FieldHint style={{color:theme.colors.danger}}>{errors.name}</FieldHint>}
        </Field>

        <Field>
          <label>Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Brief overview of what this project aims to achieve…"
            rows={5}
          />
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field>
            <label>Start Date <span className="req">*</span></label>
            <input
              type="date"
              value={form.plannedStart}
              onChange={e => set('plannedStart', e.target.value)}
              min={templateId ? TODAY : undefined}
              className={errors.plannedStart ? 'error' : ''}
            />
            {errors.plannedStart && <FieldHint style={{color:theme.colors.danger}}>{errors.plannedStart}</FieldHint>}
          </Field>
          <Field>
            <label>End Date <span className="req">*</span></label>
            <input
              type="date"
              value={form.plannedEnd}
              onChange={e => set('plannedEnd', e.target.value)}
              min={form.plannedStart || undefined}
              className={errors.plannedEnd ? 'error' : ''}
            />
            {errors.plannedEnd && <FieldHint style={{color:theme.colors.danger}}>{errors.plannedEnd}</FieldHint>}
          </Field>
        </div>

        {apiError && (
          <div style={{ color:theme.colors.danger, fontSize:12, marginBottom:8, padding:'8px 12px', background:'rgba(168,93,77,.08)', borderRadius:theme.radius.sm, border:'1px solid rgba(168,93,77,.25)' }}>
            {apiError}
          </div>
        )}

        <ModalFooter>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Project'}
          </BtnPrimary>
        </ModalFooter>
      </Modal>

      {previewOpen && templateId && (
        <TemplatePreview
          templateId={templateId}
          onClose={() => setPreviewOpen(false)}
          onUseTemplate={(id) => { setTemplateId(String(id)); setPreviewOpen(false); }}
        />
      )}
    </ModalOverlay>
  );
}
