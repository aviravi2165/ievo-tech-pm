import { useEffect, useRef, useMemo, useState } from 'react';
import MessageBubble from './MessageBubble';
import Composer      from './Composer';
import { useThread } from '../hooks/useThread';
import { messageApi } from '../api/messageApi';
import { groupApi }   from '../api/groupApi';
import api            from '../api/axiosInstance';

const CONV_TYPE_LABEL = {
  bcc:          { label: 'Private',    color: 'var(--muted)' },
  cc:           { label: 'Shared',     color: '#4A9EFF' },
  group_thread: { label: 'Group Chat', color: 'var(--gold)' },
};

export default function ChatWindow({ conversation, currentUserId, onBack, toast, groups = [] }) {
  const { messages, conversation: threadConv, loading, error, markAllRead, sendReply, refetch, onNewMessageRef } =
    useThread(conversation?.conversationId);

  const [replyingTo,       setReplyingTo]       = useState(null);
  const [showParticipants, setShowParticipants]  = useState(false);
  const [removing,         setRemoving]          = useState(null); // userId being removed
  const [removeError,      setRemoveError]       = useState('');
  const [highlightedId,    setHighlightedId]     = useState(null);
  const [showNewPill,      setShowNewPill]        = useState(false); // Case A: scrolled away when a new msg lands in this same chat
  const [newPillCount,     setNewPillCount]       = useState(0);
  const [dividerId,        setDividerId]          = useState(null);  // first-unread marker, computed once per open
  const [addingMember,     setAddingMember]      = useState(false);
  const [memberSearch,     setMemberSearch]      = useState('');
  const [searchResults,    setSearchResults]     = useState([]);
  const [searchLoading,    setSearchLoading]     = useState(false);
  const [groupActionError, setGroupActionError]  = useState('');
  const [groupRemoving,    setGroupRemoving]     = useState(null);
  const [adminToggling,    setAdminToggling]     = useState(null); // userId being promoted/demoted
  const markedAllRef = useRef(null);
  const bottomRef    = useRef(null);
  const containerRef  = useRef(null);
  const messageNodesRef = useRef({}); // messageId -> DOM node
  const dividerComputedForRef = useRef(null); // conversationId we've already computed the divider for

  const registerMessageRef = (messageId, node) => {
    if (node) messageNodesRef.current[messageId] = node;
    else delete messageNodesRef.current[messageId];
  };

  // Jump to (and highlight) the original message a reply references.
  // Works for any participant's reply, since the lookup is purely by
  // messageId against whatever is currently rendered in this thread.
  const handleJumpToParent = (parentMessage) => {
    if (!parentMessage || parentMessage.isDeleted) {
      toast?.('Message unavailable', 'error');
      return;
    }
    const node = messageNodesRef.current[parentMessage.messageId];
    if (!node) {
      toast?.('Message unavailable', 'error');
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(parentMessage.messageId);
  };

  // Clicking anywhere else clears the highlight and returns to normal scrolling.
  useEffect(() => {
    if (highlightedId == null) return;
    const clear = () => setHighlightedId(null);
    // Defer attaching so the click that triggered the jump doesn't immediately clear it.
    const id = setTimeout(() => document.addEventListener('click', clear), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', clear);
    };
  }, [highlightedId]);
 

  // Merge inbox-row data with thread-loaded data (thread data wins for convType/createdBy)
  const conv = useMemo(() => ({
    ...conversation,
    ...(threadConv || {}),
    // participants come from thread load
    participants: threadConv?.participants || conversation?.participants || [],
  }), [conversation, threadConv]);

  const convType   = conv.convType   || 'bcc';
  const createdBy  = conv.createdBy  || conv.created_by;
  const isCcThread = convType === 'cc';
  const isGroupThread = convType === 'group_thread';
  const isSender   = String(createdBy) === String(currentUserId);
  const canReply   = conv.userCanReply ?? conv.allowReply;
  const isGroupDisabled = Boolean(conv.isGroupDisabled);

  // Find the matching group from the groups list to determine admin rights
  const matchedGroup = isGroupThread
    ? groups.find(g => String(g.groupId) === String(conv.groupId || conv.group_id))
    : null;
  const isGroupAdmin = Boolean(matchedGroup?.isAdmin || matchedGroup?.isSuperAdmin);
  // Only the original creator may promote/demote co-admins. Super-admin
  // governance should not be able to mint co-admins from this UI.
  const canManageAdmins = Boolean(matchedGroup?.isCreator);

  const isGroup = useMemo(() => {
    if (conv.participantCount != null) return conv.participantCount > 2;
    return (conv.participants?.length ?? 0) > 2;
  }, [conv.participantCount, conv.participants?.length]);

  // Scroll to bottom on new messages
const firstLoadRef = useRef(true);

useEffect(() => {
  firstLoadRef.current = true;
  dividerComputedForRef.current = null;
  setDividerId(null);
  setShowNewPill(false);
  setNewPillCount(0);
}, [conversation?.conversationId]);

// Compute the "unread starts here" divider ONCE per conversation open, from
// the very first load — before markAllRead has had a chance to mark
// anything read. This snapshot is what was genuinely unread when the
// thread was opened, and stays frozen for the rest of this viewing session
// (it intentionally does not move as messages get marked read while you
// scroll, and won't reappear until you close and reopen the thread fresh).
useEffect(() => {
  const cid = conversation?.conversationId;
  if (!cid || loading || !messages.length) return;
  if (dividerComputedForRef.current === cid) return;
  dividerComputedForRef.current = cid;

  const firstUnread = messages.find(m =>
    String(m.senderId) !== String(currentUserId) &&
    !m.readReceipts?.some(r => String(r.userId) === String(currentUserId))
  );
  setDividerId(firstUnread ? firstUnread.messageId : null);
}, [conversation?.conversationId, loading, messages, currentUserId]);

useEffect(() => {
  if (
    firstLoadRef.current &&
    messages.length > 0
  ) {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'end',
      });
    }, 50);

    firstLoadRef.current = false;
  }
}, [messages.length]);

useEffect(() => {
  if (!messages.length) return;

  const lastMessage = messages[messages.length - 1];
  const iSentIt = String(lastMessage?.senderId) === String(currentUserId);

  if (iSentIt) {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const container = containerRef.current;
  if (!container) return;

  const distanceFromBottom =
    container.scrollHeight -
    container.scrollTop -
    container.clientHeight;

  if (distanceFromBottom < 120) {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages.length, currentUserId]);
  // Wire: when a new message arrives while chat is open, mark it read and
  // show the "new message" pill — but only if the user has scrolled away
  // from the bottom. If they're already at the bottom, the existing
  // auto-scroll effect (below, keyed off messages.length) already brings
  // it into view, so a pill there would just be redundant noise.
  // Keep refs to avoid stale closures inside onNewMessageRef
  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  const markAllReadRef = useRef(markAllRead);
  useEffect(() => { markAllReadRef.current = markAllRead; }, [markAllRead]);

  useEffect(() => {
    if (!onNewMessageRef) return;
    onNewMessageRef.current = (payload) => {
      const uid = currentUserIdRef.current;
      if (uid) markAllReadRef.current(uid);

      const isMine = payload.senderUserId &&
        String(payload.senderUserId) === String(uid);
      if (isMine) return;

      const container = containerRef.current;
      const distanceFromBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight
        : 0;

      if (distanceFromBottom > 120) {
        setShowNewPill(true);
        setNewPillCount(c => c + 1);
      }
    };
    return () => { if (onNewMessageRef) onNewMessageRef.current = null; };
  }, [onNewMessageRef]);

  const handleJumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowNewPill(false);
    setNewPillCount(0);
  };

  // Mark all unread once on open
  // FIX Bug 3 (part 2): removed `messages.length` from the dependency array.
  // Previously this effect re-ran on every single new message arrival (because
  // messages.length changed), which caused markAllRead to iterate all messages
  // again on each arrival. markedReadRef deduplication prevented double DB
  // writes but the full scan still fired. Since markAllRead now uses a ref
  // snapshot internally (not state) and pre-checks markedReadRef before
  // iterating, calling it once per conversation open (when conversationId
  // changes or currentUserId is first set) is enough — newly arriving
  // messages are handled individually by the NEW_MESSAGE socket handler which
  // calls fetchThread(), and the fresh messages from that refetch will be
  // picked up on the next markAllRead call when the conversation re-opens.
  // Reset markedAllRef whenever conversation changes so re-opening same conv works
  useEffect(() => {
    markedAllRef.current = null;
  }, [conversation?.conversationId]);

  // Mark all unread on open — fires once per conversation open
  useEffect(() => {
    if (!currentUserId) return;
    const cid = conversation?.conversationId;
    if (!cid) return;
    if (markedAllRef.current === cid) return;
    markedAllRef.current = cid;
    // Small delay to let messages render first
    const t = setTimeout(() => markAllRead(currentUserId), 100);
    return () => clearTimeout(t);
  }, [conversation?.conversationId, currentUserId, markAllRead]);

  const lastSentByMeId = useMemo(() => {
    const mine = messages.filter(m => String(m.senderId) === String(currentUserId));
    return mine.length ? mine[mine.length - 1].messageId : null;
  }, [messages, currentUserId]);

  // ── Group member management (inline, group_thread only) ──────────────────
  const handleGroupRemoveMember = async (userId, name) => {
    if (!matchedGroup) return;
    if (!window.confirm(`Remove ${name} from this group?`)) return;
    setGroupRemoving(userId); setGroupActionError('');
    try {
      await groupApi.removeMember(matchedGroup.groupId, userId);
      await refetch();
      toast?.(`${name} removed from group`, 'success');
    } catch (err) {
      setGroupActionError(err?.response?.data?.error || 'Failed to remove member.');
    } finally { setGroupRemoving(null); }
  };

  // NEW: promote/demote a participant to group co-admin. Only the
  // original creator or the org super admin may call this — gated by
  // canManageAdmins above, mirroring the backend's assertCanManageAdmins.
  const handleToggleAdmin = async (userId, name, makeAdmin) => {
    if (!matchedGroup) return;
    const verb = makeAdmin ? 'Make' : 'Remove';
    if (!window.confirm(`${verb} ${name} ${makeAdmin ? 'a group admin' : 'as group admin'}?`)) return;
    setAdminToggling(userId); setGroupActionError('');
    try {
      await groupApi.setMemberAdmin(matchedGroup.groupId, userId, makeAdmin);
      await refetch();
      toast?.(`${name} ${makeAdmin ? 'is now a group admin' : 'is no longer a group admin'}`, 'success');
    } catch (err) {
      setGroupActionError(err?.response?.data?.error || 'Failed to update admin status.');
    } finally { setAdminToggling(null); }
  };

  const handleMemberSearch = async (q) => {
    setMemberSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await api.get('/api/users/search', { params: { q, limit: 12 } });
      const users = res.data.users || res.data || [];
      // Filter out existing participants
      const existingIds = new Set(conv.participants.map(p => String(p.userId)));
      setSearchResults(users.filter(u => !existingIds.has(String(u.userId))));
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  const handleAddMember = async (user) => {
    if (!matchedGroup) return;
    setGroupActionError('');
    try {
      await groupApi.addMembers(matchedGroup.groupId, [user.userId]);
      await refetch();
      toast?.(`${user.firstName || ''} ${user.lastName || ''} added`.trim(), 'success');
      setMemberSearch(''); setSearchResults([]);
    } catch (err) {
      setGroupActionError(err?.response?.data?.error || 'Failed to add member.');
    }
  };

  const handleSend = async (payload) => {
    await sendReply(payload);
    setReplyingTo(null);
  };

  // ── Remove participant (CC only, sender only) ──────────────────────────────
  const handleRemoveParticipant = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this shared thread?`)) return;
    setRemoving(userId); setRemoveError('');
    try {
      await messageApi.removeParticipant(conv.conversationId, userId);
      await refetch();  // reload thread to update participant list
    } catch (err) {
      setRemoveError(err?.response?.data?.error || 'Failed to remove participant.');
    } finally {
      setRemoving(null);
    }
  };

  if (!conversation) return null;

  // Participants to display (others only, for header subtitle)
  const others = conv.participants
    .filter(p => String(p.userId) !== String(currentUserId))
    .map(p => `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email);

  // Mentionable participants (everyone except me) — passed to Composer for @-tagging
  const mentionableParticipants = conv.participants.filter(
    p => String(p.userId) !== String(currentUserId)
  );

  // Cap header names at 3 to prevent overflow, show +N for the rest
  const MAX_HEADER_NAMES = 3;
  const participantNames = others.length > MAX_HEADER_NAMES
    ? `${others.slice(0, MAX_HEADER_NAMES).join(', ')} +${others.length - MAX_HEADER_NAMES} more`
    : (others.join(', ') || conv.participantNames || '');
  const typeInfo = CONV_TYPE_LABEL[convType] || CONV_TYPE_LABEL.bcc;

  return (
    <>
      {/* ── Thread header ── */}
      <div className="thread-header">
        {onBack && (
          <button className="icon-btn" onClick={onBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}

       <div className="thread-header-info" style={{ flex: 1, minWidth: 0 }}>
  <div className="thread-subject">
    {conv.subject}
  </div>

  <div className="thread-count">
    {messages.length} message{messages.length !== 1 ? 's' : ''}
  </div>
          <div className="thread-meta" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Conv type badge */}
            <span style={{
              fontSize: 10, fontWeight: 700, color: typeInfo.color,
              textTransform: 'uppercase', letterSpacing: '.06em',
              border: `1px solid ${typeInfo.color}`,
              borderRadius: 8, padding: '1px 7px', opacity: .85,
            }}>
              {typeInfo.label}
            </span>
            {participantNames && (
              <span style={{ color: 'var(--muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isCcThread ? `With: ${participantNames}` : participantNames}
              </span>
            )}
          </div>
        </div>

        <div className="thread-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {!canReply && (
            <span style={{
              fontSize: 10, color: 'var(--gold-dim)', padding: '2px 8px',
              border: '1px solid var(--gold-dim)', borderRadius: 8,
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>
              {isGroupDisabled ? (isGroupThread ? 'Group Disabled' : 'Thread Disabled') : conv.allowReply ? 'Read only' : 'Broadcast'}
            </span>
          )}

          {/* Participants panel toggle — CC and group threads */}
          {(isCcThread || isGroupThread) && (
            <button
              className={`icon-btn ${showParticipants ? 'active' : ''}`}
              title="Participants"
              onClick={() => setShowParticipants(v => !v)}
              style={{ width: 30, height: 30 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </button>
          )}


        </div>
      </div>

      {/* ── Participants panel (CC: removable by sender; group threads: view only) ── */}
      {showParticipants && (isCcThread || isGroupThread) && (
        <div style={{
          padding: '10px 16px 12px',
          borderBottom: '1px solid var(--divider)',
          background: 'var(--charcoal)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 11, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8, fontWeight: 600,
          }}>
            Participants ({conv.participants.length})
            {isCcThread && isSender && (
              <span style={{ marginLeft: 6, color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                · You can remove others
              </span>
            )}
            {isGroupThread && isGroupAdmin && !isGroupDisabled && (
              <button
                onClick={() => { setAddingMember(v => !v); setMemberSearch(''); setSearchResults([]); }}
                style={{
                  marginLeft: 10, background: 'var(--mid)', border: '1px solid var(--divider)',
                  borderRadius: 12, padding: '2px 10px', fontSize: 11, color: 'var(--gold)',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                + Add member
              </button>
            )}
            {isGroupThread && !isGroupAdmin && (
              <span style={{ marginLeft: 6, color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                · Managed in the Groups tab
              </span>
            )}
          </div>
          {(removeError || groupActionError) && (
            <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 6 }}>{removeError || groupActionError}</div>
          )}
          {/* Inline add member — group admin only */}
          {isGroupThread && isGroupAdmin && addingMember && (
            <div style={{ marginBottom: 10 }}>
              <input
                autoFocus
                value={memberSearch}
                onChange={e => handleMemberSearch(e.target.value)}
                placeholder="Search users to add…"
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 8,
                  border: '1px solid var(--divider)', background: 'var(--mid)',
                  color: 'var(--light)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
                }}
              />
              {searchLoading && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Searching…</div>}
              {searchResults.length > 0 && (
                <div style={{
                  marginTop: 4, background: 'var(--dark)', border: '1px solid var(--divider)',
                  borderRadius: 8, overflow: 'hidden', maxHeight: 140, overflowY: 'auto',
                }}>
                  {searchResults.map(u => (
                    <div
                      key={u.userId}
                      onClick={() => handleAddMember(u)}
                      style={{
                        padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--light)',
                        borderBottom: '1px solid var(--divider)',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--mid)'}
                      onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
                    >
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
                      {u.email && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{u.email}</span>}
                    </div>
                  ))}
                </div>
              )}
              {!searchLoading && memberSearch.trim() && searchResults.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>No users found</div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
            {conv.participants.map(p => {
              const isMe    = String(p.userId) === String(currentUserId);
              const pName   = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unknown';
              const isRemoving = removing === p.userId || groupRemoving === p.userId;
              const isToggling = adminToggling === p.userId;
              return (
                <span key={p.userId} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px 3px 10px',
                  background: isMe ? 'rgba(237,28,36,0.06)' : 'var(--mid)',
                  border: `1px solid ${isMe ? 'rgba(237,28,36,0.25)' : 'var(--divider)'}`,
                  borderRadius: 20, fontSize: 12, color: 'var(--light)',
                }}>
                  {pName}
                  {isMe && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>you</span>
                  )}
                  {/* Admin badge — creator (gold) or co-admin (muted), group threads only */}
                  {isGroupThread && p.isCreator && (
                    <span style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 600 }}>Admin</span>
                  )}
                  {isGroupThread && !p.isCreator && p.isCoAdmin && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Co-admin</span>
                  )}
                  {/* Make/Remove admin — creator or super admin only; never on the creator themself */}
                  {isGroupThread && canManageAdmins && !isGroupDisabled && !isMe && !p.isCreator && (
                    <button
                      title={p.isCoAdmin ? `Remove ${pName} as group admin` : `Make ${pName} a group admin`}
                      onClick={() => handleToggleAdmin(p.userId, pName, !p.isCoAdmin)}
                      disabled={!!isToggling}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: p.isCoAdmin ? 'var(--gold)' : 'var(--muted)', fontSize: 11, lineHeight: 1,
                        padding: '0 0 0 2px', transition: 'color 0.12s', fontWeight: 600,
                        display: 'flex', alignItems: 'center',
                      }}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--gold)'}
                      onMouseOut={e  => e.currentTarget.style.color = p.isCoAdmin ? 'var(--gold)' : 'var(--muted)'}
                    >
                      {isToggling
                        ? <div className="spinner" style={{ width: 9, height: 9, borderWidth: 1.5 }}/>
                        : (p.isCoAdmin ? '★' : '☆')}
                    </button>
                  )}
                  {/* Remove button — CC: sender only; group_thread: group admin only */}
                  {((isCcThread && isSender) || (isGroupThread && isGroupAdmin && !isGroupDisabled)) && !isMe && !(isGroupThread && p.isCreator) && (
                    <button
                      title={`Remove ${pName}`}
                      onClick={() => isGroupThread ? handleGroupRemoveMember(p.userId, pName) : handleRemoveParticipant(p.userId, pName)}
                      disabled={!!isRemoving}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--muted)', fontSize: 14, lineHeight: 1,
                        padding: '0 0 0 2px', transition: 'color 0.12s',
                        display: 'flex', alignItems: 'center',
                      }}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseOut={e  => e.currentTarget.style.color = 'var(--muted)'}
                    >
                      {isRemoving
                        ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }}/>
                        : '×'}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="thread-scroll-wrap">
        <div
          className="gmail-thread-view"
          ref={containerRef}
          onScroll={(e) => {
            if (!showNewPill) return;
            const el = e.currentTarget;
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            if (distanceFromBottom < 80) {
              setShowNewPill(false);
              setNewPillCount(0);
            }
          }}
        >
          {loading && <div className="loader-wrap"><div className="spinner"/></div>}
          {error && (
            <div style={{ color: 'var(--danger)', padding: 16, fontSize: 13 }}>
              Failed to load.{' '}
              <button onClick={refetch}
                style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}
          {!loading && messages.map(msg => (
            <div key={msg.messageId}>
              {msg.messageId === dividerId && (
                <div className="unread-divider"><span>New messages</span></div>
              )}
              <MessageBubble
                message={msg}
                isMine={String(msg.senderId) === String(currentUserId)}
                isGroup={isGroup}
                currentUserId={currentUserId}
                isLastSentByMe={msg.messageId === lastSentByMeId}
                onReply={canReply ? setReplyingTo : null}
                onJumpToParent={handleJumpToParent}
                isHighlighted={msg.messageId === highlightedId}
                registerRef={registerMessageRef}
              />
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>

        {showNewPill && (
          <button className="new-msg-pill" onClick={handleJumpToBottom}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
            </svg>
            {newPillCount > 1 ? `${newPillCount} new messages` : 'New message'}
          </button>
        )}
      </div>

      {/* ── Composer (or read-only banner when the group has been disabled) ── */}
      {isGroupDisabled ? (
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--divider)',
          background: 'var(--charcoal)',
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--muted)', fontSize: 13,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          {isGroupThread
            ? 'This group has been disabled by its admin — you can still read past messages, but no one can send new ones.'
            : 'This thread has been disabled by an admin — you can still read past messages, but no one can send new ones.'}
        </div>
      ) : (
        <Composer
          allowReply={canReply}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSend={handleSend}
          participants={mentionableParticipants}
        />
      )}
    </>
  );
}