import { useState } from 'react';
import { useTheme } from '@emotion/react';
import { X } from 'lucide-react';
import { projectApi } from '../api/projectApi';
import { ModalOverlay, Modal, Field, FieldHint, ModalFooter, BtnGhost, BtnPrimary } from '../styles/shared.styles';

/**
 * ProjectFormModal — fixed:
 * 1. Solid white background (was transparent due to undefined --surface)
 * 2. Dates are required with validation
 * 3. End date must be after start date
 * 4. Description is included
 */
export default function ProjectFormModal({ onClose, onCreated }) {
  const theme = useTheme();
  const [form, setForm] = useState({ name:'', description:'', plannedStart:'', plannedEnd:'' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

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
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiError('');
    try {
      const project = await projectApi.create(form);
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
    </ModalOverlay>
  );
}
