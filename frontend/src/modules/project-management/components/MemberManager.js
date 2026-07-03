import { useState, useEffect, useCallback } from 'react';
import { projectApi } from '../api/projectApi';
import UserSearchInput from './UserSearchInput';

const ROLES = ['Manager', 'Member', 'Viewer'];

function initials(name = '') {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const ROLE_PILL = {
  Manager: { bg: '#fff4dc', color: '#8a5a00' },
  Member:  { bg: '#e8f5e9', color: '#1a5e2a' },
  Viewer:  { bg: '#f0f0f0', color: '#555'     },
};

// ── Hierarchical member card ─────────────────────────────────────────────────
// Each top-level card = one deduplicated user.
// Expanding shows which phases they're in, and within each phase, which activities.

function MemberCard({ m, onRoleChange, onRemove, roleError, isManager }) {
  const [expanded, setExpanded] = useState(false);
  const pill = ROLE_PILL[m.projectRole] || ROLE_PILL.Member;
  const hasPhases = m.phases?.length > 0;

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--divider)',
      borderRadius: 'var(--radius)', marginBottom: 8,
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: hasPhases ? 'pointer' : 'default' }}
        onClick={() => hasPhases && setExpanded(v => !v)}>

        {/* Expand chevron */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: hasPhases ? 'var(--muted)' : 'transparent', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: 'var(--mid)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'var(--gold)', flexShrink: 0,
        }}>
          {initials(m.name)}
        </div>

        {/* Name + email */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--light)', fontWeight: 500 }}>{m.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email}</div>
        </div>

        {/* Project role pill */}
        <span style={{ fontSize: 10, fontWeight: 700, color: pill.color, background: pill.bg, borderRadius: 10, padding: '2px 10px', flexShrink: 0 }}>
          {m.projectRole}
        </span>

        {/* Phase / activity summary */}
        {hasPhases && (
          <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
            {m.phases.length} {m.phases.length === 1 ? 'phase' : 'phases'}
          </span>
        )}

        {/* Manager controls — stop propagation so clicks don't toggle expand */}
        {isManager && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <select value={m.projectRole} onChange={e => onRoleChange(m.userId, e.target.value)}
              style={{ background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '3px 7px', fontFamily: 'inherit', outline: 'none' }}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
            <button className="icon-btn danger" onClick={() => onRemove(m.userId, m.name)} title="Remove member">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {roleError && (
        <div style={{ color: '#aa1010', fontSize: 11, padding: '0 14px 10px 52px' }}>{roleError}</div>
      )}

      {/* Expanded: phase → activity hierarchy */}
      {expanded && hasPhases && (
        <div style={{ borderTop: '1px solid var(--divider)', padding: '10px 14px 10px 52px' }}>
          {m.phases.map(ph => (
            <div key={ph.phaseId} style={{ marginBottom: 8 }}>
              {/* Phase row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
                <span style={{ fontSize: 12, color: 'var(--light)', fontWeight: 600 }}>{ph.phaseName}</span>
                {ph.activities.length > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>({ph.activities.length} {ph.activities.length === 1 ? 'activity' : 'activities'})</span>
                )}
              </div>
              {/* Activity chips */}
              {ph.activities.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 16 }}>
                  {ph.activities.map(act => (
                    <span key={act.activityId} style={{
                      fontSize: 10, color: 'var(--muted)', background: 'var(--mid)',
                      border: '1px solid var(--divider)', borderRadius: 8, padding: '1px 8px',
                    }}>
                      {act.activityName}
                    </span>
                  ))}
                </div>
              )}
              {ph.activities.length === 0 && (
                <span style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 16, fontStyle: 'italic' }}>
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

export default function MemberManager({ projectId, members: flatMembers = [], myRole, onRefetch }) {
  const [hierarchy,  setHierarchy]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [addRole,    setAddRole]    = useState('Member');
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

  // Source for the list: use hierarchy if loaded, fall back to flat list with empty phases
  const membersToShow = (hierarchy || flatMembers.map(m => ({ ...m, projectRole: m.role, phases: [] })))
    .filter(m => !search.trim() || (m.name || '').toLowerCase().includes(search.toLowerCase()) || (m.email || '').toLowerCase().includes(search.toLowerCase()));

  const existingIds = (hierarchy || flatMembers).map(m => m.userId);

  return (
    <div>
      {/* ── Add member panel (manager only) ── */}
      {isManager && (
        <div style={{
          background: '#fff', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, fontWeight: 600 }}>
            Add Member
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <UserSearchInput selectedUser={selectedUser} onSelect={setSelectedUser}
              excludeUserIds={existingIds} placeholder="Search all users by name or email…" />
            <select value={addRole} onChange={e => setAddRole(e.target.value)}
              style={{ background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 12, padding: '7px 10px', flexShrink: 0, fontFamily: 'inherit', outline: 'none' }}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
            <button className="pm-btn pm-btn-primary" onClick={handleAdd} disabled={saving || !selectedUser} style={{ flexShrink: 0 }}>
              {saving ? '…' : '+ Add'}
            </button>
          </div>
          {addError && <div style={{ color: '#aa1010', fontSize: 12, marginTop: 6 }}>{addError}</div>}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            <strong>Roles:</strong> Manager = full project access · Member = edit assigned tasks · Viewer = read-only<br/>
            Expand any member card to see which phases and activities they belong to.
          </div>
        </div>
      )}

      {/* ── Search filter ── */}
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter members…"
          style={{ width: '100%', background: '#fff', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '7px 12px', color: 'var(--light)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* ── Summary ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, color: 'var(--muted)' }}>
        {['Manager', 'Member', 'Viewer'].map(role => {
          const count = membersToShow.filter(m => m.projectRole === role).length;
          if (!count) return null;
          const pill = ROLE_PILL[role];
          return (
            <span key={role} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontWeight: 700, color: pill.color, background: pill.bg, borderRadius: 8, padding: '1px 8px', fontSize: 10 }}>{role}</span>
              {count}
            </span>
          );
        })}
      </div>

      {/* ── Member cards ── */}
      {loading && <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Loading members…</div>}
      {!loading && membersToShow.map(m => (
        <MemberCard
          key={m.userId}
          m={m}
          isManager={isManager}
          roleError={roleErrors[m.userId]}
          onRoleChange={handleRoleChange}
          onRemove={handleRemove}
        />
      ))}
      {!loading && membersToShow.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '30px 0' }}>
          {search ? 'No members match your search.' : 'No members yet. Add one above.'}
        </div>
      )}
    </div>
  );
}