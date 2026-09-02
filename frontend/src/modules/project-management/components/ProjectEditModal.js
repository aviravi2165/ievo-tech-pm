import { useState } from 'react';
import { useTheme } from '@emotion/react';
import { X } from 'lucide-react';
import { projectApi } from '../api/projectApi';
import { ModalOverlay, Modal, Field, FieldHint, ModalFooter, BtnGhost, BtnPrimary } from '../styles/shared.styles';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

// ProjectEditModal — the Manager-only "edit everything" surface for a
// Project (name, description, start/end dates, and status). Sibling to
// ProjectFormModal (which only CREATES, and carries template logic this
// doesn't need). The backend's projectService.updateProject already accepts
// every one of these fields, so this is purely the UI for them.
//
// Status: only Active / Hold / Closed are offered — 'Completed' is automatic
// (the backend derives it at 100% progress), so it's deliberately not a
// choice here. The incoming `project.status` is the DERIVED value, so a
// project currently reading 'Completed' or 'Active' both map back to the
// 'Active' manual intent for this dropdown's initial value.
function toInput(d) { return d ? String(d).split('T')[0] : ''; }
function initialStatus(s) { return (s === 'Hold' || s === 'Closed') ? s : 'Active'; }

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Hold',   label: 'Hold (paused)' },
  { value: 'Closed', label: 'Closed (stopped)' },
];

export default function ProjectEditModal({ project, onClose, onSaved }) {
  const theme = useTheme();
  const [form, setForm] = useState({
    name:         project.name || '',
    description:  project.description || '',
    plannedStart: toInput(project.plannedStart),
    plannedEnd:   toInput(project.plannedEnd),
    status:       initialStatus(project.status),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  useEscapeKey(onClose);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim())  e.name = 'Project name is required';
    if (!form.plannedStart) e.plannedStart = 'Start date is required';
    if (!form.plannedEnd)   e.plannedEnd = 'End date is required';
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart)
      e.plannedEnd = 'End date must be after start date';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiError('');
    try {
      await projectApi.update(project.projectId, {
        name:         form.name.trim(),
        description:  form.description || null,
        plannedStart: form.plannedStart,
        plannedEnd:   form.plannedEnd,
        status:       form.status,
      });
      onSaved();
    } catch (err) {
      setApiError(err?.response?.data?.error || 'Failed to save project');
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

        <h3>Edit Project</h3>

        <Field>
          <label>Project Name <span className="req">*</span></label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            className={errors.name ? 'error' : ''}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          {errors.name && <FieldHint style={{ color: theme.colors.danger }}>{errors.name}</FieldHint>}
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
            <input type="date" value={form.plannedStart} onChange={e => set('plannedStart', e.target.value)}
              className={errors.plannedStart ? 'error' : ''} />
            {errors.plannedStart && <FieldHint style={{ color: theme.colors.danger }}>{errors.plannedStart}</FieldHint>}
          </Field>
          <Field>
            <label>End Date <span className="req">*</span></label>
            <input type="date" value={form.plannedEnd} onChange={e => set('plannedEnd', e.target.value)}
              min={form.plannedStart || undefined}
              className={errors.plannedEnd ? 'error' : ''} />
            {errors.plannedEnd && <FieldHint style={{ color: theme.colors.danger }}>{errors.plannedEnd}</FieldHint>}
          </Field>
        </div>

        <Field>
          <label>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}
            style={{ width:'100%', background:theme.colors.mid, border:`1px solid ${theme.colors.border}`, borderRadius:theme.radius.sm, padding:'8px 10px', color:theme.colors.onyx, fontSize:13, fontFamily:'inherit', outline:'none' }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <FieldHint>"Completed" shows automatically once every task is done — set Active / Hold / Closed here.</FieldHint>
        </Field>

        {apiError && (
          <div style={{ color:theme.colors.danger, fontSize:12, marginBottom:8, padding:'8px 12px', background:'rgba(168,93,77,.08)', borderRadius:theme.radius.sm, border:'1px solid rgba(168,93,77,.25)' }}>
            {apiError}
          </div>
        )}

        <ModalFooter>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </BtnPrimary>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}
