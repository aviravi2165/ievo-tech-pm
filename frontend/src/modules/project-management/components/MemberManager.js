import { useState, useEffect, useRef, useCallback } from 'react';
import { projectApi } from '../api/projectApi';
import axiosInstance from '../../messages/api/axiosInstance';

const ROLES = ['Manager', 'Member', 'Viewer'];

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/**
 * UserSearchInput — type to search users by name/email, pick from dropdown.
 * Calls the existing /api/users/search endpoint used by RecipientPicker.
 */
function UserSearchInput({ selectedUser, onSelect, excludeUserIds = [] }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q) => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.get(`/api/users/search?q=${encodeURIComponent(q)}&limit=10`);
      const users = (data.users || []).filter(u => !excludeUserIds.includes(u.userId));
      setResults(users);
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [excludeUserIds]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    // Clear selected when user starts typing again
    if (selectedUser) onSelect(null);

    clearTimeout(debounceRef.current);
    if (val.trim().length >= 1) {
      debounceRef.current = setTimeout(() => search(val.trim()), 250);
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  const handleFocus = () => {
    if (!query && results.length === 0) search('');
  };

  const handlePick = (user) => {
    onSelect(user);
    setQuery(`${user.firstName} ${user.lastName}`.trim() || user.email);
    setOpen(false);
    setResults([]);
  };

  const displayVal = selectedUser
    ? (`${selectedUser.firstName} ${selectedUser.lastName}`.trim() || selectedUser.email)
    : query;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input
        value={displayVal}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder="Search by name or email…"
        autoComplete="off"
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)',
          fontSize: 12, outline: 'none',
          borderColor: selectedUser ? 'var(--gold-dim)' : 'var(--divider)',
        }}
      />
      {open && (results.length > 0 || loading) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius)', marginTop: 3,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)', maxHeight: 220, overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>Searching…</div>
          )}
          {!loading && results.map(u => (
            <div
              key={u.userId}
              onMouseDown={() => handlePick(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--charcoal)'}
              onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'var(--gold)', flexShrink: 0,
              }}>
                {initials(`${u.firstName} ${u.lastName}`)}
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--light)' }}>
                  {`${u.firstName} ${u.lastName}`.trim()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
              </div>
            </div>
          ))}
          {!loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>No users found.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MemberManager({ projectId, members = [], onRefetch }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [addRole,      setAddRole]      = useState('Member');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  const existingIds = members.map(m => m.userId);

  const handleAdd = async () => {
    if (!selectedUser) { setError('Select a user from the dropdown'); return; }
    setSaving(true); setError('');
    try {
      await projectApi.addMember(projectId, { userId: selectedUser.userId, role: addRole });
      setSelectedUser(null);
      onRefetch();
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
      {/* Add member — search input */}
      <div style={{
        background: 'var(--charcoal)', border: '1px solid var(--divider)',
        borderRadius: 'var(--radius-lg)', padding: 14, marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Add Member
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <UserSearchInput
            selectedUser={selectedUser}
            onSelect={setSelectedUser}
            excludeUserIds={existingIds}
          />
          <select
            value={addRole}
            onChange={e => setAddRole(e.target.value)}
            style={{
              background: 'var(--bg)', border: '1px solid var(--divider)',
              borderRadius: 'var(--radius)', color: 'var(--light)',
              fontSize: 12, padding: '7px 10px', flexShrink: 0,
            }}
          >
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button
            className="pm-btn pm-btn-primary"
            onClick={handleAdd}
            disabled={saving || !selectedUser}
            style={{ padding: '7px 14px', flexShrink: 0 }}
          >
            {saving ? '…' : '+ Add'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Type a name or email to search. Select from the list, then choose a role.
        </div>
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
          }}>
            {initials(m.name || '')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--light)' }}>{m.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email}</div>
          </div>
          <select
            value={m.role}
            onChange={e => handleRoleChange(m.userId, e.target.value)}
            style={{
              background: 'var(--bg)', border: '1px solid var(--divider)',
              borderRadius: 'var(--radius)', color: 'var(--light)', fontSize: 11, padding: '3px 8px',
            }}
          >
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button className="icon-btn danger" onClick={() => handleRemove(m.userId, m.name)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}

      {members.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
          No members yet.
        </div>
      )}
    </div>
  );
}