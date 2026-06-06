/**
 * GroupManager.js
 *
 * FIX: Clicking a group card now opens the existing conversation thread in
 * the Inbox (if one exists) instead of doing nothing.
 *
 * How it works:
 *  - Each group card now has an "Open Chat" button alongside "Manage".
 *  - Clicking it calls groupApi.getGroupConversation(groupId).
 *  - On success: calls the onOpenConversation(conv) prop, which MessagingPage
 *    uses to switch to the Inbox tab and select that conversation.
 *  - On 404: shows a small inline message "No thread yet — send one from
 *    New Message to start the conversation."
 *
 * Props added:
 *   onOpenConversation(conv) — provided by MessagingPage; receives the
 *                              conversation object returned by the API.
 */

import { useState } from 'react';
import { groupApi } from '../api/groupApi';
import RecipientPicker from './RecipientPicker';

export default function GroupManager({
  groups = [],
  loading,
  onCreate,
  onDelete,
  onOpenConversation,   // ← NEW prop
}) {
  const [creating,        setCreating]        = useState(false);
  const [newName,         setNewName]         = useState('');
  const [createError,     setCreateError]     = useState('');
  const [saving,          setSaving]          = useState(false);
  const [managingGroup,   setManagingGroup]   = useState(null);
  const [members,         setMembers]         = useState([]);
  const [membersLoading,  setMembersLoading]  = useState(false);
  const [selectedUsers,   setSelectedUsers]   = useState([]);
  const [addError,        setAddError]        = useState('');
  const [addSaving,       setAddSaving]       = useState(false);

  // NEW: per-group open-thread state
  const [openingGroupId,  setOpeningGroupId]  = useState(null);
  const [openError,       setOpenError]       = useState({});   // { [groupId]: msg }

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
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      setAddError('Failed to remove member.');
    }
  };

  const handleAddMembers = async () => {
    if (!selectedUsers.length) { setAddError('Select at least one user.'); return; }
    const userIds = selectedUsers.filter((u) => u.type === 'user').map((u) => u.id);
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

  // NEW: open the existing conversation thread for a group in Inbox
  const handleOpenThread = async (group) => {
    setOpeningGroupId(group.groupId);
    setOpenError((prev) => ({ ...prev, [group.groupId]: '' }));
    try {
      const conv = await groupApi.getGroupConversation(group.groupId);
      // Pass back to MessagingPage which will switch tab + select conversation
      onOpenConversation?.(conv);
    } catch (err) {
      const is404 = err?.response?.status === 404;
      setOpenError((prev) => ({
        ...prev,
        [group.groupId]: is404
          ? 'No thread yet — compose a New Message to this group to start one.'
          : 'Could not open thread. Try again.',
      }));
    } finally {
      setOpeningGroupId(null);
    }
  };

  // ── Manage panel ────────────────────────────────────────────────────────────
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
          </button>
          <h3 style={{ margin: 0 }}>{managingGroup.groupName}</h3>
        </div>

        {/* Add members */}
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

        {/* Members list */}
        <div style={{
          marginBottom: 12, fontSize: 12, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Members ({members.length})
        </div>

        {membersLoading && <div className="loader-wrap"><div className="spinner" /></div>}

        {!membersLoading && members.map((m) => (
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
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.email || ''}</div>
            </div>
            <button
              className="icon-btn danger"
              title="Remove from group"
              onClick={() => handleRemoveMember(m.userId)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
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

  // ── Groups list ─────────────────────────────────────────────────────────────
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
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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

      {groups.map((g) => (
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
            <div className="group-name">{g.groupName}</div>
            <div className="group-count">
              {g.memberCount ?? 0} member{g.memberCount !== 1 ? 's' : ''}
            </div>
            {/* Inline error for open-thread attempt */}
            {openError[g.groupId] && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {openError[g.groupId]}
              </div>
            )}
          </div>

          <div className="group-actions">
            {/* NEW: Open existing thread in Inbox */}
            <button
              className="icon-btn"
              title="Open group chat in Inbox"
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

            {/* Manage members */}
            <button
              className="icon-btn"
              title="Manage members"
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

            {/* Delete group */}
            <button
              className="icon-btn danger"
              title="Delete group"
              onClick={() => {
                if (window.confirm(
                  `Delete group "${g.groupName}"? Past messages are preserved.`
                )) {
                  onDelete(g.groupId);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}