import { useState } from 'react';
import { projectApi } from '../api/projectApi';

const ROLES = ['Manager', 'Member', 'Viewer'];

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export default function MemberManager({ projectId, members = [], onRefetch }) {
  const [addId,    setAddId]    = useState('');
  const [addRole,  setAddRole]  = useState('Member');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const handleAdd = async () => {
    if (!addId.trim()) { setError('Enter a user ID'); return; }
    setSaving(true); setError('');
    try {
      await projectApi.addMember(projectId, { userId: addId.trim(), role: addRole });
      setAddId(''); onRefetch();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to add member');
    } finally { setSaving(false); }
  };

  const handleRoleChange = async (userId, role) => {
    try { await projectApi.updateMember(projectId, userId, { role }); onRefetch(); } catch { /**/ }
  };

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this project?`)) return;
    try { await projectApi.removeMember(projectId, userId); onRefetch(); } catch { /**/ }
  };

  return (
    <div>
      {/* Add member */}
      <div style={{ background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius-lg)', padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Add Member</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={addId} onChange={e => setAddId(e.target.value)} placeholder="User ID (UUID)"
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)', fontSize: 12 }} />
          <select value={addRole} onChange={e => setAddRole(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 12, padding: '7px 10px' }}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button className="pm-btn pm-btn-primary" onClick={handleAdd} disabled={saving} style={{ padding: '7px 14px' }}>
            {saving ? '…' : '+ Add'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </div>

      {/* Members list */}
      {members.map(m => (
        <div key={m.userId} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', background: 'var(--charcoal)',
          border: '1px solid var(--divider)', borderRadius: 'var(--radius)', marginBottom: 8,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-display)',
          }}>{initials(m.name || '')}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--light)' }}>{m.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email}</div>
          </div>
          <select value={m.role} onChange={e => handleRoleChange(m.userId, e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '3px 8px' }}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button className="icon-btn danger" onClick={() => handleRemove(m.userId, m.name)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
