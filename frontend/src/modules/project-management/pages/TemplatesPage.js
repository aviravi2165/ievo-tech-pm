import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { LayoutTemplate, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { templateApi } from '../api/projectApi';
import ProjectFormModal from '../components/ProjectFormModal';
import TemplateEditor from '../components/TemplateEditor';
import TemplatePreview from '../components/TemplatePreview';
import { Wrap, Empty, BtnPrimary, BtnGhost, IconBtn, IconBtnDanger, DepBadge } from '../styles/shared.styles';
import { Topbar, TopbarH1, TopbarActions, List } from '../styles/ProjectListPage.styles';

/**
 * TemplatesPage — everyone browses; an admin additionally gets create/edit/
 * delete on each card. "Use this template" opens the same ProjectFormModal
 * "New Project" already uses, just pre-selecting this template (still
 * changeable there) — a project made from a template is a completely
 * ordinary, fully-editable project afterward, same as any other.
 */
export default function TemplatesPage({ onBack, onProjectCreated, isAdmin }) {
  const theme = useTheme();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useTemplateId, setUseTemplateId] = useState(null);
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  // undefined = editor closed, null = "new template" mode, a number = editing that template
  const [editingTemplateId, setEditingTemplateId] = useState(undefined);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    templateApi.list().then(setTemplates).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try { await templateApi.delete(t.templateId); fetchTemplates(); }
    catch (err) { alert(err?.response?.data?.error || 'Failed to delete template'); }
  };

  return (
    <Wrap>
      <Topbar>
        <BtnGhost onClick={onBack} style={{ display:'flex', alignItems:'center', gap:4 }}>
          <ArrowLeft size={13} strokeWidth={2} /> Back
        </BtnGhost>
        <TopbarH1>Templates</TopbarH1>
        {isAdmin && (
          <TopbarActions>
            <BtnPrimary onClick={() => setEditingTemplateId(null)}>+ New Template</BtnPrimary>
          </TopbarActions>
        )}
      </Topbar>

      <List>
        {loading && <div style={{ color: theme.colors.ash, fontSize: 13 }}>Loading templates…</div>}

        {!loading && templates.length === 0 && (
          <Empty>
            <LayoutTemplate size={44} strokeWidth={1.2} />
            <p>No templates yet.{isAdmin ? ' Create one to give everyone a head start on common project shapes.' : ' Check back later, or ask an admin to add one.'}</p>
          </Empty>
        )}

        {!loading && templates.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14, alignItems:'stretch' }}>
            {templates.map(t => (
              <div key={t.templateId}
                onClick={() => setPreviewTemplateId(t.templateId)}
                title="Click to preview the full phase/activity/task structure"
                style={{
                  background: theme.colors.white, border:`1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.lg, padding: 16, display:'flex', flexDirection:'column', gap:8,
                  cursor: 'pointer', transition: 'border-color 0.15s', height:'100%',
                }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                  <div style={{ fontWeight:700, fontSize:14, color: theme.colors.onyx }}>{t.name}</div>
                  {t.category && <DepBadge as="span" style={{ flexShrink:0 }}>{t.category}</DepBadge>}
                </div>
                {t.description && (
                  <div style={{ fontSize:12, color: theme.colors.ash, lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>
                    {t.description}
                  </div>
                )}
                <div style={{ fontSize:11, color: theme.colors.ashLight }}>
                  {t.phaseCount} phase{t.phaseCount !== 1 ? 's' : ''} · {t.activityCount} activit{t.activityCount !== 1 ? 'ies' : 'y'} · click to preview
                </div>
                {/* marginTop:'auto' (not a fixed 8px) — pins this row to the
                    bottom of the card regardless of how many lines the name/
                    description above it take, so every card's button row
                    lines up across a grid row instead of trailing right
                    after whatever text happened to be shortest. */}
                <div style={{ display:'flex', gap:6, marginTop:'auto', paddingTop:8 }} onClick={e => e.stopPropagation()}>
                  <BtnGhost style={{ flex:1 }} onClick={() => setPreviewTemplateId(t.templateId)}>Preview</BtnGhost>
                  <BtnPrimary style={{ flex:1 }} onClick={() => setUseTemplateId(t.templateId)}>Use this template</BtnPrimary>
                  {isAdmin && (
                    <>
                      <IconBtn title="Edit template" onClick={() => setEditingTemplateId(t.templateId)} style={{ width:30, height:30, flexShrink:0 }}>
                        <Pencil size={14} strokeWidth={2} />
                      </IconBtn>
                      <IconBtnDanger title="Delete template" onClick={() => handleDelete(t)} style={{ width:30, height:30, flexShrink:0 }}>
                        <Trash2 size={14} strokeWidth={2} />
                      </IconBtnDanger>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </List>

      {previewTemplateId != null && (
        <TemplatePreview
          templateId={previewTemplateId}
          onClose={() => setPreviewTemplateId(null)}
          onUseTemplate={(id) => { setPreviewTemplateId(null); setUseTemplateId(id); }}
        />
      )}

      {useTemplateId != null && (
        <ProjectFormModal
          presetTemplateId={useTemplateId}
          onClose={() => setUseTemplateId(null)}
          onCreated={(project) => { setUseTemplateId(null); onProjectCreated(project.projectId); }}
        />
      )}

      {editingTemplateId !== undefined && (
        <TemplateEditor
          templateId={editingTemplateId}
          onClose={() => setEditingTemplateId(undefined)}
          onSaved={() => { setEditingTemplateId(undefined); fetchTemplates(); }}
        />
      )}
    </Wrap>
  );
}
