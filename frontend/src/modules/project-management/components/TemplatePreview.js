import { useState, useEffect } from 'react';
import { useTheme } from '@emotion/react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';
import { templateApi } from '../api/projectApi';
import { ModalOverlay, Modal, DepBadge, ModalFooter, BtnPrimary, BtnGhost } from '../styles/shared.styles';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

/**
 * TemplatePreview — read-only view of a template's full Phase → Activity →
 * Task structure, available to EVERY user (not just admins) so "Use this
 * template" isn't a blind pick. Same nested tree TemplateEditor shows, just
 * with all the add/remove/edit controls stripped out. Every Phase/Activity
 * starts expanded (unlike the editor's accordion) since there's nothing to
 * edit here — the point is to see everything at a glance.
 */
export default function TemplatePreview({ templateId, onClose, onUseTemplate }) {
  const theme = useTheme();
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');
  const [collapsedPhases, setCollapsedPhases] = useState({});

  useEscapeKey(onClose);

  useEffect(() => {
    templateApi.get(templateId).then(setTemplate).catch(err => setError(err?.response?.data?.error || 'Failed to load template'));
  }, [templateId]);

  const togglePhase = (id) => setCollapsedPhases(f => ({ ...f, [id]: !f[id] }));

  return (
    <ModalOverlay onClick={e => e.target === e.currentTarget && onClose()}>
      <Modal style={{ maxWidth: 640 }}>
        <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'none', border:'none', cursor:'pointer', color:theme.colors.ash, display:'flex' }} title="Close">
          <X size={18} strokeWidth={2} />
        </button>

        {error && <div style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</div>}

        {!template && !error && <div style={{ color: theme.colors.ash, fontSize: 13 }}>Loading…</div>}

        {template && (
          <>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom: template.description ? 6 : 16 }}>
              <h3 style={{ margin:0 }}>{template.name}</h3>
              {template.category && <DepBadge as="span" style={{ flexShrink:0, marginTop:3 }}>{template.category}</DepBadge>}
            </div>
            {template.description && (
              <p style={{ fontSize:12.5, color: theme.colors.ash, lineHeight:1.5, marginTop:0, marginBottom:18 }}>{template.description}</p>
            )}

            <div style={{ fontSize:10, color: theme.colors.ash, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
              {template.phases.length} phase{template.phases.length !== 1 ? 's' : ''}
            </div>

            {template.phases.length === 0 && (
              <div style={{ fontSize:12, color: theme.colors.ash, fontStyle:'italic', marginBottom:16 }}>This template has no phases yet.</div>
            )}

            {template.phases.map(ph => (
              <div key={ph.templatePhaseId} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, marginBottom: 8, overflow: 'hidden' }}>
                <div
                  onClick={() => togglePhase(ph.templatePhaseId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: theme.colors.greige, cursor: 'pointer' }}
                >
                  {collapsedPhases[ph.templatePhaseId] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.onyx, flex: 1 }}>{ph.name}</span>
                  <span style={{ fontSize: 10, color: theme.colors.ash }}>
                    day {ph.startOffsetDays}–{ph.startOffsetDays + ph.durationDays} · {ph.activities.length} activit{ph.activities.length !== 1 ? 'ies' : 'y'}
                  </span>
                </div>

                {!collapsedPhases[ph.templatePhaseId] && (
                  <div style={{ padding: '8px 12px', background: theme.colors.white }}>
                    {ph.description && <p style={{ fontSize:11.5, color: theme.colors.ash, margin: '0 0 8px' }}>{ph.description}</p>}
                    {ph.activities.length === 0 && (
                      <div style={{ fontSize:11, color: theme.colors.ashLight, fontStyle:'italic' }}>No activities in this phase.</div>
                    )}
                    {ph.activities.map(act => (
                      <div key={act.templateActivityId} style={{ marginBottom: 8, paddingLeft: 6, borderLeft: `2px solid ${theme.colors.navyTint}` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: act.tasks.length ? 4 : 0 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: theme.colors.onyx }}>{act.name}</span>
                          <span style={{ fontSize: 9.5, color: theme.colors.ash }}>day {act.startOffsetDays}–{act.startOffsetDays + act.durationDays}</span>
                        </div>
                        {act.tasks.map(tk => (
                          <div key={tk.templateTaskId} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color: theme.colors.ash, padding: '2px 0 2px 10px' }}>
                            <span style={{ flex:1 }}>{tk.name}</span>
                            <span style={{ fontSize:9.5, color: theme.colors.ashLight }}>{tk.priority} · due day {tk.dueOffsetDays}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <ModalFooter>
              <BtnGhost onClick={onClose}>Close</BtnGhost>
              <BtnPrimary onClick={() => onUseTemplate(template.templateId)}>Use this template</BtnPrimary>
            </ModalFooter>
          </>
        )}
      </Modal>
    </ModalOverlay>
  );
}
