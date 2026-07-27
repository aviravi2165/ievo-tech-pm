import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { X, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { templateApi } from '../api/projectApi';
import {
  ModalOverlay, Modal, Field, FieldHint, ModalFooter, BtnGhost, BtnPrimary,
  IconBtnDanger, EditPanel, EditPanelTitle,
} from '../styles/shared.styles';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

const PRIORITY_OPTS = ['Low', 'Medium', 'High', 'Critical'];

/**
 * TemplateEditor — admin-only. templateId=null means "new template": the
 * name/description/category form below is all that's shown until Create is
 * pressed, since phases/activities/tasks need a real templateId to attach
 * to. Every add/remove below hits its own real API endpoint immediately
 * (not a local staged draft) — simplest correct approach given the nested
 * CRUD already exists per-level; refetches the full tree after each change
 * so the editor always reflects exactly what's saved.
 *
 * Offsets/durations are in DAYS, relative to the parent's own computed
 * start — see templateService.instantiateTemplate for how these resolve to
 * real dates once a project actually exists.
 */
export default function TemplateEditor({ templateId, onClose, onSaved }) {
  const theme = useTheme();
  const [template, setTemplate] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [expandedPhaseId, setExpandedPhaseId] = useState(null);
  const [expandedActivityId, setExpandedActivityId] = useState(null);

  // One shared "add" draft per level — only one phase/activity is ever
  // expanded at a time, so a single draft object per level is enough
  // without a form library or per-row state maps.
  const [newPhase, setNewPhase] = useState({ name: '', description: '', startOffsetDays: 0, durationDays: 5 });
  const [newActivity, setNewActivity] = useState({ name: '', description: '', startOffsetDays: 0, durationDays: 3 });
  const [newTask, setNewTask] = useState({ name: '', description: '', priority: 'Medium', dueOffsetDays: 2 });

  useEscapeKey(onClose);

  const refetch = useCallback(async (id) => {
    const t = await templateApi.get(id);
    setTemplate(t);
    setName(t.name); setDescription(t.description || ''); setCategory(t.category || '');
  }, []);

  useEffect(() => { if (templateId != null) refetch(templateId); }, [templateId, refetch]);

  const handleCreateTemplate = async () => {
    if (!name.trim()) { setError('Template name is required'); return; }
    setSaving(true); setError('');
    try {
      const created = await templateApi.create({ name: name.trim(), description, category });
      await refetch(created.templateId);
    } catch (err) { setError(err?.response?.data?.error || 'Failed to create template'); }
    finally { setSaving(false); }
  };

  const handleSaveMeta = async () => {
    setSaving(true); setError('');
    try { await templateApi.update(template.templateId, { name: name.trim(), description, category }); await refetch(template.templateId); }
    catch (err) { setError(err?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const addPhase = async () => {
    if (!newPhase.name.trim() || !newPhase.durationDays) return;
    try {
      await templateApi.addPhase(template.templateId, newPhase);
      setNewPhase({ name: '', description: '', startOffsetDays: 0, durationDays: 5 });
      await refetch(template.templateId);
    } catch (err) { alert(err?.response?.data?.error || 'Failed to add phase'); }
  };
  const removePhase = async (phaseId) => {
    if (!window.confirm('Remove this phase (and everything under it) from the template?')) return;
    try { await templateApi.removePhase(phaseId); await refetch(template.templateId); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to remove phase'); }
  };

  const addActivity = async (phaseId) => {
    if (!newActivity.name.trim() || !newActivity.durationDays) return;
    try {
      await templateApi.addActivity(phaseId, newActivity);
      setNewActivity({ name: '', description: '', startOffsetDays: 0, durationDays: 3 });
      await refetch(template.templateId);
    } catch (err) { alert(err?.response?.data?.error || 'Failed to add activity'); }
  };
  const removeActivity = async (activityId) => {
    if (!window.confirm('Remove this activity (and its tasks) from the template?')) return;
    try { await templateApi.removeActivity(activityId); await refetch(template.templateId); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to remove activity'); }
  };

  const addTask = async (activityId) => {
    if (!newTask.name.trim()) return;
    try {
      await templateApi.addTask(activityId, newTask);
      setNewTask({ name: '', description: '', priority: 'Medium', dueOffsetDays: 2 });
      await refetch(template.templateId);
    } catch (err) { alert(err?.response?.data?.error || 'Failed to add task'); }
  };
  const removeTask = async (taskId) => {
    if (!window.confirm('Remove this task from the template?')) return;
    try { await templateApi.removeTask(taskId); await refetch(template.templateId); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to remove task'); }
  };

  const inputStyle = { background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '6px 10px', color: theme.colors.onyx, fontSize: 12, fontFamily: 'inherit', outline: 'none' };
  const labelStyle = { fontSize: 10, color: theme.colors.ash, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 };

  return (
    <ModalOverlay onClick={e => e.target === e.currentTarget && onClose()}>
      <Modal style={{ maxWidth: 640 }}>
        <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'none', border:'none', cursor:'pointer', color:theme.colors.ash, display:'flex' }} title="Close">
          <X size={18} strokeWidth={2} />
        </button>

        <h3>{template ? 'Edit Template' : 'New Template'}</h3>

        <Field>
          <label>Name <span className="req">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Software Development Lifecycle" autoFocus />
        </Field>
        <Field>
          <label>Category</label>
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. SDLC, Research, Manufacturing" />
        </Field>
        <Field>
          <label>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What kind of project is this for?" />
        </Field>

        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {!template ? (
          <ModalFooter>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
            <BtnPrimary onClick={handleCreateTemplate} disabled={saving}>{saving ? 'Creating…' : 'Create & add phases →'}</BtnPrimary>
          </ModalFooter>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <BtnGhost onClick={handleSaveMeta} disabled={saving}>{saving ? 'Saving…' : 'Save name/description/category'}</BtnGhost>
            </div>

            <EditPanelTitle>Phases ({template.phases.length})</EditPanelTitle>
            {template.phases.map(ph => (
              <div key={ph.templatePhaseId} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, marginBottom: 8, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedPhaseId(v => v === ph.templatePhaseId ? null : ph.templatePhaseId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: theme.colors.greige, cursor: 'pointer' }}
                >
                  {expandedPhaseId === ph.templatePhaseId ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.onyx, flex: 1 }}>{ph.name}</span>
                  <span style={{ fontSize: 10, color: theme.colors.ash }}>day {ph.startOffsetDays} → {ph.startOffsetDays + ph.durationDays} ({ph.activities.length} activit{ph.activities.length !== 1 ? 'ies' : 'y'})</span>
                  <IconBtnDanger title="Remove phase" onClick={e => { e.stopPropagation(); removePhase(ph.templatePhaseId); }} style={{ width: 22, height: 22 }}>
                    <Trash2 size={12} strokeWidth={2} />
                  </IconBtnDanger>
                </div>

                {expandedPhaseId === ph.templatePhaseId && (
                  <div style={{ padding: '10px 14px', background: theme.colors.white }}>
                    {ph.activities.map(act => (
                      <div key={act.templateActivityId} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, marginBottom: 6, overflow: 'hidden' }}>
                        <div
                          onClick={() => setExpandedActivityId(v => v === act.templateActivityId ? null : act.templateActivityId)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: theme.colors.navyTint + '26', cursor: 'pointer' }}
                        >
                          {expandedActivityId === act.templateActivityId ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: theme.colors.onyx, flex: 1 }}>{act.name}</span>
                          <span style={{ fontSize: 9.5, color: theme.colors.ash }}>day {act.startOffsetDays} → {act.startOffsetDays + act.durationDays} ({act.tasks.length} task{act.tasks.length !== 1 ? 's' : ''})</span>
                          <IconBtnDanger title="Remove activity" onClick={e => { e.stopPropagation(); removeActivity(act.templateActivityId); }} style={{ width: 20, height: 20 }}>
                            <Trash2 size={11} strokeWidth={2} />
                          </IconBtnDanger>
                        </div>

                        {expandedActivityId === act.templateActivityId && (
                          <div style={{ padding: '8px 12px', background: theme.colors.white }}>
                            {act.tasks.map(tk => (
                              <div key={tk.templateTaskId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: `1px solid ${theme.colors.border}` }}>
                                <span style={{ fontSize: 11, color: theme.colors.onyx, flex: 1 }}>{tk.name}</span>
                                <span style={{ fontSize: 9.5, color: theme.colors.ash }}>{tk.priority} · due day {tk.dueOffsetDays}</span>
                                <IconBtnDanger title="Remove task" onClick={() => removeTask(tk.templateTaskId)} style={{ width: 18, height: 18 }}>
                                  <Trash2 size={10} strokeWidth={2} />
                                </IconBtnDanger>
                              </div>
                            ))}
                            <EditPanel style={{ marginTop: 8 }}>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div style={{ flex: '1 1 140px' }}>
                                  <label style={labelStyle}>Task name</label>
                                  <input style={{ ...inputStyle, width: '100%' }} value={newTask.name} onChange={e => setNewTask(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Write test cases" />
                                </div>
                                <div>
                                  <label style={labelStyle}>Priority</label>
                                  <select style={inputStyle} value={newTask.priority} onChange={e => setNewTask(f => ({ ...f, priority: e.target.value }))}>
                                    {PRIORITY_OPTS.map(p => <option key={p}>{p}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={labelStyle}>Due (day)</label>
                                  <input type="number" min={0} style={{ ...inputStyle, width: 60 }} value={newTask.dueOffsetDays} onChange={e => setNewTask(f => ({ ...f, dueOffsetDays: Number(e.target.value) }))} />
                                </div>
                                <BtnPrimary style={{ padding: '7px 14px' }} onClick={() => addTask(act.templateActivityId)}>+ Add Task</BtnPrimary>
                              </div>
                            </EditPanel>
                          </div>
                        )}
                      </div>
                    ))}
                    <EditPanel style={{ marginTop: 4 }}>
                      <EditPanelTitle style={{ marginBottom: 6 }}>New Activity</EditPanelTitle>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 140px' }}>
                          <label style={labelStyle}>Activity name</label>
                          <input style={{ ...inputStyle, width: '100%' }} value={newActivity.name} onChange={e => setNewActivity(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Requirements gathering" />
                        </div>
                        <div>
                          <label style={labelStyle}>Start (day)</label>
                          <input type="number" min={0} style={{ ...inputStyle, width: 60 }} value={newActivity.startOffsetDays} onChange={e => setNewActivity(f => ({ ...f, startOffsetDays: Number(e.target.value) }))} />
                        </div>
                        <div>
                          <label style={labelStyle}>Duration (days)</label>
                          <input type="number" min={1} style={{ ...inputStyle, width: 60 }} value={newActivity.durationDays} onChange={e => setNewActivity(f => ({ ...f, durationDays: Number(e.target.value) }))} />
                        </div>
                        <BtnPrimary style={{ padding: '7px 14px' }} onClick={() => addActivity(ph.templatePhaseId)}>+ Add Activity</BtnPrimary>
                      </div>
                    </EditPanel>
                  </div>
                )}
              </div>
            ))}

            <EditPanel style={{ marginTop: 8, marginBottom: 20 }}>
              <EditPanelTitle style={{ marginBottom: 6 }}>New Phase</EditPanelTitle>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={labelStyle}>Phase name</label>
                  <input style={{ ...inputStyle, width: '100%' }} value={newPhase.name} onChange={e => setNewPhase(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Design" />
                </div>
                <div>
                  <label style={labelStyle}>Start (day)</label>
                  <input type="number" min={0} style={{ ...inputStyle, width: 60 }} value={newPhase.startOffsetDays} onChange={e => setNewPhase(f => ({ ...f, startOffsetDays: Number(e.target.value) }))} />
                </div>
                <div>
                  <label style={labelStyle}>Duration (days)</label>
                  <input type="number" min={1} style={{ ...inputStyle, width: 60 }} value={newPhase.durationDays} onChange={e => setNewPhase(f => ({ ...f, durationDays: Number(e.target.value) }))} />
                </div>
                <BtnPrimary style={{ padding: '7px 14px' }} onClick={addPhase}>+ Add Phase</BtnPrimary>
              </div>
              <FieldHint>"Start (day)" is relative to the project's own start date once someone uses this template — Phase 1 usually starts at day 0.</FieldHint>
            </EditPanel>

            <ModalFooter>
              <BtnPrimary onClick={() => onSaved()}>Done</BtnPrimary>
            </ModalFooter>
          </>
        )}
      </Modal>
    </ModalOverlay>
  );
}
