import { useState, useEffect } from 'react';
import { groupApi } from '../api/groupApi';
import { messageApi } from '../api/messageApi';
import RecipientPicker from './RecipientPicker';

/**
 * GroupManager — group control model:
 *
 * - Only the group's creator-admin OR the org super admin can add/remove
 *   participants, disable, re-enable, or delete a group. Regular
 *   participants can only VIEW the member list and the chat — no exit,
 *   no leave, no self-removal.
 *
 * - "Disable" freezes the chat for everyone (including the admin): no
 *   new messages can be sent, but every participant keeps full read
 *   access to history. The group still shows in everyone's tabs.
 *
 * - "Delete" only becomes available AFTER a group is disabled. It hides
 *   the group from the acting admin/super-admin's own tabs only — other
 *   participants are unaffected.
 *
 * - Once a group is disabled, every participant (not just the admin)
 *   gets a "Remove from my tabs" option, which hides it from their own
 *   view only, without touching the group for anyone else.
 *
 * - The super admin sees every group's controls but never opens the
 *   chat itself (isMember is always false for them) — pure governance,
 *   no message visibility.
 */
export default function GroupManager({
  groups = [],
  loading,
  threads, // optional: conversations when super admin wants to manage threads
  currentTab,
  onCreate,
  onDisable,
  onEnable,
  onDelete,
  onHide,
  onOpenConversation,
  onComposeToGroup,
}) {
  const [creating,       setCreating]       = useState(false);
  const [threadSearch,   setThreadSearch]   = useState('');
  const [newName,        setNewName]        = useState('');
  const [createError,    setCreateError]    = useState('');
  const [saving,         setSaving]         = useState(false);
  const [managingGroup,  setManagingGroup]  = useState(null);
  const [members,        setMembers]        = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedUsers,  setSelectedUsers]  = useState([]);
  const [addError,       setAddError]       = useState('');
  const [addSaving,      setAddSaving]      = useState(false);
  const [adminToggling,  setAdminToggling]  = useState(null);
  const [managingThread, setManagingThread] = useState(null);
  const [threadMembers, setThreadMembers]   = useState([]);
  const [threadLoading, setThreadLoading]   = useState(false);
  const [openingGroupId, setOpeningGroupId] = useState(null);
  const [actionError,    setActionError]    = useState({});
  const [actingGroupId,  setActingGroupId]  = useState(null);

  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError('Group name is required.'); return; }
    setSaving(true); setCreateError('');
    try {
      await onCreate(newName.trim());
      setNewName(''); setCreating(false);
    } catch {
      setCreateError('Failed to create group. Try again.');
    } finally { setSaving(false); }
  };

  const openManage = async (group) => {
    setManagingGroup(group);
    setMembersLoading(true);
    setSelectedUsers([]); setAddError('');
    try {
      const data = await groupApi.getMembers(group.groupId);
      setMembers(data || []);
    } finally { setMembersLoading(false); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await groupApi.removeMember(managingGroup.groupId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to remove member.');
    }
  };

  const handleToggleMemberAdmin = async (userId, makeAdmin) => {
    if (!managingGroup) return;
    setAdminToggling(userId);
    setAddError('');
    try {
      await groupApi.setMemberAdmin(managingGroup.groupId, userId, makeAdmin);
      // refresh member list
      const data = await groupApi.getMembers(managingGroup.groupId);
      setMembers(data || []);
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to update admin status.');
    } finally {
      setAdminToggling(null);
    }
  };

  const openManageThread = async (thread) => {
    setManagingThread(thread);
    setThreadLoading(true);
    try {
      const data = await messageApi.getThread(thread.conversationId);
      setThreadMembers(data.conversation?.participants || []);
    } catch (err) {
      setActionError(prev => ({ ...prev, thread: 'Failed to load thread participants.' }));
      setThreadMembers([]);
    } finally { setThreadLoading(false); }
  };

  const handleRemoveThreadParticipant = async (conversationId, userId) => {
    try {
      await messageApi.removeParticipant(conversationId, userId);
      const data = await messageApi.getThread(conversationId);
      setThreadMembers(data.conversation?.participants || []);
    } catch (err) {
      setActionError(prev => ({ ...prev, thread: err?.response?.data?.error || 'Failed to remove participant.' }));
    }
  };

  const [threadSelectedUsers, setThreadSelectedUsers] = useState([]);
  const [threadAddSaving, setThreadAddSaving] = useState(false);
  const [threadAddError, setThreadAddError] = useState('');

  const handleAddThreadMembers = async () => {
    if (!threadSelectedUsers.length) { setThreadAddError('Select at least one user.'); return; }
    const userIds = threadSelectedUsers.filter(u => u.type === 'user').map(u => u.id);
    if (!userIds.length) { setThreadAddError('Only users can be added (not groups).'); return; }
    setThreadAddSaving(true); setThreadAddError('');
    try {
      await messageApi.addParticipants(managingThread.conversationId, userIds);
      const data = await messageApi.getThread(managingThread.conversationId);
      setThreadMembers(data.conversation?.participants || []);
      setThreadSelectedUsers([]);
    } catch (err) {
      setThreadAddError(err?.response?.data?.error || 'Failed to add participants.');
    } finally { setThreadAddSaving(false); }
  };

  const handleAddMembers = async () => {
    if (!selectedUsers.length) { setAddError('Select at least one user.'); return; }
    const userIds = selectedUsers.filter(u => u.type === 'user').map(u => u.id);
    if (!userIds.length) { setAddError('Only users can be added (not groups).'); return; }
    setAddSaving(true); setAddError('');
    try {
      const updated = await groupApi.addMembers(managingGroup.groupId, userIds);
      setMembers(updated || []);
      setSelectedUsers([]);
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to add members.');
    } finally { setAddSaving(false); }
  };

  const runAction = async (group, action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActingGroupId(group.groupId);
    setActionError(prev => ({ ...prev, [group.groupId]: '' }));
    try {
      await action(group.groupId);
      if (managingGroup?.groupId === group.groupId) setManagingGroup(null);
    } catch (err) {
      setActionError(prev => ({
        ...prev,
        [group.groupId]: err?.response?.data?.error || 'Action failed. Try again.',
      }));
    } finally {
      setActingGroupId(null);
    }
  };

  const handleDisable = (group) => runAction(
    group, onDisable,
    `Disable "${group.groupName}"? No one will be able to send new messages, but everyone keeps read access to past chats.`
  );

  const handleEnable = (group) => runAction(
    group, onEnable,
    `Re-enable "${group.groupName}"? Members will be able to send messages again.`
  );

  const handleDelete = (group) => runAction(
    group, onDelete,
    `Delete "${group.groupName}" from your tabs? Other participants keep seeing it (read-only) until they each remove it too.`
  );

  const handleHide = (group) => runAction(
    group, onHide,
    `Remove "${group.groupName}" from your tabs? This only affects your own view.`
  );

  const handleOpenThread = async (group) => {
    setOpeningGroupId(group.groupId);
    setActionError(prev => ({ ...prev, [group.groupId]: '' }));
    try {
      const conv = await groupApi.getGroupConversation(group.groupId);
      onOpenConversation?.(conv);
    } catch (err) {
      const is404 = err?.response?.status === 404;
      if (is404) {
        onComposeToGroup?.(group);
      } else {
        setActionError(prev => ({
          ...prev,
          [group.groupId]: 'Could not open thread. Try again.',
        }));
      }
    } finally {
      setOpeningGroupId(null);
    }
  };

  // Reset manage panels when the parent tab changes (so switching
  // from Groups -> Threads always shows the Threads list instead of
  // leaving a previously-open manage panel visible).
  useEffect(() => {
    setManagingGroup(null);
    setManagingThread(null);
  }, [currentTab]);

  // ── Manage panel ─────────────────────────────────────────────────────────
  if (managingThread) {
    return (
      <div className="groups-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            className="icon-btn msg-back-btn"
            onClick={() => setManagingThread(null)}
            aria-label="Back to threads"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
          </button>
          <h3 style={{ margin: 0 }}>{managingThread.subject || 'Thread'}</h3>
        </div>

        {/* Add members to thread (creator or super-admin only) */}
        <div style={{ marginBottom: 12, background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius-lg)', padding: 12 }}>
          <label className="field-label" style={{ marginBottom: 8 }}>Add Participants</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <RecipientPicker value={threadSelectedUsers} onChange={setThreadSelectedUsers} groups={[]} />
            </div>
            <button className="btn btn-primary" style={{ padding: '9px 16px', fontSize: 12 }} onClick={handleAddThreadMembers} disabled={threadAddSaving || !threadSelectedUsers.length}>
              {threadAddSaving ? 'Adding…' : '+ Add'}
            </button>
          </div>
          {threadAddError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{threadAddError}</div>}
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Participants ({threadMembers.length})
        </div>

        {threadLoading && <div className="loader-wrap"><div className="spinner" /></div>}

        {!threadLoading && threadMembers.map(p => (
          <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>
              {`${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--light)' }}>{p.firstName} {p.lastName}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.email || ''}</div>
            </div>
            <div>
              <button className="icon-btn danger" title="Remove participant" onClick={() => handleRemoveThreadParticipant(managingThread.conversationId, p.userId)}>
                ×
              </button>
            </div>
          </div>
        ))}

        {!threadLoading && threadMembers.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No participants found.</p>
        )}
      </div>
    );
  }

  if (managingGroup) {
    const canManage = Boolean(managingGroup.isCreator || managingGroup.isSuperAdmin);
    const isDisabled = Boolean(managingGroup.isDisabled);

    return (
      <div className="groups-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            className="icon-btn msg-back-btn"
            onClick={() => setManagingGroup(null)}
            aria-label="Back to groups"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
          </button>
          <h3 style={{ margin: 0 }}>{managingGroup.groupName}</h3>
          {isDisabled && (
            <span style={{
              fontSize: 10, color: 'var(--muted)', border: '1px solid var(--divider)',
              borderRadius: 8, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.05em',
            }}>Disabled</span>
          )}
        </div>

            {canManage ? (
          <>
            {/* Disable / Enable / Delete controls */}
            <div style={{
              background: 'var(--charcoal)', border: '1px solid var(--divider)',
              borderRadius: 'var(--radius-lg)', padding: 14, marginBottom: 20,
              display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            }}>
              {!isDisabled ? (
                <button
                  className="btn btn-ghost danger"
                  onClick={() => handleDisable(managingGroup)}
                  disabled={actingGroupId === managingGroup.groupId}
                >
                  Disable Group
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost"
                    onClick={() => handleEnable(managingGroup)}
                    disabled={actingGroupId === managingGroup.groupId}
                  >
                    Re-enable Group
                  </button>
                  <button
                    className="btn btn-ghost danger"
                    onClick={() => handleDelete(managingGroup)}
                    disabled={actingGroupId === managingGroup.groupId}
                  >
                    Delete Group
                  </button>
                </>
              )}
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {isDisabled
                  ? 'Chat is frozen — no one can send messages. History stays visible.'
                  : 'Disabling freezes the chat for everyone; delete only unlocks after that.'}
              </span>
            </div>

            {/* Add members */}
            {!isDisabled && (
              <div style={{
                background: 'var(--charcoal)', border: '1px solid var(--divider)',
                borderRadius: 'var(--radius-lg)', padding: 14, marginBottom: 20,
              }}>
                <label className="field-label" style={{ marginBottom: 8 }}>Add Members</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <RecipientPicker
                      value={selectedUsers}
                      onChange={setSelectedUsers}
                      groups={[]}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '9px 16px', fontSize: 12, whiteSpace: 'nowrap', marginTop: 1 }}
                    onClick={handleAddMembers}
                    disabled={addSaving || !selectedUsers.length}
                  >
                    {addSaving ? 'Adding…' : '+ Add'}
                  </button>
                </div>
                {addError && (
                  <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
                    {addError}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{
            background: 'var(--charcoal)', border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-lg)', padding: 14, marginBottom: 20,
            color: 'var(--muted)', fontSize: 13,
          }}>
            Only the group admin can add, remove, disable, or delete this group.
            {isDisabled && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-ghost danger"
                  onClick={() => handleHide(managingGroup)}
                  disabled={actingGroupId === managingGroup.groupId}
                >
                  Remove from my tabs
                </button>
              </div>
            )}
          </div>
        )}

        {actionError[managingGroup.groupId] && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 16 }}>
            {actionError[managingGroup.groupId]}
          </div>
        )}

        {/* Members list — view only for non-admins */}
        <div style={{
          marginBottom: 12, fontSize: 12, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
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
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--mid)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600, color: 'var(--gold)',
              fontFamily: 'var(--font-display)',
            }}>
              {`${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--light)' }}>
                {m.firstName} {m.lastName}
                {m.isAdmin && (
                  <span style={{ marginLeft: 8, color: 'var(--gold)', fontSize: 11 }}>
                    Admin
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email || ''}</div>
            </div>
            {/* Admin toggle + Remove button — admin/super-admin only, never on the creator, never while disabled */}
            {canManage && !isDisabled && !m.isCreator && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-ghost"
                  title={m.isAdmin ? `Remove ${m.firstName || ''} as admin` : `Make ${m.firstName || ''} an admin`}
                  onClick={() => handleToggleMemberAdmin(m.userId, !m.isAdmin)}
                  disabled={adminToggling === m.userId}
                  style={{ fontSize: 12, padding: '6px 8px' }}
                >
                  {adminToggling === m.userId ? '…' : (m.isAdmin ? 'Remove Admin' : 'Make Admin')}
                </button>

                <button
                  className="icon-btn danger"
                  title="Remove from group"
                  onClick={() => handleRemoveMember(m.userId)}
                  disabled={addSaving}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}

        {!membersLoading && members.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No members yet. Add some above.
          </p>
        )}
      </div>
    );
  }

  // ── Groups list ────────────────────────────────────────────────────────────
  return (
    <div className="groups-panel">
      {/* Threads (admin view) */}
      {threads && currentTab === 'threads' && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Threads</h3>
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              placeholder="Search threads by subject…"
              value={threadSearch}
              onChange={e => setThreadSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--mid)', color: 'var(--light)' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
            {(threads || []).filter(t => {
              // exclude group threads from the plain Threads list
              if (t.convType === 'group_thread' || t.groupId) return false;
              if (!threadSearch.trim()) return true;
              return (t.subject || '').toLowerCase().includes(threadSearch.toLowerCase());
            }).map(t => (
              <div key={t.conversationId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--charcoal)', border: '1px solid var(--divider)', borderRadius: 'var(--radius)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.subject || '(no subject)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {t.participantCount ?? (t.participants?.length ?? 0)} participant{(t.participantCount ?? (t.participants?.length ?? 0)) !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="icon-btn" title="Manage thread" onClick={() => openManageThread(t)}>
                    Manage
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
          {createError && (
            <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>
              {createError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-ghost"
              onClick={() => { setCreating(false); setNewName(''); setCreateError(''); }}
            >
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <p>No groups yet. Create one to quickly message a team.</p>
        </div>
      )}

      {groups.map(g => {
        const canManage = Boolean(g.isCreator || g.isSuperAdmin);
        const isDisabled = Boolean(g.isDisabled);
        const isActing = actingGroupId === g.groupId;

        return (
          <div key={g.groupId} className="group-card">
            <div className="group-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>

            <div className="group-info">
              <div className="group-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {g.groupName}
                {g.isSuperAdmin && (
                  <span style={{
                    fontSize: 10, color: 'var(--gold)', border: '1px solid var(--gold)',
                    borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '.04em',
                  }}>Super Admin View</span>
                )}
                {isDisabled && (
                  <span style={{
                    fontSize: 10, color: 'var(--muted)', border: '1px solid var(--divider)',
                    borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '.04em',
                  }}>Disabled</span>
                )}
              </div>
              <div className="group-count">
                {g.memberCount ?? 0} member{g.memberCount !== 1 ? 's' : ''}
              </div>
              {actionError[g.groupId] && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>
                  {actionError[g.groupId]}
                </div>
              )}
            </div>

            <div className="group-actions">
              {/* Open thread — hidden entirely for the super admin's governance-only view */}
              {!g.isSuperAdmin && (
                <button
                  className="icon-btn"
                  title="Open group chat"
                  disabled={openingGroupId === g.groupId}
                  onClick={() => handleOpenThread(g)}
                >
                  {openingGroupId === g.groupId ? (
                    <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  )}
                </button>
              )}

              {/* Manage / view members */}
              <button
                className="icon-btn"
                title={canManage ? 'Manage members' : 'View members'}
                onClick={() => openManage(g)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </button>

              {/* Quick action button in the list row: */}
              {canManage ? (
                !isDisabled ? (
                  <button
                    className="icon-btn danger"
                    title="Disable group"
                    disabled={isActing}
                    onClick={() => handleDisable(g)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                  </button>
                ) : (
                  <button
                    className="icon-btn danger"
                    title="Delete group"
                    disabled={isActing}
                    onClick={() => handleDelete(g)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                )
              ) : (
                isDisabled && (
                  <button
                    className="icon-btn danger"
                    title="Remove from my tabs"
                    disabled={isActing}
                    onClick={() => handleHide(g)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
