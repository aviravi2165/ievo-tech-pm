import { useState, useEffect, useMemo } from 'react';
import { groupApi } from '../api/groupApi';
import { messageApi } from '../api/messageApi';
import RecipientPicker from './RecipientPicker';

// Mirrors InboxSidebar's fmtTime — same relative-time labels so all tabs feel identical
function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d        = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * GroupManager — group control model:
 *
 * - Only the group's creator-admin OR the org super admin can add/remove
 * participants, disable, re-enable, or delete a group. Regular
 * participants can only VIEW the member list and the chat — no exit,
 * no leave, no self-removal.
 *
 * - "Disable" freezes the chat for everyone (including the admin): no
 * new messages can be sent, but every participant keeps full read
 * access to history. The group still shows in everyone's tabs.
 *
 * - "Delete" only becomes available AFTER a group is disabled. It hides
 * the group from the acting admin/super-admin's own tabs only — other
 * participants are unaffected.
 *
 * - Once a group is disabled, every participant (not just the admin)
 * gets a "Remove from my tabs" option, which hides it from their own
 * view only, without touching the group for anyone else.
 *
 * - The super admin sees every group's controls but never opens the
 * chat itself (isMember is always false for them) — pure governance,
 * no message visibility.
 */
export default function GroupManager({
  groups = [],
  loading,
  groupConversations = [],   // ← enriched conv data (unread count, latestAt, latestSender)
  threads,
  threadsLoading,
  currentTab,
  onCreate,
  onDisable,
  onEnable,
  onDelete,
  onHide,
  onDisableThread,
  onEnableThread,
  onDeleteThread,
  onHideThread,
  onOpenConversation,
}) {
  const [creating,       setCreating]       = useState(false);
  const [groupSearch,    setGroupSearch]    = useState('');
  const [threadSearch,   setThreadSearch]   = useState('');
  const [newName,        setNewName]        = useState('');
  const [newDescription, setNewDescription] = useState('');
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
  const [threadMembers,  setThreadMembers]  = useState([]);
  const [threadLoading,  setThreadLoading]  = useState(false);
  const [openingGroupId, setOpeningGroupId] = useState(null);
  const [actionError,    setActionError]    = useState({});
  const [actingGroupId,  setActingGroupId]  = useState(null);
  const [threadActionError, setThreadActionError] = useState({});
  const [actingThreadId, setActingThreadId] = useState(null);
  const [threadSelectedUsers, setThreadSelectedUsers] = useState([]);
  const [threadAddSaving, setThreadAddSaving] = useState(false);
  const [threadAddError, setThreadAddError] = useState('');

  // Map groupId → conversation row (for unread dot, time, preview)
  const groupConvMap = useMemo(() => {
    const map = {};
    groupConversations.forEach(c => {
      if (c.groupId) map[String(c.groupId)] = c;
    });
    return map;
  }, [groupConversations]);

  // Determine if current user is super admin (any group will have isSuperAdmin set)
  const isSuperAdmin = groups.some(g => g.isSuperAdmin);

  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError('Group name is required.'); return; }
    setSaving(true); setCreateError('');
    try {
      await onCreate(newName.trim(), newDescription.trim() || undefined);
      setNewName(''); setNewDescription(''); setCreating(false);
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
      // Refresh groups everywhere in the app
      window.dispatchEvent(new Event('groups-updated'));
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

  const handleAddThreadMembers = async () => {
    if (!threadSelectedUsers.length) { setThreadAddError('Select at least one user.'); return; }
    const userIds = threadSelectedUsers.filter(u => u.type === 'user').map(u => u.id);
    if (!userIds.length) { setThreadAddError('Only users can be added (not groups).'); return; }
    
    setThreadAddSaving(true); 
    setThreadAddError('');
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
    
    setAddSaving(true); 
    setAddError('');
    try {
      const updated = await groupApi.addMembers(managingGroup.groupId, userIds);
      setMembers(updated || []);
      // notify rest of app to refresh group/thread lists
      window.dispatchEvent(new Event('groups-updated'));
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

  // ── Threads (super admin governance — mirrors group actions above) ────────
  const runThreadAction = async (thread, action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActingThreadId(thread.conversationId);
    setThreadActionError(prev => ({ ...prev, [thread.conversationId]: '' }));
    try {
      await action(thread.conversationId);
      if (managingThread?.conversationId === thread.conversationId) setManagingThread(null);
    } catch (err) {
      setThreadActionError(prev => ({
        ...prev,
        [thread.conversationId]: err?.response?.data?.error || 'Action failed. Try again.',
      }));
    } finally {
      setActingThreadId(null);
    }
  };

  const handleDisableThread = (thread) => runThreadAction(
    thread, onDisableThread,
    `Disable "${thread.subject || 'this thread'}"? No one will be able to send new messages, but everyone keeps read access to past messages.`
  );

  const handleEnableThread = (thread) => runThreadAction(
    thread, onEnableThread,
    `Re-enable "${thread.subject || 'this thread'}"? Participants will be able to send messages again.`
  );

  const handleDeleteThread = (thread) => runThreadAction(
    thread, onDeleteThread,
    `Delete "${thread.subject || 'this thread'}" from your tabs? Other participants keep seeing it (read-only) until they each remove it too.`
  );

  const handleHideThreadRow = (thread) => runThreadAction(
    thread, onHideThread,
    `Remove "${thread.subject || 'this thread'}" from your tabs? This only affects your own view.`
  );

  const handleOpenThread = async (group) => {
    setOpeningGroupId(group.groupId);
    setActionError(prev => ({ ...prev, [group.groupId]: '' }));
    try {
      let conv;
      try {
        conv = await groupApi.getGroupConversation(group.groupId);
      } catch (err) {
        if (err?.response?.status === 404) {
          // No conversation yet — create one via POST
          conv = await groupApi.createGroupConversation(group.groupId);
        } else {
          throw err;
        }
      }
      onOpenConversation?.(conv);
    } catch (err) {
      setActionError(prev => ({
        ...prev,
        [group.groupId]: 'Could not open group chat. Try again.',
      }));
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
    setThreadActionError({});
    setActionError({});
    setGroupSearch('');
  }, [currentTab]);

  // ── Manage panel ─────────────────────────────────────────────────────────
  if (managingThread) {
    const isThreadDisabled = Boolean(managingThread.isDisabled);
    const threadActing = actingThreadId === managingThread.conversationId;
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
          {isThreadDisabled && (
            <span style={{
              fontSize: 10, color: 'var(--muted)', border: '1px solid var(--divider)',
              borderRadius: 8, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.05em',
            }}>Disabled</span>
          )}
        </div>

        {/* Disable / Enable / Delete controls — creator or super admin only */}
        <div style={{
          background: 'var(--charcoal)', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius-lg)', padding: 14, marginBottom: 20,
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          {!isThreadDisabled ? (
            <button
              className="btn btn-ghost danger"
              onClick={() => handleDisableThread(managingThread)}
              disabled={threadActing}
            >
              Disable Thread
            </button>
          ) : (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => handleEnableThread(managingThread)}
                disabled={threadActing}
              >
                Re-enable Thread
              </button>
              <button
                className="btn btn-ghost danger"
                onClick={() => handleDeleteThread(managingThread)}
                disabled={threadActing}
              >
                Delete Thread
              </button>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {isThreadDisabled
              ? 'Thread is frozen — no one can send messages. History stays visible.'
              : 'Disabling freezes the thread for everyone; delete only unlocks after that.'}
          </span>
        </div>

        {threadActionError[managingThread.conversationId] && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 16 }}>
            {threadActionError[managingThread.conversationId]}
          </div>
        )}

        {/* Add members to thread (creator or super-admin only) */}
        {!isThreadDisabled && (
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
        )}

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
            {!isThreadDisabled && (
              <div>
                <button className="icon-btn danger" title="Remove participant" onClick={() => handleRemoveThreadParticipant(managingThread.conversationId, p.userId)}>
                  ×
                </button>
              </div>
            )}
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

        <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
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
        </div>
        
        {!membersLoading && members.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No members yet. Add some above.
          </p>
        )}
      </div>
    );
  }

  // ── Shared chip style for "Disabled" indicator on rows ───────────────────
  const DISABLED_CHIP = {
    fontSize: 9, color: 'var(--text-muted)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '1px 5px', textTransform: 'uppercase',
    letterSpacing: '.04em', flexShrink: 0, marginLeft: 4,
  };

  // ── Groups list ────────────────────────────────────────────────────────────
  return (
    <aside className="msg-sidebar">

      {/* ── THREADS TAB (super admin) ─────────────────────────────────────── */}
      {threads && currentTab === 'threads' ? (
        <>
          {/* Same brand header as Groups and Inbox tabs */}
          <div className="msg-sidebar-header">
            <h2>I.EVO</h2>
            <p>Threads · Design | Demonstrate | Deliver</p>
          </div>

          <div className="msg-search-wrap">
            <input
              placeholder="Search threads by subject…"
              value={threadSearch}
              onChange={e => setThreadSearch(e.target.value)}
            />
          </div>

          <div className="msg-conv-list" style={{ padding: '8px 12px' }}>
            {threadsLoading && <div className="loader-wrap"><div className="spinner" /></div>}

            {!threadsLoading && threads.filter(t => t.convType === 'cc').length === 0 && (
              <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No shared threads yet.
              </div>
            )}

            {(threads || [])
              .filter(t => {
                if (t.convType !== 'cc') return false;
                if (!threadSearch.trim()) return true;
                return (t.subject || '').toLowerCase().includes(threadSearch.toLowerCase());
              })
              .map(t => {
                const isDisabled = Boolean(t.isDisabled);
                const timeLabel  = fmtTime(t.createdAt);
                return (
                  /* Clean row — identical structure and padding to Inbox rows.
                     No inline action buttons. Click the row to open the manage panel. */
                  <div
                    key={t.conversationId}
                    className="group-card"
                    style={{ margin: '0 0 8px', cursor: 'pointer' }}
                    onClick={() => openManageThread(t)}
                  >
                    <div className="group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </div>

                    <div className="group-info" style={{ minWidth: 0 }}>
                      <div className="group-name" style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {t.subject || '(no subject)'}
                        </span>
                        {isDisabled && <span style={DISABLED_CHIP}>Disabled</span>}
                      </div>
                      <div className="group-count">
                        {t.participantCount ?? 0} participant{(t.participantCount ?? 0) !== 1 ? 's' : ''}
                      </div>
                      {threadActionError[t.conversationId] && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                          {threadActionError[t.conversationId]}
                        </div>
                      )}
                    </div>

                    {timeLabel && (
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {timeLabel}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        </>

      ) : (
      /* ── GROUPS TAB ─────────────────────────────────────────────────────── */
      <>
        <div className="msg-sidebar-header">
          <h2>I.EVO</h2>
          <p>Groups · Design | Demonstrate | Deliver</p>
        </div>

        {!isSuperAdmin && (
          <button className="msg-compose-btn" onClick={() => setCreating(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Group
          </button>
        )}

        <div className="msg-search-wrap">
          <input
            type="text"
            placeholder="Search groups by name…"
            value={groupSearch}
            onChange={e => setGroupSearch(e.target.value)}
          />
        </div>

        {!isSuperAdmin && creating && (
          <div style={{
            margin: '0 12px 8px',
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 14,
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
            <label className="field-label">
              Description{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              className="field-input"
              style={{ marginBottom: 10 }}
              placeholder="What is this group for?"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            {createError && (
              <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{createError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewName(''); setNewDescription(''); setCreateError(''); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        )}

        <div className="msg-conv-list" style={{ padding: '8px 12px' }}>
          {loading && <div className="loader-wrap"><div className="spinner" /></div>}

          {!loading && groups.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No groups yet.{!isSuperAdmin && ' Create one above.'}
            </div>
          )}

          {[...groups]
            .filter(g =>
              !groupSearch.trim() ||
              (g.groupName || '').toLowerCase().includes(groupSearch.toLowerCase())
            )
            .sort((a, b) => {
              // Disabled groups sink to the bottom
              const aOff = Boolean(a.isDisabled);
              const bOff = Boolean(b.isDisabled);
              if (aOff !== bOff) return aOff ? 1 : -1;
              const ta = groupConvMap[String(a.groupId)]?.latestAt || a.createdAt || '';
              const tb = groupConvMap[String(b.groupId)]?.latestAt || b.createdAt || '';
              return tb < ta ? -1 : tb > ta ? 1 : 0;
            })
            .map(g => {
              const isDisabled = Boolean(g.isDisabled);
              const conv       = groupConvMap[String(g.groupId)];
              const unread     = conv?.unreadCount || 0;
              const hasUnread  = unread > 0;
              const latestAt   = conv?.latestAt || conv?.createdAt || g.createdAt;
              const timeLabel  = fmtTime(latestAt);
              const memberLabel = `${g.memberCount ?? 0} member${g.memberCount !== 1 ? 's' : ''}`;

              /* All group rows — super admin and regular — use the same clean
                 structure as InboxSidebar. No inline buttons, no badges.
                 Super admin click → openManage (manage panel)
                 Regular user click → handleOpenThread (open chat) */
              const handleRowClick = g.isSuperAdmin
                ? () => openManage(g)
                : () => handleOpenThread(g);

              return (
                <div
                  key={g.groupId}
                  className={`group-card${conv?._flash ? ' conv-flash' : ''}`}
                  style={{
                    margin: '0 0 8px',
                    cursor: g.isSuperAdmin || g.isMember ? 'pointer' : 'default',
                    borderColor: hasUnread ? 'var(--accent)' : undefined,
                  }}
                  onClick={handleRowClick}
                >
                  <div className="group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                  </div>

                  <div className="group-info" style={{ minWidth: 0 }}>
                    <div className="group-name" style={{
                      fontWeight: hasUnread ? 700 : 600,
                      display: 'flex', alignItems: 'center',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {g.groupName}
                      </span>
                      {isDisabled && <span style={DISABLED_CHIP}>Off</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden', marginTop: 1 }}>
                      <span className="group-count" style={{ flexShrink: 0, whiteSpace: 'nowrap', fontWeight: hasUnread ? 600 : 400 }}>
                        {memberLabel}
                      </span>
                      {g.description && (
                        <>
                          <span className="group-count" style={{ flexShrink: 0 }}>·</span>
                          <span className="group-count" style={{
                            flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontStyle: 'italic',
                          }}>
                            {g.description}
                          </span>
                        </>
                      )}
                    </div>

                    {actionError[g.groupId] && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                        {actionError[g.groupId]}
                      </div>
                    )}
                  </div>

                  {/* Right column: time + unread dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    {timeLabel && (
                      <span style={{
                        fontSize: 11.5, whiteSpace: 'nowrap',
                        color: hasUnread ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: hasUnread ? 600 : 400,
                      }}>
                        {timeLabel}
                      </span>
                    )}
                    {hasUnread && <span className="conv-unread-dot" />}
                  </div>
                </div>
              );
            })
          }
        </div>
      </>
      )}
    </aside>
  );
}