import { useState, useEffect, useCallback } from 'react';
import { orgGroupApi } from '../api/orgGroupApi';
import RecipientPicker from './RecipientPicker';
import { Sidebar, SidebarHeader } from '../styles/MessagingPage.styles';
import { StickyTop, ComposeBtn, SearchWrap, SearchInput } from '../styles/InboxSidebar.styles';
import { LoaderWrap, Spinner, BtnGhost, BtnPrimary, FieldLabel, FieldInput } from '../styles/shared.styles';
import { ConvListWrap, ListEmptyMsg, GroupCard, GroupIcon, GroupInfo, GroupName, GroupCount, RowRight } from '../styles/ConversationList.styles';
import {
  GroupsPanel, BackRow, BackBtn, ControlCard, AddCard, HintText, ErrorText,
  SectionLabel, MemberScroll, MemberRow, MemberAvatar, MemberInfo, MemberName,
  MemberEmail, MemberActions,
} from '../styles/GroupManager.styles';
import { useSortFilter } from '../../shared/hooks/useSortFilter';
import { SortSelect } from '../../shared/components/TableControls';

function initials(name = '') {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const TeamIcon = ({ color = 'currentColor', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
);

/**
 * TeamManager — admin-managed org-wide "team" groups (org_groups), shown as
 * a Messages sidebar tab ("Teams"). Distinct from GroupManager (comm_groups
 * — user-created CHAT groups with their own conversation): a team has no
 * chat of its own, it's purely a named, reusable set of users that anyone
 * can browse and select as a batch when composing a new message, but only
 * an admin can create/edit/delete or manage membership — same split as
 * "created by admins only, visible to everyone" the feature was asked for.
 */
export default function TeamManager({ isAdmin = false }) {
  const [teams,          setTeams]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [creating,       setCreating]       = useState(false);
  const [newName,        setNewName]        = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMembers,     setNewMembers]     = useState([]);
  const [createError,    setCreateError]    = useState('');
  const [saving,         setSaving]         = useState(false);

  const [managingTeam,   setManagingTeam]   = useState(null);
  const [members,        setMembers]        = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addSelection,   setAddSelection]   = useState([]);
  const [addError,       setAddError]       = useState('');
  const [addSaving,      setAddSaving]      = useState(false);
  const [editName,       setEditName]       = useState('');
  const [editDescription,setEditDescription]= useState('');
  const [editSaving,     setEditSaving]     = useState(false);
  const [editError,      setEditError]      = useState('');

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try { setTeams(await orgGroupApi.list()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError('Team name is required.'); return; }
    setSaving(true); setCreateError('');
    try {
      await orgGroupApi.create(newName.trim(), newDescription.trim() || null, newMembers.map(m => m.id));
      setNewName(''); setNewDescription(''); setNewMembers([]); setCreating(false);
      fetchTeams();
    } catch (err) {
      setCreateError(err?.response?.data?.error || 'Failed to create team.');
    } finally { setSaving(false); }
  };

  const openTeam = async (team) => {
    setManagingTeam(team);
    setEditName(team.name);
    setEditDescription(team.description || '');
    setEditError(''); setAddError(''); setAddSelection([]);
    setMembersLoading(true);
    try { setMembers(await orgGroupApi.getMembers(team.orgGroupId)); }
    catch { setMembers([]); }
    finally { setMembersLoading(false); }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { setEditError('Team name is required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await orgGroupApi.update(managingTeam.orgGroupId, { name: editName.trim(), description: editDescription.trim() || null });
      setManagingTeam(t => ({ ...t, name: editName.trim(), description: editDescription.trim() || null }));
      fetchTeams();
    } catch (err) {
      setEditError(err?.response?.data?.error || 'Failed to save changes.');
    } finally { setEditSaving(false); }
  };

  const handleDeleteTeam = async () => {
    if (!window.confirm(`Delete "${managingTeam.name}"? This can't be undone.`)) return;
    try {
      await orgGroupApi.remove(managingTeam.orgGroupId);
      setManagingTeam(null);
      fetchTeams();
    } catch (err) {
      setEditError(err?.response?.data?.error || 'Failed to delete team.');
    }
  };

  const handleAddMembers = async () => {
    if (!addSelection.length) return;
    setAddSaving(true); setAddError('');
    try {
      const updated = await orgGroupApi.addMembers(managingTeam.orgGroupId, addSelection.map(m => m.id));
      setMembers(updated);
      setAddSelection([]);
      fetchTeams();
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Failed to add members.');
    } finally { setAddSaving(false); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await orgGroupApi.removeMember(managingTeam.orgGroupId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      fetchTeams();
    } catch { /* silent — row stays, user can retry */ }
  };

  // ── Detail / manage view ──────────────────────────────────────────────────
  if (managingTeam) {
    return (
      <Sidebar as="section" data-msg-sidebar style={{ flex: 1 }}>
        <GroupsPanel>
          <BackRow>
            <BackBtn onClick={() => setManagingTeam(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Teams
            </BackBtn>
          </BackRow>

          <h3>{managingTeam.name}</h3>

          {isAdmin ? (
            <AddCard>
              <FieldLabel>Team Name</FieldLabel>
              <FieldInput style={{ marginBottom: 10 }} value={editName} onChange={e => setEditName(e.target.value)} />
              <FieldLabel>Description <span style={{ fontWeight: 400 }}>(optional)</span></FieldLabel>
              <FieldInput style={{ marginBottom: 10 }} value={editDescription} onChange={e => setEditDescription(e.target.value)} />
              {editError && <ErrorText style={{ marginBottom: 8 }}>{editError}</ErrorText>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <BtnGhost onClick={handleDeleteTeam} style={{ color: '#c0392b', borderColor: '#c0392b55' }}>Delete Team</BtnGhost>
                <BtnPrimary onClick={handleSaveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</BtnPrimary>
              </div>
            </AddCard>
          ) : managingTeam.description && (
            <HintText style={{ display: 'block', marginBottom: 16 }}>{managingTeam.description}</HintText>
          )}

          {isAdmin && (
            <AddCard>
              <FieldLabel style={{ marginBottom: 8 }}>Add Members</FieldLabel>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <RecipientPicker value={addSelection} onChange={setAddSelection} groups={[]} />
                </div>
                <BtnPrimary style={{ padding: '9px 16px', fontSize: 12, whiteSpace: 'nowrap', marginTop: 1 }}
                  onClick={handleAddMembers} disabled={addSaving || !addSelection.length}>
                  {addSaving ? '…' : 'Add'}
                </BtnPrimary>
              </div>
              {addError && <ErrorText style={{ marginTop: 8, marginBottom: 0 }}>{addError}</ErrorText>}
            </AddCard>
          )}

          <SectionLabel>{members.length} member{members.length !== 1 ? 's' : ''}</SectionLabel>
          {membersLoading ? (
            <LoaderWrap><Spinner /></LoaderWrap>
          ) : (
            <MemberScroll>
              {members.map(m => {
                const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email;
                return (
                  <MemberRow key={m.userId}>
                    <MemberAvatar>{initials(name)}</MemberAvatar>
                    <MemberInfo>
                      <MemberName>{name}</MemberName>
                      <MemberEmail>{m.email}</MemberEmail>
                    </MemberInfo>
                    {isAdmin && (
                      <MemberActions>
                        <BtnGhost style={{ fontSize: 11, padding: '3px 9px', color: '#c0392b', borderColor: '#c0392b55' }}
                          onClick={() => handleRemoveMember(m.userId)}>Remove</BtnGhost>
                      </MemberActions>
                    )}
                  </MemberRow>
                );
              })}
              {!members.length && <ListEmptyMsg>No members in this team yet.</ListEmptyMsg>}
            </MemberScroll>
          )}
        </GroupsPanel>
      </Sidebar>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  const searched = teams.filter(t => !search.trim() || t.name.toLowerCase().includes(search.toLowerCase()));
  const { items: filtered, sortKey, setSortKey, sortDir, toggleSortDir } = useSortFilter(searched, {
    sorters: {
      name:    (a, b) => a.name.localeCompare(b.name),
      members: (a, b) => (a.memberCount || 0) - (b.memberCount || 0),
    },
    defaultSortKey: 'name',
  });

  return (
    <Sidebar as="section" data-msg-sidebar style={{ flex: 1 }}>
      <SidebarHeader>
        <h2>I.EVO</h2>
        <p>Teams · Design | Demonstrate | Deliver</p>
      </SidebarHeader>

      {isAdmin && creating && (
        <AddCard style={{ margin: '0 12px 8px' }}>
          <FieldLabel>Team Name</FieldLabel>
          <FieldInput
            style={{ marginBottom: 10 }}
            placeholder="e.g. Production Team"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <FieldLabel>Description <span style={{ fontWeight: 400 }}>(optional)</span></FieldLabel>
          <FieldInput
            style={{ marginBottom: 10 }}
            placeholder="What is this team for?"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <FieldLabel style={{ marginBottom: 6 }}>Members</FieldLabel>
          <RecipientPicker value={newMembers} onChange={setNewMembers} groups={[]} />
          {createError && <ErrorText style={{ marginTop: 8, marginBottom: 0 }}>{createError}</ErrorText>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <BtnGhost onClick={() => { setCreating(false); setNewName(''); setNewDescription(''); setNewMembers([]); setCreateError(''); }}>
              Cancel
            </BtnGhost>
            <BtnPrimary onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create'}</BtnPrimary>
          </div>
        </AddCard>
      )}

      <ConvListWrap>
        <StickyTop>
          {isAdmin && (
            <ComposeBtn onClick={() => setCreating(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Team
            </ComposeBtn>
          )}
          <SearchWrap>
            <SearchInput type="text" placeholder="Search teams by name…" value={search} onChange={e => setSearch(e.target.value)} />
          </SearchWrap>
          {teams.length > 1 && (
            <div style={{ padding: '0 12px 8px' }}>
              <SortSelect value={sortKey} onChange={setSortKey} dir={sortDir} onToggleDir={toggleSortDir}
                options={[{ value: 'name', label: 'Name' }, { value: 'members', label: 'Member Count' }]} />
            </div>
          )}
        </StickyTop>

        <div style={{ padding: '8px 12px' }}>
          {loading && <LoaderWrap><Spinner /></LoaderWrap>}
          {!loading && filtered.length === 0 && (
            <ListEmptyMsg>{teams.length === 0 ? `No teams yet.${isAdmin ? ' Create one above.' : ' Ask an admin to set one up.'}` : 'No teams match your search.'}</ListEmptyMsg>
          )}
          {filtered.map(t => (
            <GroupCard key={t.orgGroupId} clickable onClick={() => openTeam(t)}>
              <GroupIcon><TeamIcon /></GroupIcon>
              <GroupInfo>
                <GroupName>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{t.name}</span>
                </GroupName>
                <GroupCount>{t.memberCount} member{t.memberCount !== 1 ? 's' : ''}{t.description ? ` · ${t.description}` : ''}</GroupCount>
              </GroupInfo>
              <RowRight style={{ minWidth: 0 }} />
            </GroupCard>
          ))}
        </div>
      </ConvListWrap>
    </Sidebar>
  );
}
