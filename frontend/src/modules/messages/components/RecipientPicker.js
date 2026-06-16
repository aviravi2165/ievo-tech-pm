import { useState, useEffect, useRef } from 'react';
import api from '../api/axiosInstance';


export default function RecipientPicker({ value = [], onChange, groups = [] }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const debounceRef = useRef(null);

  // Search users via ERP users endpoint
  const searchUsers = async (q) => {
    if (!q.trim()) { setSuggestions([]); return; }
    setLoading(true);
    try {
      // Adjust endpoint to match your ERP user search route
      const res = await api.get('/api/users/search', { params: { q, limit: 10 } });
      const users = (res.data.users || res.data || []).map(u => ({
        id: u.userId || u.id,
        label: `${u.firstName} ${u.lastName}`.trim(),
        sub: u.email || u.department || '',
        type: 'user',
      }));
      const groupMatches = groups
        .filter(g => g.groupName.toLowerCase().includes(q.toLowerCase()))
        .map(g => ({ id: g.groupId, label: g.groupName, sub: 'Group', type: 'group' }));
      setSuggestions([...groupMatches, ...users]);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(query), 280);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addRecipient = (item) => {
    if (!value.find(v => v.id === item.id)) {
      onChange([...value, item]);
    }
    setQuery('');
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const removeRecipient = (id) => {
    onChange(value.filter(v => v.id !== id));
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="recipient-box"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(v => (
          <span key={v.id} className="recipient-chip">
            {v.type === 'group' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            )}
            {v.label}
            <button
              className="recipient-chip-remove"
              onClick={(e) => { e.stopPropagation(); removeRecipient(v.id); }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="recipient-input"
          placeholder={value.length === 0 ? 'Search users or groups…' : ''}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (query.trim() || suggestions.length > 0) && (
        <div ref={dropRef} className="dropdown">
          {loading && (
            <div className="dropdown-item" style={{ color: 'var(--muted)' }}>Searching…</div>
          )}
          {!loading && suggestions.length === 0 && query.trim() && (
            <div className="dropdown-item" style={{ color: 'var(--muted)' }}>No results for "{query}"</div>
          )}
          {suggestions.map(s => (
            <div
              key={s.id}
              className="dropdown-item"
              onMouseDown={(e) => { e.preventDefault(); addRecipient(s); setOpen(false); }}
            >
              {s.type === 'group'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--subtle)" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
              }
              <div>
                <div style={{ color: 'var(--light)', fontSize: 13 }}>{s.label}</div>
                {s.sub && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}