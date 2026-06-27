import { useState, useEffect, useCallback, useRef } from 'react';
import { userApi } from './userApi';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const USER_TYPES = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager',  label: 'Manager'  },
  { value: 'admin',    label: 'Admin'    },
];

const EMPTY_FORM = {
  username:           '',
  firstName:          '',
  lastName:           '',
  email:              '',
  phoneNumber:        '',
  employeeCode:       '',
  userType:           'employee',
  deptId:             '',
  level:              '',
  mgrUserId:          '',
  mgrName:            '',   // display only
  isActive:           true,
  mustChangePassword: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
        color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}{required && <span style={{ color: '#e31b23', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: '#999', marginTop: 3 }}>{hint}</p>}
    </div>
  );
}

const INPUT = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid #d0d5dd', borderRadius: 6, boxSizing: 'border-box',
  background: '#fff', color: '#222', outline: 'none',
};

const CHECKBOX_ROW = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#333', cursor: 'pointer' };

// ─────────────────────────────────────────────────────────────────────────────
// ManagerPicker — searches existing users as manager
// ─────────────────────────────────────────────────────────────────────────────

function ManagerPicker({ value, displayName, onChange }) {
  const [query,    setQuery]    = useState(displayName || '');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  // Sync display when parent resets
  useEffect(() => { setQuery(displayName || ''); }, [displayName]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q) => {
    setQuery(q);
    clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); setOpen(false); onChange('', ''); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await userApi.search(q, 10);
        setResults(users);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const pick = (u) => {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username;
    setQuery(name);
    setResults([]);
    setOpen(false);
    onChange(u.userId, name);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={INPUT}
        value={query}
        onChange={e => search(e.target.value)}
        placeholder="Search by name or email…"
      />
      {loading && (
        <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 11, color: '#999' }}>…</span>
      )}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 9999, top: '100%', left: 0, right: 0,
          background: '#fff', border: '1px solid #d0d5dd', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto',
        }}>
          {results.map(u => (
            <div key={u.userId}
              onClick={() => pick(u)}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: '#222',
                borderBottom: '1px solid #f0f0f0' }}
              onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'}
              onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
            >
              <strong>{`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username}</strong>
              {u.email && <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>{u.email}</span>}
            </div>
          ))}
        </div>
      )}
      {value && (
        <button type="button" onClick={() => { setQuery(''); onChange('', ''); }}
          style={{ position: 'absolute', right: 8, top: 8, background: 'none',
            border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
          ×
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UserForm — shared for both Register and Edit
// ─────────────────────────────────────────────────────────────────────────────

function UserForm({ form, onChange, departments, onSubmit, submitLabel, loading, error, success, isEdit, onRegisterAnother }) {
  const set = (field, value) => onChange({ ...form, [field]: value });

  return (
    <form onSubmit={onSubmit} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>

        {/* USERNAME */}
        <Field label="Username" required>
          <input style={INPUT} value={form.username}
            onChange={e => set('username', e.target.value)}
            placeholder="e.g. jsmith"
            disabled={isEdit} // username shouldn't change once set
          />
          {isEdit && <p style={{ fontSize: 11, color: '#999', marginTop: 3 }}>Username cannot be changed after creation.</p>}
        </Field>

        {/* USER TYPE */}
        <Field label="User Type" required>
          <select style={INPUT} value={form.userType} onChange={e => set('userType', e.target.value)}>
            {USER_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>

        {/* FIRST NAME */}
        <Field label="First Name" required={!isEdit}>
          <input style={INPUT} value={form.firstName}
            onChange={e => set('firstName', e.target.value)}
            placeholder="First name" />
        </Field>

        {/* LAST NAME */}
        <Field label="Last Name">
          <input style={INPUT} value={form.lastName}
            onChange={e => set('lastName', e.target.value)}
            placeholder="Last name" />
        </Field>

        {/* EMAIL */}
        <Field label="Email" required={!isEdit}>
          <input style={INPUT} type="email" value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="email@company.com"
            required={!isEdit} />
        </Field>

        {/* PHONE */}
        <Field label="Phone Number">
          <input style={INPUT} value={form.phoneNumber}
            onChange={e => set('phoneNumber', e.target.value)}
            placeholder="+91 98765 43210" />
        </Field>

        {/* EMPLOYEE CODE */}
        <Field label="Employee Code">
          <input style={INPUT} value={form.employeeCode}
            onChange={e => set('employeeCode', e.target.value)}
            placeholder="EMP-001" />
        </Field>

        {/* DEPARTMENT */}
        <Field label="Department">
          <select style={INPUT} value={form.deptId}
            onChange={e => set('deptId', e.target.value || '')}>
            <option value="">— None —</option>
            {departments.map(d => (
              <option key={d.deptId} value={d.deptId}>{d.deptName}</option>
            ))}
          </select>
        </Field>

        {/* LEVEL */}
        <Field label="Level" hint="Numeric seniority level (optional)">
          <input style={INPUT} type="number" min="0" value={form.level}
            onChange={e => set('level', e.target.value)}
            placeholder="e.g. 3" />
        </Field>

        {/* MANAGER */}
        <Field label="Manager" hint="Leave blank if no direct manager">
          <ManagerPicker
            value={form.mgrUserId}
            displayName={form.mgrName}
            onChange={(id, name) => onChange({ ...form, mgrUserId: id, mgrName: name })}
          />
        </Field>
      </div>

      {/* Booleans — full width */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, marginTop: 4 }}>
        <label style={CHECKBOX_ROW}>
          <input type="checkbox" checked={!!form.isActive}
            onChange={e => set('isActive', e.target.checked)} />
          Is Active
        </label>
        <label style={CHECKBOX_ROW}>
          <input type="checkbox" checked={!!form.mustChangePassword}
            onChange={e => set('mustChangePassword', e.target.checked)} />
          Must Change Password on Next Login
        </label>
      </div>

      {!isEdit && (
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14, background: '#fafafa',
          border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 12px' }}>
          A temporary password will be generated and emailed to the user automatically.
          They will be required to change it on first login.
        </p>
      )}

      {error   && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{success}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
        {onRegisterAnother && (
          <button type="button" onClick={onRegisterAnother}
            style={{ padding: '9px 22px', background: '#fff', color: '#e31b23',
              border: '2px solid #e31b23', borderRadius: 6, fontWeight: 600,
              fontSize: 14, cursor: 'pointer' }}>
            + Register Another User
          </button>
        )}
        <button type="submit" disabled={loading || !!onRegisterAnother}
          style={{ padding: '9px 22px',
            background: onRegisterAnother ? '#ccc' : '#e31b23',
            color: '#fff', border: 'none', borderRadius: 6,
            fontWeight: 600, fontSize: 14,
            cursor: onRegisterAnother ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main modal
// ─────────────────────────────────────────────────────────────────────────────

export default function UserManagementModal({ open, defaultTab = 'register', onClose }) {
  const [tab,          setTab]          = useState(defaultTab);
  const [departments,  setDepartments]  = useState([]);
  const [users,        setUsers]        = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch,   setUserSearch]   = useState('');
  const [selectedUser, setSelectedUser] = useState(null); // user row being edited
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [registeredUser, setRegisteredUser] = useState(null); // set after successful registration

  // Reset tab when opened
  useEffect(() => {
    if (open) { setTab(defaultTab); setError(''); setSuccess(''); setRegisteredUser(null); }
  }, [open, defaultTab]);

  // Load departments once
  useEffect(() => {
    if (!open) return;
    userApi.getDepartments().then(setDepartments).catch(() => {});
  }, [open]);

  // Load user list when on manage tab
  const loadUsers = useCallback(async (search = '') => {
    setUsersLoading(true);
    try {
      const data = await userApi.getUsers({ search, limit: 100 });
      setUsers(data);
    } catch { setUsers([]); }
    finally { setUsersLoading(false); }
  }, []);

  useEffect(() => {
    if (open && tab === 'manage') loadUsers(userSearch);
  }, [open, tab, loadUsers, userSearch]);

  const switchTab = (t) => {
    setTab(t);
    setError('');
    setSuccess('');
    setSelectedUser(null);
    setRegisteredUser(null);
    if (t === 'register') setForm(EMPTY_FORM);
    if (t === 'manage')   loadUsers('');
  };

  // ── Register ───────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.username.trim()) { setError('Username is required.'); return; }
    if (!form.firstName.trim()) { setError('First name is required.'); return; }
    if (!form.email.trim())    { setError('Email is required — credentials will be sent to this address.'); return; }
    setLoading(true);
    try {
      const created = await userApi.register({
        username:     form.username.trim().toLowerCase(),
        firstName:    form.firstName  || null,
        lastName:     form.lastName   || null,
        email:        form.email      || null,
        phoneNumber:  form.phoneNumber || null,
        employeeCode: form.employeeCode || null,
        userType:     form.userType,
        deptId:       form.deptId   ? parseInt(form.deptId, 10) : null,
        level:        form.level    ? parseInt(form.level, 10)  : null,
        mgrUserId:    form.mgrUserId || null,
        isActive:     form.isActive,
      });
      setRegisteredUser(created);
      setSuccess(`User "${created.username}" registered successfully. Login credentials have been emailed to ${created.email || 'the user'}.`);
      // Intentionally NOT resetting the form here — user sees filled details
      // until they explicitly click "Register Another User".
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Registration failed.');
    } finally { setLoading(false); }
  };

  // ── Select user to edit ────────────────────────────────────────────────────
  const openEdit = (user) => {
    setSelectedUser(user);
    setForm({
      username:           user.username,
      firstName:          user.firstName          || '',
      lastName:           user.lastName           || '',
      email:              user.email              || '',
      phoneNumber:        user.phoneNumber        || '',
      employeeCode:       user.employeeCode       || '',
      userType:           user.userType           || 'employee',
      deptId:             user.deptId             ? String(user.deptId) : '',
      level:              user.level              ? String(user.level)  : '',
      mgrUserId:          user.mgrUserId          || '',
      mgrName:            user.mgrName            || '',
      isActive:           Boolean(user.isActive),
      mustChangePassword: Boolean(user.mustChangePassword),
    });
    setError(''); setSuccess('');
  };

  // ── Update ─────────────────────────────────────────────────────────────────
  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      await userApi.update(selectedUser.userId, {
        firstName:          form.firstName    || null,
        lastName:           form.lastName     || null,
        email:              form.email        || null,
        phoneNumber:        form.phoneNumber  || null,
        employeeCode:       form.employeeCode || null,
        userType:           form.userType,
        deptId:             form.deptId  ? parseInt(form.deptId, 10)  : null,
        level:              form.level   ? parseInt(form.level, 10)   : null,
        mgrUserId:          form.mgrUserId    || null,
        isActive:           form.isActive,
        mustChangePassword: form.mustChangePassword,
      });
      setSuccess('User updated successfully.');
      await loadUsers(userSearch); // refresh the list
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Update failed.');
    } finally { setLoading(false); }
  };

  if (!open) return null;

  // ── Layout constants ───────────────────────────────────────────────────────
  const OVERLAY = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
  };
  const MODAL = {
    width: 900, maxWidth: '96vw', maxHeight: '92vh',
    background: '#fff', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };
  const HEADER = {
    padding: '18px 24px 0', borderBottom: '1px solid #eee',
    display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0,
  };
  const BODY = {
    flex: 1, minHeight: 0, padding: '20px 24px',
    display: 'flex', flexDirection: 'column',
    // FIX: the manage tab has its own two independently-scrolling columns
    // (user list / edit form). Letting THIS container also scroll meant it
    // was the nearest scrollable ancestor that actually took effect, so
    // both columns scrolled together as one instead of independently.
    // The register tab is a single simple column, so it keeps its own
    // scroll here as before.
    overflowY: tab === 'manage' ? 'hidden' : 'auto',
  };
  const TAB_BTN = (active) => ({
    padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#e31b23' : '#666',
    borderBottom: active ? '2px solid #e31b23' : '2px solid transparent',
    marginBottom: -1, transition: 'color .15s',
  });

  return (
    <div style={OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={MODAL}>

        {/* Header */}
        <div style={HEADER}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 0, flex: 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#e31b23" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#222' }}>User Management</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            fontSize: 22, color: '#888', cursor: 'pointer', lineHeight: 1, padding: '0 0 4px 0' }}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 24px',
          borderBottom: '1px solid #eee', flexShrink: 0 }}>
          <button style={TAB_BTN(tab === 'register')} onClick={() => switchTab('register')}>
            Register User
          </button>
          <button style={TAB_BTN(tab === 'manage')} onClick={() => switchTab('manage')}>
            Edit Users
          </button>
        </div>

        {/* Body */}
        <div style={BODY}>

          {/* ── REGISTER TAB ── */}
          {tab === 'register' && (
            <UserForm
              form={form}
              onChange={setForm}
              departments={departments}
              onSubmit={handleRegister}
              submitLabel="Register User"
              loading={loading}
              error={error}
              success={success}
              isEdit={false}
              onRegisterAnother={registeredUser ? () => {
                setForm(EMPTY_FORM);
                setError('');
                setSuccess('');
                setRegisteredUser(null);
              } : null}
            />
          )}

          {/* ── MANAGE / EDIT TAB ── */}
          {tab === 'manage' && (
            <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, overflow: 'hidden' }}>

              {/* Left: user list */}
              <div style={{ width: 260, flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  placeholder="Search users…"
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); loadUsers(e.target.value); }}
                  style={{ ...INPUT, marginBottom: 0 }}
                />
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e5e5',
                  borderRadius: 6, minHeight: 200 }}>
                  {usersLoading && (
                    <div style={{ padding: 16, color: '#999', fontSize: 13, textAlign: 'center' }}>Loading…</div>
                  )}
                  {!usersLoading && users.length === 0 && (
                    <div style={{ padding: 16, color: '#999', fontSize: 13, textAlign: 'center' }}>No users found.</div>
                  )}
                  {!usersLoading && users.map(u => {
                    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username;
                    const isSelected = selectedUser?.userId === u.userId;
                    return (
                      <div key={u.userId} onClick={() => openEdit(u)}
                        style={{
                          padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                          background: isSelected ? '#fff3f3' : 'transparent',
                          borderLeft: isSelected ? '3px solid #e31b23' : '3px solid transparent',
                        }}
                        onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa'; }}
                        onMouseOut={e  => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{name}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                          {u.username}
                          {!u.isActive && <span style={{ color: '#dc2626', marginLeft: 4 }}>· Inactive</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {u.userType}{u.deptName ? ` · ${u.deptName}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: edit form or prompt */}
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {!selectedUser ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                    </svg>
                    <p style={{ marginTop: 10, fontSize: 13 }}>Select a user from the list to edit</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#222' }}>
                        Editing: {`${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || selectedUser.username}
                      </h3>
                      <button onClick={() => { setSelectedUser(null); setError(''); setSuccess(''); }}
                        style={{ background: 'none', border: '1px solid #d0d5dd', borderRadius: 4,
                          padding: '2px 8px', fontSize: 11, color: '#666', cursor: 'pointer' }}>
                        ← Back to list
                      </button>
                    </div>
                    <UserForm
                      form={form}
                      onChange={setForm}
                      departments={departments}
                      onSubmit={handleUpdate}
                      submitLabel="Save Changes"
                      loading={loading}
                      error={error}
                      success={success}
                      isEdit={true}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}