import { useState, useEffect, useRef, useCallback } from 'react';
import { userApi } from '../api/projectApi';

function initials(name = '') {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * UserSearchInput — shared component.
 * Searches ALL org users (not just project members).
 * Props:
 *   selectedUser     — currently chosen user object or null
 *   onSelect(user)   — called when user picks from list (or null when cleared)
 *   excludeUserIds   — array of userIds to hide from results
 *   placeholder      — input placeholder
 *   style            — extra style on wrapper
 */
export default function UserSearchInput({ selectedUser, onSelect, excludeUserIds = [], placeholder = 'Search by name or email…', style }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);

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
      const data = await userApi.search(q, 12);
      const all  = data.users || data || [];
      setResults(all.filter(u => !excludeUserIds.includes(u.userId)));
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [excludeUserIds]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (selectedUser) onSelect(null);
    clearTimeout(debounceRef.current);
    if (val.trim().length >= 1) {
      debounceRef.current = setTimeout(() => search(val.trim()), 220);
    } else {
      setResults([]); setOpen(false);
    }
  };

  const handleFocus = () => {
    if (!query && !selectedUser) search('');
  };

  const handlePick = (user) => {
    onSelect(user);
    setQuery(`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email);
    setOpen(false);
    setResults([]);
  };

  const displayVal = selectedUser
    ? (`${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || selectedUser.email)
    : query;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, ...style }}>
      <input
        value={displayVal}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: '100%', background: '#fff', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius)', padding: '7px 10px', color: 'var(--light)',
          fontSize: 12, outline: 'none', fontFamily: 'inherit',
          borderColor: selectedUser ? 'var(--gold)' : 'var(--divider)',
          transition: 'border-color 0.15s',
        }}
      />
      {/* Clear button when user selected */}
      {selectedUser && (
        <button
          onMouseDown={() => { onSelect(null); setQuery(''); }}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
            fontSize: 14, lineHeight: 1, padding: '0 2px',
          }}
          title="Clear"
        >✕</button>
      )}
      {open && (loading || results.length > 0) && (
        <div className="pm-user-dropdown">
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>Searching…</div>
          )}
          {!loading && results.map(u => {
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
            return (
              <div key={u.userId} className="pm-user-option" onMouseDown={() => handlePick(u)}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: 'var(--mid)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--gold)', flexShrink: 0,
                  fontFamily: 'var(--font-display)',
                }}>
                  {initials(name || u.email)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--light)', fontWeight: 500 }}>{name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                </div>
              </div>
            );
          })}
          {!loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>No users found.</div>
          )}
        </div>
      )}
    </div>
  );
}
