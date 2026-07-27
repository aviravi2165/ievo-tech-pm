import { useState } from 'react';
import { useTheme } from '@emotion/react';
import UserSearchInput from './UserSearchInput';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import {
  DepBadge, IconBtn, BtnPrimary, BtnGhost, SubPanelTitle, MemberRow,
} from '../styles/shared.styles';

function initials(name = '') { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

/**
 * ParticipantsPanel — the one Participants panel for Project, Phase, and
 * Activity levels. Fixed structure, top to bottom, per the actual design:
 *   1. Inherited manager groups (Project Managers; + Phase Managers when
 *      this is an Activity panel) — read-only, deduped against each other
 *      by the caller.
 *   2. This level's own Managers — editable by a Manager here; nobody who
 *      already has Manager access via an inherited group above is ever
 *      offered as an add-candidate (excluded entirely, not just warned —
 *      they already have full scope here, adding them again does nothing).
 *      Project level has no inherited group, so this section IS its
 *      Managers list.
 *   3. Assignees — always read-only, rolled up from actual task
 *      assignments in scope (an Activity's own tasks; a Phase's tasks
 *      across all its Activities; a Project's tasks everywhere under it).
 *   4. Viewers — a project-wide, read-only grant. Addable ONLY at Project
 *      level (viewerGroup.editable=true there); every Phase/Activity panel
 *      just displays the same project-wide list read-only, since Viewer
 *      access isn't scoped per Phase/Activity, it's project-wide by design.
 */
export default function ParticipantsPanel({
  levelLabel,             // 'Project' | 'Phase' | 'Activity'
  inheritedGroups = [],   // [{ label, people: [{userId,name}] }] — read-only, already deduped by caller
  managers,               // this level's own explicit managers: [{userId,name,email}]
  managersLoading,
  canEditManagers,
  onAddManager,           // (userId) => Promise — always adds as 'Manager', no role picker anymore
  onRemoveManager,        // (userId) => Promise
  managerQuickAddPool,    // add-candidates — caller has ALREADY excluded anyone with inherited access
  assigneesLoading,
  assignees = [],
  viewerGroup,            // { people, editable, loading, onAdd, onRemove, quickAddPool } — see below
  excludeUserIdsForSearch = [],
  myUserId,
}) {
  const theme = useTheme();

  return (
    <div>
      <SubPanelTitle>{levelLabel} Participants</SubPanelTitle>

      {inheritedGroups.map(g => (
        <div key={g.label} style={{ marginBottom: 12 }}>
          <SectionLabel theme={theme}>{g.label} <Muted theme={theme}>(inherited — manage at that level)</Muted></SectionLabel>
          {g.people.length > 0
            ? <ChipRow people={g.people} theme={theme} />
            : <div style={{ fontSize: 11, color: theme.colors.ash, fontStyle: 'italic' }}>None set at that level.</div>}
        </div>
      ))}

      <ManagerSection
        levelLabel={levelLabel}
        managers={managers}
        loading={managersLoading}
        canEdit={canEditManagers}
        onAdd={onAddManager}
        onRemove={onRemoveManager}
        quickAddPool={managerQuickAddPool}
        excludeUserIdsForSearch={excludeUserIdsForSearch}
        myUserId={myUserId}
        theme={theme}
        hasUpperManagers={inheritedGroups.some(g => g.people.length > 0)}
      />

      <div style={{ marginBottom: 12 }}>
        <SectionLabel theme={theme}>Assignees <Muted theme={theme}>(from tasks in this scope)</Muted></SectionLabel>
        {assigneesLoading && <div style={{ fontSize: 11, color: theme.colors.ash }}>Loading…</div>}
        {!assigneesLoading && assignees.length === 0 && (
          <div style={{ fontSize: 11, color: theme.colors.ash, fontStyle: 'italic' }}>No one is assigned to any task here yet.</div>
        )}
        {!assigneesLoading && assignees.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {assignees.map(a => (
              <DepBadge key={a.userId} as="span" title={a.taskCount ? `${a.taskCount} active task${a.taskCount !== 1 ? 's' : ''}` : 'No current tasks'} style={{ padding: '3px 10px' }}>
                {a.name}{a.taskCount > 0 && <span style={{ opacity: 0.7 }}> · {a.taskCount}</span>}
              </DepBadge>
            ))}
          </div>
        )}
      </div>

      {viewerGroup && (viewerGroup.editable ? (
        <ManagerSection
          levelLabel={levelLabel}
          sectionTitle="Viewers"
          hint="Read-only access — can see this project and everything under it, but can't be assigned to tasks or manage anything. Viewer is project-wide: added once here, visible at every Phase and Activity."
          managers={viewerGroup.people}
          loading={viewerGroup.loading}
          canEdit={canEditManagers}
          onAdd={viewerGroup.onAdd}
          onRemove={viewerGroup.onRemove}
          quickAddPool={viewerGroup.quickAddPool}
          excludeUserIdsForSearch={excludeUserIdsForSearch}
          myUserId={myUserId}
          theme={theme}
          hasUpperManagers={false}
        />
      ) : viewerGroup.people.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <SectionLabel theme={theme}>Viewers <Muted theme={theme}>(project-wide, read-only — manage at Project level)</Muted></SectionLabel>
          <ChipRow people={viewerGroup.people} theme={theme} />
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children, theme }) {
  return (
    <div style={{ fontSize: 10, color: theme.colors.ash, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
      {children}
    </div>
  );
}
function Muted({ children, theme }) {
  return <span style={{ fontWeight: 400, textTransform: 'none', fontStyle: 'italic', color: theme.colors.ashLight }}>{children}</span>;
}
function ChipRow({ people, theme }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {people.map(p => <DepBadge key={p.userId} as="span" style={{ padding: '3px 10px' }}>{p.name}</DepBadge>)}
    </div>
  );
}

// One editable role section (Managers, or Viewers at Project level) — add
// via quick-pick chip or search, list with Remove. No role dropdown per
// row anymore: which role this section manages is fixed by which list of
// people/handlers the caller passed in, not chosen per-add — Phase/
// Activity only ever call this for Managers; Project calls it twice
// (Managers, then Viewers).
function ManagerSection({ levelLabel, sectionTitle, hint, managers, loading, canEdit, onAdd, onRemove, quickAddPool, excludeUserIdsForSearch, myUserId, theme, hasUpperManagers }) {
  const [search, setSearch] = useState(null);
  const [error, setError] = useState('');
  const title = sectionTitle || `${levelLabel} Managers`;

  const handleSearchAdd = async () => {
    if (!search) return;
    setError('');
    try { await onAdd(search.userId); setSearch(null); }
    catch (err) { setError(err?.response?.data?.error || 'Failed to add.'); }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <SectionLabel theme={theme}>{title}</SectionLabel>
      {hint && <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}

      {canEdit && (
        <>
          {quickAddPool.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {quickAddPool.map(pm => (
                <BtnGhost key={pm.userId} style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={async () => {
                    try { await onAdd(pm.userId); }
                    catch (err) { showToast(apiErrorMessage(err, 'Failed to add.')); }
                  }}>
                  + {pm.name || pm.email}
                </BtnGhost>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <UserSearchInput selectedUser={search} onSelect={setSearch}
              excludeUserIds={excludeUserIdsForSearch}
              placeholder="Search users to add…" />
            <BtnPrimary style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
              onClick={handleSearchAdd} disabled={!search}>
              Add
            </BtnPrimary>
          </div>
          {error && <div style={{ color: theme.colors.danger, fontSize: 11, marginBottom: 8 }}>{error}</div>}
        </>
      )}

      {loading && <div style={{ fontSize: 12, color: theme.colors.ash }}>Loading…</div>}
      {!loading && managers.map(m => (
        <MemberRow key={m.userId} selected style={{ marginBottom: 4 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx, flexShrink: 0 }}>{initials(m.name)}</div>
          <span style={{ flex: 1, minWidth: 60, fontSize: 12, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</span>
          {m.email && <span style={{ fontSize: 11, color: theme.colors.ash, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>{m.email}</span>}
          {canEdit && String(m.userId) !== String(myUserId) && (
            <BtnGhost style={{ fontSize: 11, padding: '2px 8px', color: theme.colors.danger, borderColor: 'rgba(168,93,77,.35)' }}
              onClick={() => onRemove(m.userId)}>Remove</BtnGhost>
          )}
        </MemberRow>
      ))}
      {!loading && managers.length === 0 && (
        <div style={{ fontSize: 12, color: theme.colors.ash, fontStyle: 'italic' }}>
          {hasUpperManagers ? `No ${levelLabel.toLowerCase()}-specific managers — the managers above have full authority here by default.` : `No one has ${title.toLowerCase()} access here yet.`}
        </div>
      )}
    </div>
  );
}
