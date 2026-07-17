import { useState, useEffect, useMemo } from 'react';
import { groupApi } from '../api/groupApi';
import { messageApi } from '../api/messageApi';
import RecipientPicker from './RecipientPicker';
import { Sidebar, SidebarHeader } from '../styles/MessagingPage.styles';
import { ComposeBtn, SearchWrap, SearchInput, StickyTop } from '../styles/InboxSidebar.styles';
import { LoaderWrap, Spinner, IconBtn, BtnGhost, BtnPrimary, FieldLabel, FieldInput } from '../styles/shared.styles';
import {
  ConvListWrap, ListEmptyMsg, GroupCard, GroupIcon, GroupInfo, GroupName,
  GroupCount, RowRight, RowTime, UnreadDot,
} from '../styles/ConversationList.styles';
import {
  GroupsPanel, BackRow, BackBtn, DisabledChip, RowDisabledChip, ControlCard,
  AddCard, InfoCard, HintText, ErrorText, SectionLabel, MemberScroll,
  MemberRow, MemberAvatar, MemberInfo, MemberName, MemberEmail, AdminTag,
  MemberActions,
} from '../styles/GroupManager.styles';

// Mirrors InboxSidebar's fmtTime — same relative-time labels so all tabs feel identical
function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();

  // Normalize both dates to midnight to compare calendar days, not elapsed time
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = Math.floor((today - targetDate) / 86400000);

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
  autoManageGroupId,
  onAutoManageGroupHandled,
  autoManageThreadId,
  onAutoManageThreadHandled,
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

  // ── Auto-open management for a specific group/thread (PM ChatButton, admin
  // only — see ChatButton.js/MessagingContext.js requestManageGroup/Thread).
  // groups/threads may not have finished loading yet when the request first
  // arrives, so this re-runs whenever either list updates until it finds a
  // match, rather than only firing once on mount.
  useEffect(() => {
    if (!autoManageGroupId || !groups.length) return;
    const match = groups.find(g => String(g.groupId) === String(autoManageGroupId));
    if (!match) return;
    openManage(match);
    onAutoManageGroupHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoManageGroupId, groups]);

  useEffect(() => {
    if (!autoManageThreadId || !threads?.length) return;
    const match = threads.find(t => String(t.conversationId) === String(autoManageThreadId));
    if (!match) return;
    openManageThread(match);
    onAutoManageThreadHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoManageThreadId, threads]);

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
      <GroupsPanel>
        <BackRow>
          <BackBtn type="button" onClick={() => setManagingThread(null)} aria-label="Back to threads">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
          </BackBtn>
          <h3 style={{ margin: 0 }}>{managingThread.subject || 'Thread'}</h3>
          {isThreadDisabled && <DisabledChip>Disabled</DisabledChip>}
        </BackRow>

        {/* Disable / Enable / Delete controls — creator or super admin only */}
        <ControlCard>
          {!isThreadDisabled ? (
            <BtnGhost danger onClick={() => handleDisableThread(managingThread)} disabled={threadActing}>
              Disable Thread
            </BtnGhost>
          ) : (
            <>
              <BtnGhost onClick={() => handleEnableThread(managingThread)} disabled={threadActing}>
                Re-enable Thread
              </BtnGhost>
              <BtnGhost danger onClick={() => handleDeleteThread(managingThread)} disabled={threadActing}>
                Delete Thread
              </BtnGhost>
            </>
          )}
          <HintText>
            {isThreadDisabled
              ? 'Thread is frozen — no one can send messages. History stays visible.'
              : 'Disabling freezes the thread for everyone; delete only unlocks after that.'}
          </HintText>
        </ControlCard>

        {threadActionError[managingThread.conversationId] && (
          <ErrorText>{threadActionError[managingThread.conversationId]}</ErrorText>
        )}

        {/* Add members to thread (creator or super-admin only) */}
        {!isThreadDisabled && (
          <AddCard>
            <FieldLabel style={{ marginBottom: 8 }}>Add Participants</FieldLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <RecipientPicker value={threadSelectedUsers} onChange={setThreadSelectedUsers} groups={[]} />
              </div>
              <BtnPrimary style={{ padding: '9px 16px', fontSize: 12 }} onClick={handleAddThreadMembers} disabled={threadAddSaving || !threadSelectedUsers.length}>
                {threadAddSaving ? 'Adding…' : '+ Add'}
              </BtnPrimary>
            </div>
            {threadAddError && <ErrorText style={{ marginTop: 6, marginBottom: 0 }}>{threadAddError}</ErrorText>}
          </AddCard>
        )}

        <SectionLabel>Participants ({threadMembers.length})</SectionLabel>

        {threadLoading && <LoaderWrap><Spinner /></LoaderWrap>}

        {!threadLoading && threadMembers.map(p => (
          <MemberRow key={p.userId}>
            <MemberAvatar>
              {`${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase() || '?'}
            </MemberAvatar>
            <MemberInfo>
              <MemberName>{p.firstName} {p.lastName}</MemberName>
              <MemberEmail>{p.email || ''}</MemberEmail>
            </MemberInfo>
            {!isThreadDisabled && (
              <div>
                <IconBtn danger title="Remove participant" onClick={() => handleRemoveThreadParticipant(managingThread.conversationId, p.userId)}>
                  ×
                </IconBtn>
              </div>
            )}
          </MemberRow>
        ))}

        {!threadLoading && threadMembers.length === 0 && (
          <p style={{ color: 'inherit', fontSize: 13 }}>No participants found.</p>
        )}
      </GroupsPanel>
    );
  }

  if (managingGroup) {
    const canManage = Boolean(managingGroup.isCreator || managingGroup.isSuperAdmin);
    const isDisabled = Boolean(managingGroup.isDisabled);

    return (
      <GroupsPanel>
        <BackRow>
          <BackBtn type="button" onClick={() => setManagingGroup(null)} aria-label="Back to groups">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
          </BackBtn>
          <h3 style={{ margin: 0 }}>{managingGroup.groupName}</h3>
          {isDisabled && <DisabledChip>Disabled</DisabledChip>}
        </BackRow>

        {canManage ? (
          <>
            {/* Disable / Enable / Delete controls */}
            <ControlCard>
              {!isDisabled ? (
                <BtnGhost danger onClick={() => handleDisable(managingGroup)} disabled={actingGroupId === managingGroup.groupId}>
                  Disable Group
                </BtnGhost>
              ) : (
                <>
                  <BtnGhost onClick={() => handleEnable(managingGroup)} disabled={actingGroupId === managingGroup.groupId}>
                    Re-enable Group
                  </BtnGhost>
                  <BtnGhost danger onClick={() => handleDelete(managingGroup)} disabled={actingGroupId === managingGroup.groupId}>
                    Delete Group
                  </BtnGhost>
                </>
              )}
              <HintText>
                {isDisabled
                  ? 'Chat is frozen — no one can send messages. History stays visible.'
                  : 'Disabling freezes the chat for everyone; delete only unlocks after that.'}
              </HintText>
            </ControlCard>

            {/* Add members */}
            {!isDisabled && (
              <AddCard>
                <FieldLabel style={{ marginBottom: 8 }}>Add Members</FieldLabel>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <RecipientPicker
                      value={selectedUsers}
                      onChange={setSelectedUsers}
                      groups={[]}
                    />
                  </div>
                  <BtnPrimary
                    style={{ padding: '9px 16px', fontSize: 12, whiteSpace: 'nowrap', marginTop: 1 }}
                    onClick={handleAddMembers}
                    disabled={addSaving || !selectedUsers.length}
                  >
                    {addSaving ? 'Adding…' : '+ Add'}
                  </BtnPrimary>
                </div>
                {addError && <ErrorText style={{ marginTop: 6, marginBottom: 0 }}>{addError}</ErrorText>}
              </AddCard>
            )}
          </>
        ) : (
          <InfoCard>
            Only the group admin can add, remove, disable, or delete this group.
            {isDisabled && (
              <div style={{ marginTop: 12 }}>
                <BtnGhost danger onClick={() => handleHide(managingGroup)} disabled={actingGroupId === managingGroup.groupId}>
                  Remove from my tabs
                </BtnGhost>
              </div>
            )}
          </InfoCard>
        )}

        {actionError[managingGroup.groupId] && <ErrorText>{actionError[managingGroup.groupId]}</ErrorText>}

        {/* Members list — view only for non-admins */}
        <SectionLabel>Members ({members.length})</SectionLabel>

        {membersLoading && <LoaderWrap><Spinner /></LoaderWrap>}

        <MemberScroll>
          {!membersLoading && members.map(m => (
            <MemberRow key={m.userId}>
              <MemberAvatar>
                {`${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase() || '?'}
              </MemberAvatar>
              <MemberInfo>
                <MemberName>
                  {m.firstName} {m.lastName}
                  {m.isAdmin && <AdminTag>Admin</AdminTag>}
                </MemberName>
                <MemberEmail>{m.email || ''}</MemberEmail>
              </MemberInfo>
              {/* Admin toggle — never shown for the creator (they're always
                  de-facto admin, toggling doesn't apply to them). Remove
                  button — normally also hidden for the creator (a co-admin
                  removing the group's own creator would leave it without
                  its real owner), but the org-wide super admin has
                  authority over every group regardless of membership and
                  can remove the creator too (backend allows this
                  specifically for a real super admin actor — see
                  groupService.removeMember). */}
              {canManage && !isDisabled && (
                <MemberActions>
                  {!m.isCreator && (
                    <BtnGhost
                      title={m.isAdmin ? `Remove ${m.firstName || ''} as admin` : `Make ${m.firstName || ''} an admin`}
                      onClick={() => handleToggleMemberAdmin(m.userId, !m.isAdmin)}
                      disabled={adminToggling === m.userId}
                      style={{ fontSize: 12, padding: '6px 8px' }}
                    >
                      {adminToggling === m.userId ? '…' : (m.isAdmin ? 'Remove Admin' : 'Make Admin')}
                    </BtnGhost>
                  )}

                  {(!m.isCreator || managingGroup.isSuperAdmin) && (
                    <IconBtn danger
                      title={m.isCreator ? `Remove ${m.firstName || ''} (group creator)` : 'Remove from group'}
                      onClick={() => handleRemoveMember(m.userId)} disabled={addSaving}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </IconBtn>
                  )}
                </MemberActions>
              )}
            </MemberRow>
          ))}
        </MemberScroll>

        {!membersLoading && members.length === 0 && (
          <p style={{ color: 'inherit', fontSize: 13 }}>No members yet. Add some above.</p>
        )}
      </GroupsPanel>
    );
  }

  // ── Groups list ────────────────────────────────────────────────────────────
  return (
    <Sidebar as="aside" data-msg-sidebar>

      {/* ── THREADS TAB (super admin) ─────────────────────────────────────── */}
      {threads && currentTab === 'threads' ? (
        <>
          {/* Same brand header as Groups and Inbox tabs */}
          <SidebarHeader>
            <h2>I.EVO</h2>
            <p>Threads · Design | Demonstrate | Deliver</p>
          </SidebarHeader>

          {/* Search — a non-scrolling header sibling ABOVE ConvListWrap, not
              living inside its scroll flow (see StickyTop's comment in
              InboxSidebar.styles.js — a sticky-inside-scroll approach here
              previously let rows scroll up OVER this header). */}
          <StickyTop>
            <SearchWrap style={isSuperAdmin ? { margin: '16px 12px 8px 12px' } : undefined}>
              <SearchInput
                placeholder="Search threads by subject…"
                value={threadSearch}
                onChange={e => setThreadSearch(e.target.value)}
              />
            </SearchWrap>
          </StickyTop>

          <ConvListWrap>
            <div style={{ padding: '8px 12px' }}>
            {threadsLoading && <LoaderWrap><Spinner /></LoaderWrap>}

            {!threadsLoading && threads.filter(t => t.convType === 'cc').length === 0 && (
              <ListEmptyMsg>No shared threads yet.</ListEmptyMsg>
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
                  <GroupCard
                    key={t.conversationId}
                    clickable
                    style={{ margin: '0 0 8px' }}
                    onClick={() => openManageThread(t)}
                  >
                    <GroupIcon>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </GroupIcon>

                    <GroupInfo>
                      <GroupName style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {t.subject || '(no subject)'}
                        </span>
                      </GroupName>
                      <GroupCount>
                        {t.participantCount ?? 0} participant{(t.participantCount ?? 0) !== 1 ? 's' : ''}
                      </GroupCount>
                      {threadActionError[t.conversationId] && (
                        <ErrorText style={{ fontSize: 11, marginTop: 2, marginBottom: 0 }}>
                          {threadActionError[t.conversationId]}
                        </ErrorText>
                      )}
                    </GroupInfo>

                    {/* Right column: status chip (fixed-width, right-aligned) + time —
                        stacked the same way for every row regardless of date text length,
                        instead of an inline chip whose position shifted with the title. */}
                    <RowRight style={{ minWidth: 56 }}>
                      {isDisabled && <RowDisabledChip>Disabled</RowDisabledChip>}
                      {timeLabel && <RowTime>{timeLabel}</RowTime>}
                    </RowRight>
                  </GroupCard>
                );
              })
            }
            </div>
          </ConvListWrap>
        </>

      ) : (
      /* ── GROUPS TAB ─────────────────────────────────────────────────────── */
      <>
        <SidebarHeader>
          <h2>I.EVO</h2>
          <p>Groups · Design | Demonstrate | Deliver</p>
        </SidebarHeader>

        {!isSuperAdmin && creating && (
          <AddCard style={{ margin: '0 12px 8px' }}>
            <FieldLabel>Group Name</FieldLabel>
            <FieldInput
              style={{ marginBottom: 10 }}
              placeholder="e.g. Operations Team"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <FieldLabel>
              Description{' '}
              <span style={{ fontWeight: 400 }}>(optional)</span>
            </FieldLabel>
            <FieldInput
              style={{ marginBottom: 10 }}
              placeholder="What is this group for?"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            {createError && <ErrorText style={{ marginBottom: 8 }}>{createError}</ErrorText>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => { setCreating(false); setNewName(''); setNewDescription(''); setCreateError(''); }}>
                Cancel
              </BtnGhost>
              <BtnPrimary onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </BtnPrimary>
            </div>
          </AddCard>
        )}

        {/* Compose/search — a non-scrolling header sibling ABOVE
            ConvListWrap, not living inside its scroll flow (see
            StickyTop's comment in InboxSidebar.styles.js — a
            sticky-inside-scroll approach here previously let group rows
            scroll up OVER this header instead of staying beneath it). */}
        <StickyTop>
          {!isSuperAdmin && (
            <ComposeBtn onClick={() => setCreating(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Group
            </ComposeBtn>
          )}

          <SearchWrap style={isSuperAdmin ? { margin: '16px 12px 8px 12px' } : undefined}>
            <SearchInput
              type="text"
              placeholder="Search groups by name…"
              value={groupSearch}
              onChange={e => setGroupSearch(e.target.value)}
            />
          </SearchWrap>
        </StickyTop>

        <ConvListWrap>
          <div style={{ padding: '8px 12px' }}>
          {loading && <LoaderWrap><Spinner /></LoaderWrap>}

          {!loading && groups.length === 0 && (
            <ListEmptyMsg>No groups yet.{!isSuperAdmin && ' Create one above.'}</ListEmptyMsg>
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
                <GroupCard
                  key={g.groupId}
                  flash={!!conv?._flash}
                  unread={hasUnread}
                  clickable={g.isSuperAdmin || g.isMember}
                  style={{ margin: '0 0 8px' }}
                  onClick={handleRowClick}
                >
                  <GroupIcon>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                  </GroupIcon>

                  <GroupInfo>
                    <GroupName bold={hasUnread} style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {g.groupName}
                      </span>
                    </GroupName>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden', marginTop: 1 }}>
                      <GroupCount style={{ flexShrink: 0, whiteSpace: 'nowrap', fontWeight: hasUnread ? 600 : 400 }}>
                        {memberLabel}
                      </GroupCount>
                      {g.description && (
                        <>
                          <GroupCount style={{ flexShrink: 0 }}>·</GroupCount>
                          <GroupCount style={{
                            flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontStyle: 'italic',
                          }}>
                            {g.description}
                          </GroupCount>
                        </>
                      )}
                    </div>

                    {actionError[g.groupId] && (
                      <ErrorText style={{ fontSize: 11, marginTop: 2, marginBottom: 0 }}>
                        {actionError[g.groupId]}
                      </ErrorText>
                    )}
                  </GroupInfo>

                  {/* Right column: status chip + time + unread dot — fixed
                      minWidth so every row's right-side content lines up
                      the same way regardless of "Off" presence or how wide
                      the date text is (e.g. "Yesterday" vs "Mon"). */}
                  <RowRight style={{ minWidth: 56 }}>
                    {isDisabled && <RowDisabledChip>Disabled</RowDisabledChip>}
                    {timeLabel && <RowTime unread={hasUnread}>{timeLabel}</RowTime>}
                    {hasUnread && <UnreadDot />}
                  </RowRight>
                </GroupCard>
              );
            })
          }
          </div>
        </ConvListWrap>
      </>
      )}
    </Sidebar>
  );
}
