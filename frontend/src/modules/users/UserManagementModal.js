import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { userApi } from './userApi';
import {
  Overlay, Modal, ModalHeader, HeaderTitleRow, HeaderTitle, CloseBtn,
  TabRow, TabBtn, ModalBody, Field, FieldLabel, RequiredMark, FieldHint,
  Input, Select, CheckboxRow, FormGrid, BooleansRow, InfoNote, ErrorText,
  SuccessText, FormActionsRow, SecondaryBtn, PrimaryBtn, PickerWrap,
  PickerLoading, PickerResults, PickerResultRow, PickerResultEmail,
  PickerClearBtn, ManageLayout, UserListCol, UserListBox, UserListMsg,
  UserListRow, UserRowName, UserRowSub, UserRowInactive, UserRowMeta,
  EditCol, EditEmptyState, EditHeaderRow, EditTitle, BackBtn,
} from './styles/UserManagementModal.styles';
import { useSortFilter } from '../shared/hooks/useSortFilter';
import { SortSelect, FilterSelect } from '../shared/components/TableControls';
import { useEscapeKey } from '../shared/hooks/useEscapeKey';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Account type is deliberately just Admin/Employee — "Manager" isn't a
// global account type here. Anyone (any Employee) can already be made a
// Manager of a specific project/phase/activity in the PM module without
// needing a different account type, and org-chart "who they report to" is
// the separate mgrUserId field below (ManagerPicker) — a third "Manager"
// option at this level only duplicated one of those two and caused
// confusion between them.
const USER_TYPES = [
  { value: 'employee', label: 'Employee' },
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

function FormField({ label, required, hint, children }) {
  return (
    <Field>
      <FieldLabel>
        {label}{required && <RequiredMark>*</RequiredMark>}
      </FieldLabel>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </Field>
  );
}

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
    <PickerWrap ref={wrapRef}>
      <Input
        value={query}
        onChange={e => search(e.target.value)}
        placeholder="Search by name or email…"
      />
      {loading && <PickerLoading>…</PickerLoading>}
      {open && results.length > 0 && (
        <PickerResults>
          {results.map(u => (
            <PickerResultRow key={u.userId} onClick={() => pick(u)}>
              <strong>{`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username}</strong>
              {u.email && <PickerResultEmail>{u.email}</PickerResultEmail>}
            </PickerResultRow>
          ))}
        </PickerResults>
      )}
      {value && (
        <PickerClearBtn type="button" onClick={() => { setQuery(''); onChange('', ''); }}>
          ×
        </PickerClearBtn>
      )}
    </PickerWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UserForm — shared for both Register and Edit
// ─────────────────────────────────────────────────────────────────────────────

function UserForm({ form, onChange, departments, onSubmit, submitLabel, loading, error, success, isEdit, onRegisterAnother }) {
  const set = (field, value) => onChange({ ...form, [field]: value });

  return (
    <form onSubmit={onSubmit} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
      <FormGrid>

        {/* USERNAME */}
        <FormField label="Username" required>
          <Input value={form.username}
            onChange={e => set('username', e.target.value)}
            placeholder="e.g. jsmith"
            disabled={isEdit} // username shouldn't change once set
          />
          {isEdit && <FieldHint>Username cannot be changed after creation.</FieldHint>}
        </FormField>

        {/* USER TYPE */}
        <FormField label="User Type" required>
          <Select value={form.userType} onChange={e => set('userType', e.target.value)}>
            {USER_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </FormField>

        {/* FIRST NAME */}
        <FormField label="First Name" required={!isEdit}>
          <Input value={form.firstName}
            onChange={e => set('firstName', e.target.value)}
            placeholder="First name" />
        </FormField>

        {/* LAST NAME */}
        <FormField label="Last Name">
          <Input value={form.lastName}
            onChange={e => set('lastName', e.target.value)}
            placeholder="Last name" />
        </FormField>

        {/* EMAIL */}
        <FormField label="Email" required={!isEdit}>
          <Input type="email" value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="email@company.com"
            required={!isEdit} />
        </FormField>

        {/* PHONE */}
        <FormField label="Phone Number">
          <Input value={form.phoneNumber}
            onChange={e => set('phoneNumber', e.target.value)}
            placeholder="+91 98765 43210" />
        </FormField>

        {/* EMPLOYEE CODE */}
        <FormField label="Employee Code">
          <Input value={form.employeeCode}
            onChange={e => set('employeeCode', e.target.value)}
            placeholder="EMP-001" />
        </FormField>

        {/* DEPARTMENT */}
        <FormField label="Department">
          <Select value={form.deptId}
            onChange={e => set('deptId', e.target.value || '')}>
            <option value="">— None —</option>
            {departments.map(d => (
              <option key={d.deptId} value={d.deptId}>{d.deptName}</option>
            ))}
          </Select>
        </FormField>

        {/* LEVEL */}
        <FormField label="Level" hint="Numeric seniority level (optional)">
          <Input type="number" min="0" value={form.level}
            onChange={e => set('level', e.target.value)}
            placeholder="e.g. 3" />
        </FormField>

        {/* MANAGER */}
        <FormField label="Manager" hint="Leave blank if no direct manager">
          <ManagerPicker
            value={form.mgrUserId}
            displayName={form.mgrName}
            onChange={(id, name) => onChange({ ...form, mgrUserId: id, mgrName: name })}
          />
        </FormField>
      </FormGrid>

      {/* Booleans — full width */}
      <BooleansRow>
        <CheckboxRow>
          <input type="checkbox" checked={!!form.isActive}
            onChange={e => set('isActive', e.target.checked)} />
          Is Active
        </CheckboxRow>
        <CheckboxRow>
          <input type="checkbox" checked={!!form.mustChangePassword}
            onChange={e => set('mustChangePassword', e.target.checked)} />
          Must Change Password on Next Login
        </CheckboxRow>
      </BooleansRow>

      {!isEdit && (
        <InfoNote>
          A temporary password will be generated and emailed to the user automatically.
          They will be required to change it on first login.
        </InfoNote>
      )}

      {error   && <ErrorText>{error}</ErrorText>}
      {success && <SuccessText>{success}</SuccessText>}

      <FormActionsRow>
        {onRegisterAnother && (
          <SecondaryBtn type="button" onClick={onRegisterAnother}>
            + Register Another User
          </SecondaryBtn>
        )}
        <PrimaryBtn type="submit" disabled={loading || !!onRegisterAnother} muted={!!onRegisterAnother}>
          {loading ? 'Saving…' : submitLabel}
        </PrimaryBtn>
      </FormActionsRow>
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

  useEscapeKey(onClose, open);

  const deptOptions = useMemo(() => [...new Set(users.map(u => u.deptName).filter(Boolean))].map(d => ({ value: d, label: d })), [users]);
  const {
    items: visibleUsers, sortKey: userSortKey, setSortKey: setUserSortKey,
    sortDir: userSortDir, toggleSortDir: toggleUserSortDir, filters: userFilters, setFilter: setUserFilter,
  } = useSortFilter(users, {
    sorters: {
      name:   (a, b) => (`${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username).localeCompare(`${b.firstName || ''} ${b.lastName || ''}`.trim() || b.username),
      dept:   (a, b) => (a.deptName || '').localeCompare(b.deptName || ''),
      active: (a, b) => Number(b.isActive) - Number(a.isActive),
    },
    defaultSortKey: 'name',
    filters: {
      dept:   { predicate: (u, v) => u.deptName === v },
      active: { predicate: (u) => !!u.isActive },
    },
  });

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

  return (
    <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal>

        {/* Header */}
        <ModalHeader>
          <HeaderTitleRow>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" style={{ color: 'inherit' }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <HeaderTitle>User Management</HeaderTitle>
          </HeaderTitleRow>
          <CloseBtn onClick={onClose}>×</CloseBtn>
        </ModalHeader>

        {/* Tabs */}
        <TabRow>
          <TabBtn active={tab === 'register'} onClick={() => switchTab('register')}>
            Register User
          </TabBtn>
          <TabBtn active={tab === 'manage'} onClick={() => switchTab('manage')}>
            Edit Users
          </TabBtn>
        </TabRow>

        {/* Body */}
        <ModalBody noScroll={tab === 'manage'}>

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
            <ManageLayout>

              {/* Left: user list */}
              <UserListCol>
                <Input
                  placeholder="Search users…"
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); loadUsers(e.target.value); }}
                  style={{ marginBottom: 0 }}
                />
                <div style={{ display:'flex', alignItems:'center', gap:6, margin:'8px 0', flexWrap:'wrap' }}>
                  <SortSelect value={userSortKey} onChange={setUserSortKey} dir={userSortDir} onToggleDir={toggleUserSortDir}
                    options={[{ value:'name', label:'Name' }, { value:'dept', label:'Department' }, { value:'active', label:'Active status' }]} />
                  <FilterSelect placeholder="All departments" value={userFilters.dept} onChange={v => setUserFilter('dept', v)} options={deptOptions} />
                  <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, cursor:'pointer' }}>
                    <input type="checkbox" checked={!!userFilters.active} onChange={e => setUserFilter('active', e.target.checked || null)} />
                    Active only
                  </label>
                </div>
                <UserListBox>
                  {usersLoading && <UserListMsg>Loading…</UserListMsg>}
                  {!usersLoading && users.length === 0 && <UserListMsg>No users found.</UserListMsg>}
                  {!usersLoading && users.length > 0 && visibleUsers.length === 0 && <UserListMsg>No users match the current filters.</UserListMsg>}
                  {!usersLoading && visibleUsers.map(u => {
                    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username;
                    const isSelected = selectedUser?.userId === u.userId;
                    return (
                      <UserListRow key={u.userId} selected={isSelected} onClick={() => openEdit(u)}>
                        <UserRowName>{name}</UserRowName>
                        <UserRowSub>
                          {u.username}
                          {!u.isActive && <UserRowInactive>· Inactive</UserRowInactive>}
                        </UserRowSub>
                        <UserRowMeta>
                          {u.userType}{u.deptName ? ` · ${u.deptName}` : ''}
                        </UserRowMeta>
                      </UserListRow>
                    );
                  })}
                </UserListBox>
              </UserListCol>

              {/* Right: edit form or prompt */}
              <EditCol>
                {!selectedUser ? (
                  <EditEmptyState>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                    </svg>
                    <p style={{ marginTop: 10, fontSize: 13 }}>Select a user from the list to edit</p>
                  </EditEmptyState>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <EditHeaderRow>
                      <EditTitle>
                        Editing: {`${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || selectedUser.username}
                      </EditTitle>
                      <BackBtn onClick={() => { setSelectedUser(null); setError(''); setSuccess(''); }}>
                        ← Back to list
                      </BackBtn>
                    </EditHeaderRow>
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
              </EditCol>
            </ManageLayout>
          )}
        </ModalBody>
      </Modal>
    </Overlay>
  );
}
