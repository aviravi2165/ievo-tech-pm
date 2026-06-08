import { useState } from 'react';
import { projectApi } from '../api/projectApi';

export default function ProjectFormModal({ onClose, onCreated }) {
  const [form, setForm]   = useState({ name:'', description:'', plannedStart:'', plannedEnd:'' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Project name is required'); return; }
    setSaving(true); setError('');
    try {
      const project = await projectApi.create(form);
      onCreated(project);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create project');
    } finally { setSaving(false); }
  };

  return (
    <div className="pm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal">
        <h3>New Project</h3>
        <div className="pm-field">
          <label>Project Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Living Room Set Collection" autoFocus />
        </div>
        <div className="pm-field">
          <label>Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief overview of the project…" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="pm-field">
            <label>Planned Start</label>
            <input type="date" value={form.plannedStart} onChange={e => set('plannedStart', e.target.value)} />
          </div>
          <div className="pm-field">
            <label>Planned End</label>
            <input type="date" value={form.plannedEnd} onChange={e => set('plannedEnd', e.target.value)} />
          </div>
        </div>
        {error && <div style={{ color:'var(--danger)', fontSize:12, marginBottom:8 }}>{error}</div>}
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
