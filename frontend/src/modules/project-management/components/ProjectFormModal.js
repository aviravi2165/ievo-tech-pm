import { useState } from 'react';
import { projectApi } from '../api/projectApi';

/**
 * ProjectFormModal — fixed:
 * 1. Solid white background (was transparent due to undefined --surface)
 * 2. Dates are required with validation
 * 3. End date must be after start date
 * 4. Description is included
 */
export default function ProjectFormModal({ onClose, onCreated }) {
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
    <div className="pm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal">
        <button
          onClick={onClose}
          style={{ position:'absolute', top:16, right:16, background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1 }}
          title="Close"
        >✕</button>

        <h3>New Project</h3>

        <div className="pm-field">
          <label>Project Name <span className="req">*</span></label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Q3 Product Launch"
            autoFocus
            className={errors.name ? 'error' : ''}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          {errors.name && <div className="pm-field-hint" style={{color:'#aa1010'}}>{errors.name}</div>}
        </div>

        <div className="pm-field">
          <label>Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Brief overview of what this project aims to achieve…"
            rows={3}
          />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="pm-field">
            <label>Start Date <span className="req">*</span></label>
            <input
              type="date"
              value={form.plannedStart}
              onChange={e => set('plannedStart', e.target.value)}
              className={errors.plannedStart ? 'error' : ''}
            />
            {errors.plannedStart && <div className="pm-field-hint" style={{color:'#aa1010'}}>{errors.plannedStart}</div>}
          </div>
          <div className="pm-field">
            <label>End Date <span className="req">*</span></label>
            <input
              type="date"
              value={form.plannedEnd}
              onChange={e => set('plannedEnd', e.target.value)}
              min={form.plannedStart || undefined}
              className={errors.plannedEnd ? 'error' : ''}
            />
            {errors.plannedEnd && <div className="pm-field-hint" style={{color:'#aa1010'}}>{errors.plannedEnd}</div>}
          </div>
        </div>

        {apiError && (
          <div style={{ color:'#aa1010', fontSize:12, marginBottom:8, padding:'8px 12px', background:'rgba(170,16,16,.06)', borderRadius:'var(--radius)', border:'1px solid rgba(170,16,16,.2)' }}>
            {apiError}
          </div>
        )}

        <div className="pm-modal-footer">
          <button className="pm-btn pm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="pm-btn pm-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
