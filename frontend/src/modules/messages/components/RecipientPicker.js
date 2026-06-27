import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axiosInstance';

export default function RecipientPicker({ value = [], onChange, groups = [] }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropRect, setDropRect] = useState(null);
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  const searchUsers = async (q) => {
    if (!q.trim()) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await api.get('/api/users/search', { params: { q, limit: 10 } });
      const users = (res.data.users || res.data || []).map(u => ({
        id: u.userId || u.id,
        label: `${u.firstName} ${u.lastName}`.trim(),
        sub: u.email || u.department || '',
        type: 'user',
        isSuper: Boolean(u.isSuperAdmin || u.is_super_admin || u.role === 'super_admin' || u.user_type === 'admin'),
      }));
      const filteredUsers = users.filter(u => !u.isSuper);
      const groupMatches = groups
        .filter(g => g.groupName.toLowerCase().includes(q.toLowerCase()))
        .map(g => ({ id: g.groupId, label: g.groupName, sub: 'Group', type: 'group' }));
      setSuggestions([...groupMatches, ...filteredUsers]);
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
  }, [query]); // eslint-disable-line

  const computeDropRect = () => {
    if (boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target) && !boxRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Recompute position on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    computeDropRect();
    const h = () => computeDropRect();
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => {
      window.removeEventListener('scroll', h, true);
      window.removeEventListener('resize', h);
    };
  }, [open]);

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

  const hasDrop = open && (loading || suggestions.length > 0 || query.trim());

  const dropdown = hasDrop && dropRect ? createPortal(
    <div
      ref={dropRef}
      className="dropdown"
      style={{
        position:  'fixed',
        top:       dropRect.top,
        left:      dropRect.left,
        width:     dropRect.width,
        zIndex:    99999,
        maxHeight: 260,
        overflowY: 'auto',
      }}
    >
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
    </div>,
    document.body
  ) : null;

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
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
          onChange={e => { setQuery(e.target.value); setOpen(true); computeDropRect(); }}
          onFocus={() => { setOpen(true); computeDropRect(); }}
        />
      </div>
      {dropdown}
    </div>
  );
}