import { useState } from 'react';
import { projectApi } from '../api/projectApi';
import UserSearchInput from './UserSearchInput';

const ROLES = ['Manager', 'Member', 'Viewer'];

function initials(name = '') {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function MemberManager({ projectId, members = [], onRefetch }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [addRole,      setAddRole]      = useState('Member');
  const [saving,       setSaving]       = useState(false);
  const [addError,     setAddError]     = useState('');
  const [roleErrors,   setRoleErrors]   = useState({});

  const existingIds = members.map(m => m.userId);

  const handleAdd = async () => {
    if (!selectedUser) { setAddError('Select a user from the dropdown first'); return; }
    setSaving(true); setAddError('');
    try {
      await projectApi.addMember(projectId, { userId: selectedUser.userId, role: addRole });
      setSelectedUser(null);
      onRefetch();
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to add member');
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (userId, role) => {
    setRoleErrors(e => ({ ...e, [userId]: '' }));
    try {
      await projectApi.updateMember(projectId, userId, { role });
      onRefetch();
    } catch (err) {
      setRoleErrors(e => ({ ...e, [userId]: err?.response?.data?.error || 'Failed to update role' }));
    }
  };

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this project?`)) return;
    setRoleErrors(e => ({ ...e, [userId]: '' }));
    try {
      await projectApi.removeMember(projectId, userId);
      onRefetch();
    } catch (err) {
      setRoleErrors(e => ({ ...e, [userId]: err?.response?.data?.error || 'Failed to remove member' }));
    }
  };

  return (
    <div>
      {/* ── Add member panel ── */}
      <div style={{
        background: '#fff', border: '1px solid var(--divider)',
        borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, fontWeight: 600 }}>
          Add Member
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <UserSearchInput
            selectedUser={selectedUser}
            onSelect={setSelectedUser}
            excludeUserIds={existingIds}
            placeholder="Search all users by name or email…"
          />
          <select
            value={addRole}
            onChange={e => setAddRole(e.target.value)}
            style={{
              background: '#fff', border: '1px solid var(--divider)',
              borderRadius: 'var(--radius)', color: 'var(--light)',
              fontSize: 12, padding: '7px 10px', flexShrink: 0, fontFamily: 'inherit', outline: 'none',
            }}
          >
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button
            className="pm-btn pm-btn-primary"
            onClick={handleAdd}
            disabled={saving || !selectedUser}
            style={{ flexShrink: 0 }}
          >
            {saving ? '…' : '+ Add'}
          </button>
        </div>
        {addError && (
          <div style={{ color: '#aa1010', fontSize: 12, marginTop: 6 }}>{addError}</div>
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          <strong>Roles:</strong> Manager = full access · Member = edit tasks/activities · Viewer = read-only
        </div>
      </div>

      {/* ── Members list ── */}
      {members.map(m => (
        <div key={m.userId} style={{
          background: '#fff', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius)', marginBottom: 8,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', background: 'var(--mid)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-display)', flexShrink: 0,
            }}>
              {initials(m.name || '')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--light)', fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email}</div>
            </div>
            <select
              value={m.role}
              onChange={e => handleRoleChange(m.userId, e.target.value)}
              style={{
                background: '#fff', border: '1px solid var(--divider)',
                borderRadius: 'var(--radius)', color: 'var(--light)',
                fontSize: 11, padding: '4px 8px', fontFamily: 'inherit', outline: 'none',
              }}
            >
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
            <button className="icon-btn danger" onClick={() => handleRemove(m.userId, m.name)} title="Remove member">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          {roleErrors[m.userId] && (
            <div style={{ color: '#aa1010', fontSize: 11, marginTop: 6, padding: '5px 8px', background: 'rgba(170,16,16,.05)', borderRadius: 4 }}>
              {roleErrors[m.userId]}
            </div>
          )}
        </div>
      ))}

      {members.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '30px 0' }}>
          No members yet. Add one above.
        </div>
      )}
    </div>
  );
}
