import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { ChevronRight, X, Folder } from 'lucide-react';
import { projectApi, phaseApi, activityApi } from '../api/projectApi';
import UserSearchInput from './UserSearchInput';
import { IconBtnDanger, BtnPrimary } from '../styles/shared.styles';

// 'Member' is no longer an addable project-level role and 'Employee' is no
// longer an addable Phase/Activity role — regular team members get access
// by being assigned to a Task (see ParticipantsPanel.js's Assignees
// section), not by being pre-added as a generic "member" anywhere. Viewer
// is project-only now (never settable at Phase/Activity — read-only access
// is project-wide by design, not scoped per level). These lists are what's
// OFFERABLE going forward; a legacy 'Member'/'Employee' row from before
// this redesign can still exist in the data and is handled by
// rolesForCurrentValue() below so it displays correctly without being a
// choice you can newly pick.
const PROJECT_ADD_ROLES = ['Manager', 'Viewer'];
const ENTITY_ADD_ROLES  = ['Manager']; // Phase / Activity — Manager only now
// rolesForCurrentValue — the select's option list needs to include
// whatever the row's CURRENT value already is, even if it's a legacy value
// no longer offered for NEW selections, or the browser shows nothing
// selected while the real value silently stays the old one.
function rolesForCurrentValue(allowed, current) {
  return current && !allowed.includes(current) ? [...allowed, current] : allowed;
}
const ENTITY_ROLE_LABEL = { Manager: 'Manager', Employee: 'Member (legacy)', Viewer: 'Viewer (legacy — now project-only)' };

// Mirrors roleService.js's RANK exactly — used only to detect when an
// explicit Phase/Activity override is a DOWNGRADE from someone's project
// role, so the UI can flag it instead of staying silent. This is the exact
// trap a project owner hit: a stale Activity-level "Member" override
// silently overrode their project-wide Manager role there, with nothing in
// the Members tab distinguishing "elevated override" from "downgraded
// override" — both just looked like a neutral role pill.
const RANK = { Viewer: 1, Employee: 2, Member: 2, Manager: 3 };
function isDowngrade(entityRole, projectRole) {
  if (!entityRole) return false; // "Inherited" — not an override at all
  return (RANK[entityRole] ?? 0) < (RANK[projectRole] ?? 0);
}

function initials(name = '') {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Role pill colors — theme-driven (module-level object can't call
// useTheme(), so this takes theme as a param).
function rolePill(theme, role) {
  const map = {
    Manager:  { bg: `${theme.colors.warning}24`, color: theme.colors.warning },
    Member:   { bg: `${theme.colors.success}24`, color: theme.colors.success },
    Employee: { bg: `${theme.colors.success}24`, color: theme.colors.success },
    Viewer:   { bg: `${theme.colors.ash}24`,     color: theme.colors.ash },
  };
  return map[role] || { bg: `${theme.colors.ash}24`, color: theme.colors.ash };
}

// ── Small inline role pill / editable select for a Phase or Activity row ──────
// downgrade — true when this explicit role is LOWER than the member's
// project-wide role: rendered in the danger color with a ⚠ prefix and an
// explanatory tooltip instead of the normal role color, so someone
// scanning the Members tab can actually SEE it rather than discover it
// only once something they expected to be able to do silently fails.
function EntityRolePill({ role, isManager, onChange, downgrade }) {
  const theme = useTheme();
  const pill = downgrade ? { bg: `${theme.colors.danger}1f`, color: theme.colors.danger } : rolePill(theme, role);
  const warnTitle = downgrade
    ? `⚠ Lower than their project role — this override REPLACES it here, it doesn't add to it.`
    : undefined;
  if (!isManager) {
    return (
      <span style={{ fontSize: 9, fontWeight: 700, color: pill.color, background: pill.bg, borderRadius: 8, padding: '1px 7px' }}
        title={warnTitle || (role ? undefined : 'No role set at this level — falls back to their role on the level above.')}>
        {downgrade && '⚠ '}{role ? ENTITY_ROLE_LABEL[role] : 'Inherited'}
      </span>
    );
  }
  return (
    <select
      value={role || ''}
      onChange={e => onChange(e.target.value || null)}
      onClick={e => e.stopPropagation()}
      title={warnTitle || 'Inherited = no explicit role here, falls back to the level above'}
      style={{ fontSize: 9, fontWeight: 700, color: pill.color, background: pill.bg, border: downgrade ? `1px solid ${theme.colors.danger}` : 'none', borderRadius: 8, padding: '1px 5px', fontFamily: 'inherit', outline: 'none' }}
    >
      <option value="">Inherited</option>
      {rolesForCurrentValue(ENTITY_ADD_ROLES, role).map(r => <option key={r} value={r}>{ENTITY_ROLE_LABEL[r]}</option>)}
    </select>
  );
}

// ── Hierarchical member card ─────────────────────────────────────────────────
// Each top-level card = one deduplicated user.
// Expanding shows which phases they're in (with their Phase role, if any is
// explicitly set), and within each phase, which activities (with their
// Activity role). A Manager can change either role inline, or clear it back
// to "Inherited" (removes the explicit row, falling back to the level above).

function MemberCard({ m, onRoleChange, onRemove, roleError, isManager, isSelf, onPhaseRoleChange, onActivityRoleChange }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const pill = rolePill(theme, m.projectRole);
  const hasPhases = m.phases?.length > 0;
  // Any downgrade anywhere in this member's overrides — surfaced on the
  // COLLAPSED card too (not just once expanded), since that's the only
  // view most people ever glance at.
  const hasDowngrade = (m.phases || []).some(ph =>
    isDowngrade(ph.phaseRole, m.projectRole) ||
    (ph.activities || []).some(act => isDowngrade(act.activityRole, m.projectRole))
  );

  return (
    <div style={{
      background: theme.colors.mid, border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radius.sm, marginBottom: 8,
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: hasPhases ? 'pointer' : 'default' }}
        onClick={() => hasPhases && setExpanded(v => !v)}>

        {/* Expand chevron */}
        <ChevronRight size={12} strokeWidth={2.5}
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: hasPhases ? theme.colors.ash : 'transparent', flexShrink: 0 }} />

        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: theme.colors.mid,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: theme.colors.onyx, flexShrink: 0,
        }}>
          {initials(m.name)}
        </div>

        {/* Name + email */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Both truncate — the parent is min-width:0 flex, but an email
              is a single unbreakable token that would still paint past the
              card edge without its own ellipsis. */}
          <div style={{ fontSize: 13, color: theme.colors.onyx, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</div>
          <div style={{ fontSize: 11, color: theme.colors.ash, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>{m.email}</div>
        </div>

        {/* Project role pill */}
        <span style={{ fontSize: 10, fontWeight: 700, color: pill.color, background: pill.bg, borderRadius: 10, padding: '2px 10px', flexShrink: 0 }}>
          {m.projectRole}
        </span>

        {/* Phase / activity summary — flagged red when one of the
            overrides underneath is a DOWNGRADE from their project role, so
            it's visible without expanding the card. This exact silent gap
            (an Activity-level "Member" override quietly beating a
            project-wide Manager role, with no visual difference from a
            harmless elevated override) is what caused a project owner to
            lose their own management controls with no indication why. */}
        {hasPhases && (
          <span
            style={{ fontSize: 10, color: hasDowngrade ? theme.colors.danger : theme.colors.ash, fontWeight: hasDowngrade ? 700 : 400, flexShrink: 0 }}
            title={hasDowngrade ? '⚠ One of these overrides is LOWER than their project role — expand to see which.' : undefined}
          >
            {hasDowngrade && '⚠ '}{m.phases.length} {m.phases.length === 1 ? 'phase' : 'phases'}
          </span>
        )}

        {/* Manager controls — stop propagation so clicks don't toggle expand */}
        {isManager && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <select value={m.projectRole} onChange={e => onRoleChange(m.userId, e.target.value)}
              style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, color: theme.colors.onyx, fontSize: 11, padding: '3px 7px', fontFamily: 'inherit', outline: 'none' }}>
              {rolesForCurrentValue(PROJECT_ADD_ROLES, m.projectRole).map(r => <option key={r}>{r === 'Member' ? 'Member (legacy)' : r}</option>)}
            </select>
            {/* Removing yourself would strip your own access with no way
                back in (short of another Manager re-adding you) — only an
                admin should be able to do that, not a self-service click. */}
            {!isSelf && (
              <IconBtnDanger onClick={() => onRemove(m.userId, m.name)} title="Remove member">
                <X size={13} strokeWidth={2.5} />
              </IconBtnDanger>
            )}
          </div>
        )}
      </div>

      {roleError && (
        <div style={{ color: theme.colors.danger, fontSize: 11, padding: '0 14px 10px 52px' }}>{roleError}</div>
      )}

      {/* Expanded: phase → activity hierarchy, each with its own role */}
      {expanded && hasPhases && (
        <div style={{ borderTop: `1px solid ${theme.colors.border}`, padding: '10px 14px 10px 52px' }}>
          {m.phases.map(ph => (
            <div key={ph.phaseId} style={{ marginBottom: 8 }}>
              {/* Phase row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Folder size={12} strokeWidth={2} color={theme.colors.ash} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: theme.colors.onyx, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ph.phaseName}>{ph.phaseName}</span>
                <EntityRolePill
                  role={ph.phaseRole}
                  isManager={isManager}
                  downgrade={isDowngrade(ph.phaseRole, m.projectRole)}
                  onChange={(role) => onPhaseRoleChange(ph.phaseId, m.userId, role)}
                />
                {ph.activities.length > 0 && (
                  <span style={{ fontSize: 10, color: theme.colors.ash }}>({ph.activities.length} {ph.activities.length === 1 ? 'activity' : 'activities'})</span>
                )}
              </div>
              {/* Activity chips, each with its own role */}
              {ph.activities.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 16 }}>
                  {ph.activities.map(act => (
                    <span key={act.activityId} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, color: theme.colors.ash, background: theme.colors.mid,
                      border: `1px solid ${theme.colors.border}`, borderRadius: 8, padding: '1px 8px',
                      maxWidth: '100%',
                    }}>
                      <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={act.activityName}>{act.activityName}</span>
                      <EntityRolePill
                        role={act.activityRole}
                        isManager={isManager}
                        downgrade={isDowngrade(act.activityRole, m.projectRole)}
                        onChange={(role) => onActivityRoleChange(act.activityId, m.userId, role)}
                      />
                    </span>
                  ))}
                </div>
              )}
              {ph.activities.length === 0 && (
                <span style={{ fontSize: 10, color: theme.colors.ash, paddingLeft: 16, fontStyle: 'italic' }}>
                  Phase member only
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main MemberManager ────────────────────────────────────────────────────────

export default function MemberManager({ projectId, members: flatMembers = [], myRole, myUserId, onRefetch }) {
  const theme = useTheme();
  const [hierarchy,  setHierarchy]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [addRole,    setAddRole]    = useState('Manager');
  const [saving,     setSaving]     = useState(false);
  const [addError,   setAddError]   = useState('');
  const [roleErrors, setRoleErrors] = useState({});
  const [search,     setSearch]     = useState('');

  const isManager = myRole === 'Manager';

  const fetchHierarchy = useCallback(async () => {
    setLoading(true);
    try { setHierarchy(await projectApi.getMembersHierarchy(projectId)); }
    catch { setHierarchy(null); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchHierarchy(); }, [fetchHierarchy]);

  const handleAdd = async () => {
    if (!selectedUser) { setAddError('Select a user first'); return; }
    setSaving(true); setAddError('');
    try {
      await projectApi.addMember(projectId, { userId: selectedUser.userId, role: addRole });
      setSelectedUser(null);
      onRefetch?.();
      fetchHierarchy();
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to add member');
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (userId, role) => {
    setRoleErrors(e => ({ ...e, [userId]: '' }));
    try {
      await projectApi.updateMember(projectId, userId, { role });
      onRefetch?.(); fetchHierarchy();
    } catch (err) {
      setRoleErrors(e => ({ ...e, [userId]: err?.response?.data?.error || 'Failed to update role' }));
    }
  };

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this project?`)) return;
    setRoleErrors(e => ({ ...e, [userId]: '' }));
    try {
      await projectApi.removeMember(projectId, userId);
      onRefetch?.(); fetchHierarchy();
    } catch (err) {
      setRoleErrors(e => ({ ...e, [userId]: err?.response?.data?.error || 'Failed to remove member' }));
    }
  };

  // Setting role to null removes the explicit row (falls back to inherited access).
  const handlePhaseRoleChange = async (phaseId, userId, role) => {
    try {
      if (role) await phaseApi.addMember(phaseId, userId, role);
      else await phaseApi.removeMember(phaseId, userId);
      fetchHierarchy();
    } catch (err) {
      setRoleErrors(e => ({ ...e, [userId]: err?.response?.data?.error || 'Failed to update phase role' }));
    }
  };

  const handleActivityRoleChange = async (activityId, userId, role) => {
    try {
      if (role) await activityApi.addMember(activityId, userId, role);
      else await activityApi.removeMember(activityId, userId);
      fetchHierarchy();
    } catch (err) {
      setRoleErrors(e => ({ ...e, [userId]: err?.response?.data?.error || 'Failed to update activity role' }));
    }
  };

  // Source for the list: use hierarchy if loaded, fall back to flat list with empty phases
  const membersToShow = (hierarchy || flatMembers.map(m => ({ ...m, projectRole: m.role, phases: [] })))
    .filter(m => !search.trim() || (m.name || '').toLowerCase().includes(search.toLowerCase()) || (m.email || '').toLowerCase().includes(search.toLowerCase()));

  const existingIds = (hierarchy || flatMembers).map(m => m.userId);

  return (
    <div>
      {/* ── How access works — always visible, not buried inside the
          manager-only Add panel, since Viewers need to understand their own
          access just as much. ── */}
      <div style={{
        background: 'rgba(46, 40, 35, 0.05)', border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.lg, padding: '12px 16px', marginBottom: 16, fontSize: 11.5, color: theme.colors.ash, lineHeight: 1.6,
      }}>
        <strong style={{ color: theme.colors.onyx }}>How project access works:</strong> there are only three ways to have access to a project — no generic
        "member" list to manage.
        <br/>
        <span style={{ display: 'block', marginTop: 6 }}>
          <strong>1. Managers</strong> — added below, or directly on any Phase/Activity card. A Project Manager has full authority everywhere under
          this project by default; a Phase or Activity can be given its own separate Manager instead (someone who doesn't need to manage the whole project).
        </span>
        <span style={{ display: 'block', marginTop: 4 }}>
          <strong>2. Assignees</strong> — anyone assigned to a Task shows up automatically as an Assignee on that Task's Activity, and rolls up to its
          Phase and this project too. This is how regular team members get access — there's nothing to add here for them, assign them a task instead.
        </span>
        <span style={{ display: 'block', marginTop: 4 }}>
          <strong>3. Viewers</strong> — read-only, added only here at the project level (not per Phase/Activity), and visible everywhere under this
          project once added.
        </span>
      </div>

      {/* ── Add member panel (manager only) ── */}
      {isManager && (
        <div style={{
          background: theme.colors.mid, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.lg, padding: '16px 18px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3, fontWeight: 600 }}>
            Add a Manager or Viewer
          </div>
          <div style={{ fontSize: 11, color: theme.colors.ash, marginBottom: 10 }}>
            <strong>Manager</strong> gets full management of this project (and, by default, everything under it — every Phase and Activity, unless a
            different explicit Manager is set there). <strong>Viewer</strong> gets read-only access everywhere in this project. To scope someone to just
            one Phase or Activity as a Manager instead, don't add them here — use that Phase/Activity's own "+ Participants" panel. Regular team members
            don't get added here at all — they get access by being assigned to a Task, which shows up automatically as an Assignee wherever that task lives.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <UserSearchInput selectedUser={selectedUser} onSelect={setSelectedUser}
              excludeUserIds={existingIds} placeholder="Search all users by name or email…" />
            <select value={addRole} onChange={e => setAddRole(e.target.value)}
              style={{ background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, color: theme.colors.onyx, fontSize: 12, padding: '7px 10px', flexShrink: 0, fontFamily: 'inherit', outline: 'none' }}>
              {PROJECT_ADD_ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
            <BtnPrimary onClick={handleAdd} disabled={saving || !selectedUser} style={{ flexShrink: 0 }}>
              {saving ? '…' : '+ Add'}
            </BtnPrimary>
          </div>
          {addError && <div style={{ color: theme.colors.danger, fontSize: 12, marginTop: 6 }}>{addError}</div>}
        </div>
      )}

      {/* ── Search filter ── */}
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter members…"
          style={{ width: '100%', background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 12px', color: theme.colors.onyx, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* ── Summary ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, color: theme.colors.ash }}>
        {['Manager', 'Member', 'Viewer'].map(role => {
          const count = membersToShow.filter(m => m.projectRole === role).length;
          if (!count) return null;
          const pill = rolePill(theme, role);
          return (
            <span key={role} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontWeight: 700, color: pill.color, background: pill.bg, borderRadius: 8, padding: '1px 8px', fontSize: 10 }}>{role}</span>
              {count}
            </span>
          );
        })}
      </div>

      {/* ── Member cards ── */}
      {loading && <div style={{ color: theme.colors.ash, fontSize: 13, padding: '12px 0' }}>Loading members…</div>}
      {!loading && membersToShow.map(m => (
        <MemberCard
          key={m.userId}
          m={m}
          isManager={isManager}
          isSelf={String(m.userId) === String(myUserId)}
          roleError={roleErrors[m.userId]}
          onRoleChange={handleRoleChange}
          onRemove={handleRemove}
          onPhaseRoleChange={handlePhaseRoleChange}
          onActivityRoleChange={handleActivityRoleChange}
        />
      ))}
      {!loading && membersToShow.length === 0 && (
        <div style={{ fontSize: 13, color: theme.colors.ash, textAlign: 'center', padding: '30px 0' }}>
          {search ? 'No members match your search.' : 'No members yet. Add one above.'}
        </div>
      )}
    </div>
  );
}
