import { useState } from 'react';
import { groupApi } from '../api/groupApi';

/**
 * GroupManager
 * Props:
 *   groups   — from useGroups
 *   loading
 *   onCreate(name)
 *   onDelete(groupId)
 *   onRefetch()
 */
export default function GroupManager({ groups = [], loading, onCreate, onDelete, onRefetch }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [managingGroup, setManagingGroup] = useState(null); // { groupId, groupName }
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Group name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onCreate(newName.trim());
      setNewName('');
      setCreating(false);
    } catch {
      setError('Failed to create group. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const openManage = async (group) => {
    setManagingGroup(group);
    setMembersLoading(true);
    try {
      const data = await groupApi.getMembers(group.groupId);
      setMembers(data || []);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    await groupApi.removeMember(managingGroup.groupId, userId);
    setMembers(prev => prev.filter(m => m.userId !== userId));
  };

  if (managingGroup) {
    return (
      <div className="groups-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            className="icon-btn msg-back-btn"
            onClick={() => setManagingGroup(null)}
            aria-label="Back to groups"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
          </button>
          <h3 style={{ margin: 0 }}>{managingGroup.groupName}</h3>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Members ({members.length})
        </div>

        {membersLoading && <div className="loader-wrap"><div className="spinner" /></div>}

        {!membersLoading && members.map(m => (
          <div key={m.userId} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px',
            background: 'var(--charcoal)',
            border: '1px solid var(--divider)',
            borderRadius: 'var(--radius)',
            marginBottom: 8,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: 'var(--mid)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: 'var(--gold)',
              fontFamily: 'var(--font-display)',
            }}>
              {`${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--light)' }}>{m.firstName} {m.lastName}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email || m.department || ''}</div>
            </div>
            <button
              className="icon-btn danger"
              title="Remove from group"
              onClick={() => handleRemoveMember(m.userId)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}

        {!membersLoading && members.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No members in this group yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="groups-panel">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Recipient Groups</h3>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto', padding: '7px 16px', fontSize: 12 }}
          onClick={() => setCreating(true)}
        >
          + New Group
        </button>
      </div>

      {creating && (
        <div style={{
          background: 'var(--charcoal)', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16,
        }}>
          <label className="field-label">Group Name</label>
          <input
            className="field-input"
            style={{ marginBottom: 10 }}
            placeholder="e.g. Operations Team"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewName(''); setError(''); }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {loading && <div className="loader-wrap"><div className="spinner" /></div>}

      {!loading && groups.length === 0 && (
        <div className="msg-empty" style={{ padding: '40px 0' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <p>No groups yet. Create one to quickly message a team.</p>
        </div>
      )}

      {groups.map(g => (
        <div key={g.groupId} className="group-card">
          <div className="group-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className="group-info">
            <div className="group-name">{g.groupName}</div>
            <div className="group-count">{g.memberCount ?? 0} member{g.memberCount !== 1 ? 's' : ''}</div>
          </div>
          <div className="group-actions">
            <button className="icon-btn" title="Manage members" onClick={() => openManage(g)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </button>
            <button
              className="icon-btn danger"
              title="Delete group"
              onClick={() => {
                if (window.confirm(`Delete group "${g.groupName}"? Past messages are preserved.`)) {
                  onDelete(g.groupId);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}