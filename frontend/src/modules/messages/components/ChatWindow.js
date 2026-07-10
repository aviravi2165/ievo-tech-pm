import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import MessageBubble from './MessageBubble';
import Composer      from './Composer';
import { useThread }    from '../hooks/useThread';
import { useMessaging } from '../context/MessagingContext';
import { useSocket }    from '../context/SocketContext';
import { messageApi } from '../api/messageApi';
import { groupApi }   from '../api/groupApi';
import api            from '../api/axiosInstance';
import { IconBtn, LoaderWrap, Spinner } from '../styles/shared.styles';
import {
  ThreadHeader, ThreadHeaderInfo, ThreadSubject, TypeBadge, ThreadMetaText,
  DescText, DescInner, MessageCount, ThreadActions, ReadOnlyTag,
  GroupEditPanel, EditFieldLabel, EditFieldInput, ParticipantsPanel,
  ParticipantsHeading, AddParticipantBtn, ParticipantSearchInput,
  ParticipantSearchResults, ParticipantSearchRow, ParticipantChipsWrap,
  ParticipantChip, ChipMeta, ChipAdminBadge, ChipCoAdminBadge, ChipIconBtn,
  ThreadScrollWrap, GmailThreadView, NewMsgPill, UnreadDivider,
  NoAccessWrap, RetryBtn, DisabledBanner,
} from '../styles/ChatWindow.styles';
import { ErrorBox as ComposeErrorBox } from '../styles/ComposeModal.styles';
import { BtnGhost, BtnPrimary } from '../styles/shared.styles';

// How many minutes after sending a message it remains editable.
// Configurable via VITE_MESSAGE_EDIT_DEADLINE_MINUTES (frontend env);
// the actual enforcement happens server-side using the same window.
const editDeadlineMinutes = parseInt(import.meta.env.VITE_MESSAGE_EDIT_DEADLINE_MINUTES || '10', 10);

function convTypeLabel(theme) {
  return {
    bcc:          { label: 'Private',    bg: `${theme.colors.espresso}1f`, color: theme.colors.espresso, border: theme.colors.espresso },
    cc:           { label: 'Shared',     bg: 'rgba(124,143,160,0.15)', color: theme.colors.info, border: theme.colors.info },
    group_thread: { label: 'Group Chat', bg: 'rgba(196,154,108,0.15)', color: theme.colors.warning, border: theme.colors.warning },
  };
}

export default function ChatWindow({ conversation, onBack, onDisableGroup, onEnableGroup, onDeleteGroup, onHideGroup }) {
  const theme = useTheme();
  const { currentUserId, toast, groups = [] } = useMessaging();
  const { messages, conversation: threadConv, loading, ready, error, markAllRead, sendReply, editMessage, appendMessage, refetch, onNewMessageRef } =
    useThread(conversation?.conversationId);
  const { socket } = useSocket();

  const [replyingTo,       setReplyingTo]       = useState(null);
  const [showParticipants, setShowParticipants]  = useState(false);
  const [descExpanded,     setDescExpanded]      = useState(false);
  const [isDescTruncated,  setIsDescTruncated]   = useState(false);
  const [removing,         setRemoving]          = useState(null);
  const [removeError,      setRemoveError]       = useState('');
  const [highlightedId,    setHighlightedId]     = useState(null);
  const [showNewPill,      setShowNewPill]        = useState(false);
  const [newPillCount,     setNewPillCount]       = useState(0);
  const [dividerId,        setDividerId]          = useState(null);
  const [addingMember,     setAddingMember]      = useState(false);
  const [memberSearch,     setMemberSearch]      = useState('');
  const [searchResults,    setSearchResults]     = useState([]);
  const [searchLoading,    setSearchLoading]     = useState(false);
  const [groupActionError, setGroupActionError]  = useState('');
  const [groupRemoving,    setGroupRemoving]     = useState(null);
  const [adminToggling,    setAdminToggling]     = useState(null);
  const [groupActing,      setGroupActing]       = useState(false);
  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editBody,         setEditBody]         = useState('');
  const [editError,        setEditError]        = useState('');
  const [editSaving,       setEditSaving]       = useState(false);
  // Edit group name/description state
  const [editingGroup,     setEditingGroup]     = useState(false);
  const [editGroupName,    setEditGroupName]    = useState('');
  const [editGroupDesc,    setEditGroupDesc]    = useState('');
  const [editGroupError,   setEditGroupError]   = useState('');
  const [editGroupSaving,  setEditGroupSaving]  = useState(false);
  // Group name/description can be updated via socket GROUP_UPDATED
  const [liveGroupName,    setLiveGroupName]    = useState(null);
  const [liveGroupDesc,    setLiveGroupDesc]    = useState(null);

  const composerRef  = useRef(null);
  const markedAllRef = useRef(null);
  const bottomRef    = useRef(null);
  const containerRef  = useRef(null);
  const messageNodesRef = useRef({}); // messageId -> DOM node
  const dividerComputedForRef = useRef(null); // conversationId we've already computed the divider for
  const descRef = useRef(null);
  const initialScrollDoneRef = useRef(false); // has the initial scroll-to-divider/bottom run for this conversation?
  const dividerRef = useRef(null); // DOM node of the "New messages" divider line itself

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
  const isRemoved  = Boolean(conv.isRemoved);

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

  // Check if the group description exceeds its container width
  useEffect(() => {
    const checkTruncation = () => {
      if (descRef.current && !descExpanded) {
        setIsDescTruncated(descRef.current.scrollWidth > descRef.current.clientWidth);
      }
    };
    const timeoutId = setTimeout(checkTruncation, 0);
    window.addEventListener('resize', checkTruncation);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkTruncation);
    };
  }, [matchedGroup?.description, descExpanded]);

  // ── Reset per conversation ────────────────────────────────────────────────
  useEffect(() => {
    dividerComputedForRef.current = null;
    setDividerId(null);
    setShowNewPill(false);
    setNewPillCount(0);
    initialScrollDoneRef.current = false;
  }, [conversation?.conversationId]);

  // Compute the "unread starts here" divider ONCE per conversation open, from
  // the very first load — before markAllRead has had a chance to mark
  // anything read. This snapshot is what was genuinely unread when the
  // thread was opened, and stays frozen for the rest of this viewing session
  // (it intentionally does not move as messages get marked read while you
  // scroll, and won't reappear until you close and reopen the thread fresh).
  // Declared as useLayoutEffect, and BEFORE the scroll effect below, so the
  // divider position is known before we decide where to scroll.
  useLayoutEffect(() => {
    const cid = conversation?.conversationId;
    if (!cid || loading || !messages.length) return;
    if (dividerComputedForRef.current === cid) return;
    dividerComputedForRef.current = cid;

    const firstUnread = messages.find(m =>
      !m.isSystem &&
      String(m.senderId) !== String(currentUserId) &&
      !m.readReceipts?.some(r => String(r.userId) === String(currentUserId))
    );
    setDividerId(firstUnread ? firstUnread.messageId : null);
  }, [conversation?.conversationId, loading, messages, currentUserId]);

  // ── Initial scroll: land on the unread divider if one exists, else bottom ──
  // useLayoutEffect fires before browser paint, avoiding any visible jump.
  // Waits for dividerId to be computed (or confirmed absent) before scrolling,
  // so we don't scroll to bottom first and then jump up to the divider.
  useLayoutEffect(() => {
    if (initialScrollDoneRef.current || loading || !messages.length) return;
    if (dividerComputedForRef.current !== conversation?.conversationId) return; // wait for divider calc
    const c = containerRef.current;
    if (!c) return;

    if (dividerId) {
      const node = messageNodesRef.current[dividerId];
      if (node) {
        // Scroll so the divider sits near the top of the visible area
        c.scrollTop = node.offsetTop - 12;
      } else {
        c.scrollTop = c.scrollHeight;
      }
    } else {
      c.scrollTop = c.scrollHeight;
    }
    initialScrollDoneRef.current = true;
  });

  // ── Remove the "New messages" divider once it's been scrolled past ────────
  // The divider's POSITION is intentionally frozen for the session (computed
  // once in the effect above) so it doesn't jump around as things get marked
  // read. But the divider itself should disappear promptly once the user has
  // actually scrolled down past it and seen the messages below — not linger
  // for the rest of the session. Watches the divider's own DOM node: once it
  // scrolls above the visible scroll area (top edge negative relative to the
  // container), it's been seen and is cleared.
  useEffect(() => {
    if (!dividerId) return;
    const root = containerRef.current;
    const node = dividerRef.current;
    if (!root || !node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const scrolledPast =
          !entry.isIntersecting &&
          entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        if (scrolledPast) {
          setDividerId(null);
          observer.disconnect();
        }
      },
      { root, threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [dividerId]);



  useEffect(() => {
    if (!messages.length) return;

    const lastMessage = messages[messages.length - 1];
    const iSentIt = String(lastMessage?.senderId) === String(currentUserId);

    if (iSentIt) {
      // Scroll within the container only — not the whole viewport
      const c = containerRef.current;
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    if (distanceFromBottom < 120) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
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

      // Use the pre-captured distance (snapshot taken BEFORE fetchThread resolved
      // and auto-scroll may have fired). Falls back to live measurement if not present.
      const distanceFromBottom = payload._distanceFromBottom != null
        ? payload._distanceFromBottom
        : (() => {
            const c = containerRef.current;
            return c ? c.scrollHeight - c.scrollTop - c.clientHeight : 0;
          })();

      if (distanceFromBottom > 120) {
        setShowNewPill(true);
        setNewPillCount(c => c + 1);
      }
    };
    return () => { if (onNewMessageRef) onNewMessageRef.current = null; };
  }, [onNewMessageRef]);

  const handleJumpToBottom = () => {
    const c = containerRef.current;
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    setShowNewPill(false);
    setNewPillCount(0);
  };

  // Mark all unread once on open
  useEffect(() => {
    markedAllRef.current = null;
  }, [conversation?.conversationId]);

  // Mark all unread on open — fires once per conversation open.
  //
  // BUG FIX: this used to fire off a flat setTimeout(..., 100) racing an
  // unbounded network+DB fetch (useThread's initial load), instead of
  // actually waiting for that fetch to finish. On anything slower than
  // 100ms — the normal case for a real round trip, not just a bad-network
  // edge case — `markAllRead` ran against a still-empty `messages` array
  // and silently marked nothing as read server-side. The unread dot still
  // *looked* cleared because `clearUnreadDot` (called separately, in
  // handleSelectConv) is a purely local optimistic UI update — it doesn't
  // touch the server at all. So the dot reappeared on the next inbox
  // refetch (tab switch, reload, socket-triggered refresh), because the
  // server's own unread count — computed from actual read-receipt rows —
  // never changed.
  //
  // Switching this to depend on `loading` instead of a timeout was NOT
  // enough by itself: `loading` starts `false` and only flips `true`
  // *inside* the async fetch, one render later than this effect's own
  // first run in the same commit — so this effect could still see a
  // stale `loading===false` on the very first render (before the fetch
  // had even started) and fire prematurely anyway, permanently consuming
  // the markedAllRef guard with nothing to show for it. `ready` (from
  // useThread) is a ref-backed signal that's only true once the fetch has
  // actually resolved for the CURRENT conversationId, with no such
  // same-commit race.
  useEffect(() => {
    if (!currentUserId || !ready) return;
    const cid = conversation?.conversationId;
    if (!cid) return;
    if (markedAllRef.current === cid) return;
    markedAllRef.current = cid;
    markAllRead(currentUserId);
  }, [conversation?.conversationId, currentUserId, ready, markAllRead]);

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
    setGroupActionError('');
    try {
      // Group threads: add via the group's member list (propagates to
      // every conversation tied to that group). CC threads: add directly
      // to this single conversation's participant list.
      if (isGroupThread) {
        if (!matchedGroup) return;
        await groupApi.addMembers(matchedGroup.groupId, [user.userId]);
      } else if (isCcThread) {
        await messageApi.addParticipants(conv.conversationId, [user.userId]);
      } else {
        return;
      }
      await refetch();
      toast?.(`${user.firstName || ''} ${user.lastName || ''} added`.trim(), 'success');
      setMemberSearch(''); setSearchResults([]);
    } catch (err) {
      setGroupActionError(err?.response?.data?.error || 'Failed to add participant.');
    }
  };

  // ── Group governance (disable/enable/delete/hide)
  const runGroupAction = async (action, confirmMsg, { closesView } = {}) => {
    if (!matchedGroup) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setGroupActing(true); setGroupActionError('');
    try {
      await action(matchedGroup.groupId);
      window.dispatchEvent(new Event('groups-updated'));
      // 'groups-updated' only refreshes the sidebar's group list (so the
      // disable/enable icon itself flips state) — it does NOT refetch this
      // open thread's own conversation data. Without this, disabling your
      // own currently-open group left the composer live and no disabled
      // banner until a manual reload, even though the action had actually
      // succeeded server-side (only the OTHER participant, who reopens
      // fresh, saw the correct frozen state).
      if (!closesView) await refetch();
      if (closesView) onBack?.();
    } catch (err) {
      setGroupActionError(err?.response?.data?.error || 'Action failed. Try again.');
    } finally {
      setGroupActing(false);
    }
  };

  const handleDisableGroupClick = () => runGroupAction(
    onDisableGroup,
    `Disable "${matchedGroup?.groupName}"? No one will be able to send new messages, but everyone keeps read access to past chats.`
  );
  const handleEnableGroupClick = () => runGroupAction(
    onEnableGroup,
    `Re-enable "${matchedGroup?.groupName}"? Members will be able to send messages again.`
  );
  const handleDeleteGroupClick = () => runGroupAction(
    onDeleteGroup,
    `Delete "${matchedGroup?.groupName}" from your tabs? Other participants keep seeing it (read-only) until they each remove it too.`,
    { closesView: true }
  );
  const handleHideGroupClick = () => runGroupAction(
    onHideGroup,
    `Remove "${matchedGroup?.groupName}" from your tabs? This only affects your own view.`,
    { closesView: true }
  );

  const handleReply = (message) => {
    setReplyingTo(message);
    // Focus the composer editor after setting reply context
    setTimeout(() => {
      const editor = composerRef.current?.querySelector('[contenteditable]');
      if (editor) editor.focus();
    }, 0);
  };

  // Edit message handlers
  const handleEditStart = (msg) => {
    setEditingMessageId(msg.messageId);
    // BUG FIX: textContent silently drops <br> elements with no replacement
    // character, so a 3-line message became one merged line the instant you
    // opened the edit textarea. Convert line-break-producing tags to '\n'
    // FIRST, then extract the now-plain text so breaks survive into the
    // textarea (and round-trip back to <br> on save below).
    const withNewlines = (msg.bodyHtml || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '');
    const tmp = document.createElement('div');
    tmp.innerHTML = withNewlines;
    setEditBody((tmp.textContent || '').replace(/\u200B/g, ''));
    setEditError('');
  };
  const handleEditCancel = () => { setEditingMessageId(null); setEditBody(''); setEditError(''); };
  const handleEditSave = async (messageId) => {
    if (!editBody.trim()) { setEditError('Message cannot be empty.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await editMessage(messageId, `<p>${editBody.replace(/\n/g, '<br>')}</p>`);
      setEditingMessageId(null); setEditBody('');
    } catch (err) {
      setEditError(err?.response?.data?.error || 'Edit failed. The edit window may have passed.');
    } finally { setEditSaving(false); }
  };

  // Group name/description edit handlers
  const handleGroupEditStart = () => {
    setEditGroupName(liveGroupName || matchedGroup?.groupName || '');
    setEditGroupDesc(liveGroupDesc !== null ? liveGroupDesc : (matchedGroup?.description || ''));
    setEditGroupError('');
    setEditingGroup(true);
  };
  const handleGroupEditCancel = () => { setEditingGroup(false); setEditGroupError(''); };
  const handleGroupEditSave = async () => {
    if (!editGroupName.trim()) { setEditGroupError('Group name is required.'); return; }
    setEditGroupSaving(true); setEditGroupError('');
    try {
      const result = await groupApi.update(matchedGroup.groupId, { groupName: editGroupName.trim(), description: editGroupDesc.trim() || null });
      setLiveGroupName(editGroupName.trim());
      setLiveGroupDesc(editGroupDesc.trim() || null);
      setEditingGroup(false);
      // BUG FIX: don't wait on the NEW_MESSAGE socket round-trip to show the
      // "Group name changed…" / "Description added…" notice — append it to
      // this open chat window immediately from the PATCH response itself.
      // The socket event still arrives a moment later for OTHER participants
      // (and for this client too, harmlessly — appendMessage dedupes by
      // messageId), but the person making the change no longer has to
      // reopen or refresh the chat to see their own system message appear.
      if (result?.insertedMessage) {
        appendMessage({
          messageId:      result.insertedMessage.messageId,
          conversationId: result.insertedMessage.conversationId,
          senderId:       null,
          senderName:     null,
          bodyHtml:       result.insertedMessage.bodyHtml,
          sentAt:         result.insertedMessage.sentAt,
          isSystem:       true,
          attachments:    [],
          parentMessage:  null,
          readReceipts:   [],
        });
      }
      // BUG FIX: without this, the global `groups` list (used by GroupManager's
      // sidebar list and as the fallback source for matchedGroup.description
      // whenever this chat window remounts) never refetches. The edit looked
      // like it worked (system message + live header update in THIS open
      // window), but reopening the group, navigating away and back, or
      // checking the Groups tab list would all still show the old/empty
      // description because nothing told the rest of the app to refetch.
      window.dispatchEvent(new Event('groups-updated'));
    } catch (err) {
      setEditGroupError(err?.response?.data?.error || 'Update failed.');
    } finally { setEditGroupSaving(false); }
  };

  // GROUP_UPDATED socket listener — live header name/description updates.
  // The actual change notice ("Group name changed from X to Y") arrives
  // separately as a persisted system message via the normal NEW_MESSAGE
  // socket event, which useThread() appends to `messages` automatically —
  // so it shows inline in the chat history (and survives a refresh), rather
  // than as a client-side-only toast that disappears.
  useEffect(() => {
    if (!socket || !conv.groupId) return;
    socket.emit('join_group', { groupId: conv.groupId });
    const onGroupUpdated = ({ groupId, groupName, description }) => {
      if (String(groupId) !== String(conv.groupId)) return;
      if (groupName)   setLiveGroupName(groupName);
      if (description !== undefined) setLiveGroupDesc(description);
    };
    socket.on('GROUP_UPDATED', onGroupUpdated);
    return () => {
      socket.off('GROUP_UPDATED', onGroupUpdated);
      socket.emit('leave_group', { groupId: conv.groupId });
    };
  }, [socket, conv.groupId]);

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
  const typeInfo = convTypeLabel(theme)[convType] || convTypeLabel(theme).bcc;

  return (
    <>
      {/* ── Thread header ── */}
      <ThreadHeader>
        {onBack && (
          <IconBtn onClick={onBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </IconBtn>
        )}

       <ThreadHeaderInfo>
          {/* Subject line */}
          <ThreadSubject>
            {isGroupThread ? (liveGroupName || conv.groupName || conv.subject) : conv.subject}
          </ThreadSubject>

          {/* Meta row: type badge + participants/description */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            {/* Type badge — filled, same across all types */}
            <TypeBadge bg={typeInfo.bg} color={typeInfo.color} border={typeInfo.border}>
              {typeInfo.label}
            </TypeBadge>

            {/* Participants (non-group) */}
            {!isGroupThread && participantNames && (
              <ThreadMetaText>
                {isCcThread ? `With: ${participantNames}` : participantNames}
              </ThreadMetaText>
            )}

            {/* Group description — expandable */}
            {isGroupThread && (liveGroupDesc !== null ? liveGroupDesc : matchedGroup?.description) && (
              <DescText
                truncatable={isDescTruncated}
                expanded={descExpanded}
                onClick={() => {
                  if (isDescTruncated) setDescExpanded(v => !v);
                }}
                title={isDescTruncated ? (descExpanded ? 'Click to collapse' : 'Click to expand') : ''}
              >
                <DescInner ref={descRef} expanded={descExpanded}>
                  {liveGroupDesc !== null ? liveGroupDesc : matchedGroup?.description}
                </DescInner>

                {/* Only render if truncated, and color changed to grey (text-muted) */}
                {isDescTruncated && !descExpanded && (
                  <span style={{ color: theme.colors.ash, marginLeft: 4, fontStyle: 'normal', fontSize: 11, flexShrink: 0 }}>
                    …more
                  </span>
                )}
              </DescText>
            )}
          </div>

          {/* Message count — lighter, below */}
          <MessageCount>
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </MessageCount>
        </ThreadHeaderInfo>

        <ThreadActions>
          {!canReply && (
            <ReadOnlyTag>
              {isGroupDisabled ? (isGroupThread ? 'Group Disabled' : 'Thread Disabled') : conv.allowReply ? 'Read only' : 'Broadcast'}
            </ReadOnlyTag>
          )}

          {/* Group edit button — admin only */}
          {isGroupThread && isGroupAdmin && !isGroupDisabled && (
            <IconBtn
              title="Edit group name / description"
              onClick={editingGroup ? handleGroupEditCancel : handleGroupEditStart}
              style={{ width: 30, height: 30 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </IconBtn>
          )}

          {/* Participants panel toggle — CC and group threads */}
          {(isCcThread || isGroupThread) && (
            <IconBtn
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
            </IconBtn>
          )}


          {/* Group governance — disable/enable/delete/hide. */}
          {isGroupThread && (matchedGroup?.isCreator || matchedGroup?.isSuperAdmin) && (
            !isGroupDisabled ? (
              <IconBtn
                danger
                title="Disable group"
                disabled={groupActing}
                onClick={handleDisableGroupClick}
                style={{ width: 30, height: 30 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
              </IconBtn>
            ) : (
              <>
                <IconBtn
                  title="Re-enable group"
                  disabled={groupActing}
                  onClick={handleEnableGroupClick}
                  style={{ width: 30, height: 30 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                  </svg>
                </IconBtn>
                <IconBtn
                  danger
                  title="Delete group"
                  disabled={groupActing}
                  onClick={handleDeleteGroupClick}
                  style={{ width: 30, height: 30 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </IconBtn>
              </>
            )
          )}
          {isGroupThread && !(matchedGroup?.isCreator || matchedGroup?.isSuperAdmin) && isGroupDisabled && (
            <IconBtn
              danger
              title="Remove from my tabs"
              disabled={groupActing}
              onClick={handleHideGroupClick}
              style={{ width: 30, height: 30 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </IconBtn>
          )}
        </ThreadActions>
      </ThreadHeader>

      {/* ── Group edit panel ── */}
      {isGroupThread && editingGroup && isGroupAdmin && (
        <GroupEditPanel>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <EditFieldLabel>Group Name</EditFieldLabel>
              <EditFieldInput
                value={editGroupName}
                onChange={e => setEditGroupName(e.target.value)}
              />
            </div>
            <div style={{ flex: 2 }}>
              <EditFieldLabel>Description <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></EditFieldLabel>
              <EditFieldInput
                value={editGroupDesc}
                onChange={e => setEditGroupDesc(e.target.value)}
                placeholder="What is this group for?"
              />
            </div>
          </div>
          {editGroupError && <ComposeErrorBox style={{ marginBottom: 6 }}>{editGroupError}</ComposeErrorBox>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <BtnGhost onClick={handleGroupEditCancel} style={{ padding: '5px 14px', fontSize: 12 }}>Cancel</BtnGhost>
            <BtnPrimary onClick={handleGroupEditSave} disabled={editGroupSaving} style={{ padding: '5px 14px', fontSize: 12 }}>
              {editGroupSaving ? 'Saving…' : 'Save changes'}
            </BtnPrimary>
          </div>
        </GroupEditPanel>
      )}

      {/* ── Participants panel (CC: removable by sender; group threads: view only) ── */}
      {showParticipants && (isCcThread || isGroupThread) && (
        <ParticipantsPanel>
          <ParticipantsHeading>
            Participants ({conv.participants.length})
            {isCcThread && isSender && !isGroupDisabled && (
              <AddParticipantBtn onClick={() => { setAddingMember(v => !v); setMemberSearch(''); setSearchResults([]); }}>
                + Add participant
              </AddParticipantBtn>
            )}
            {isCcThread && isSender && (
              <span style={{ marginLeft: 6, color: theme.colors.ash, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                · You can remove others
              </span>
            )}
            {isGroupThread && isGroupAdmin && !isGroupDisabled && (
              <AddParticipantBtn onClick={() => { setAddingMember(v => !v); setMemberSearch(''); setSearchResults([]); }}>
                + Add member
              </AddParticipantBtn>
            )}
            {isGroupThread && !isGroupAdmin && (
              <span style={{ marginLeft: 6, color: theme.colors.ash, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
                · Managed in the Groups tab
              </span>
            )}
          </ParticipantsHeading>
          {(removeError || groupActionError) && (
            <ComposeErrorBox style={{ marginBottom: 6, fontSize: 11, padding: '4px 8px' }}>{removeError || groupActionError}</ComposeErrorBox>
          )}
          {/* Inline add member/participant — group admin or CC thread creator */}
          {((isGroupThread && isGroupAdmin) || (isCcThread && isSender)) && addingMember && (
            <div style={{ marginBottom: 10 }}>
              <ParticipantSearchInput
                autoFocus
                value={memberSearch}
                onChange={e => handleMemberSearch(e.target.value)}
                placeholder="Search users to add…"
              />
              {searchLoading && <div style={{ fontSize: 11, color: theme.colors.ash, marginTop: 4 }}>Searching…</div>}
              {searchResults.length > 0 && (
                <ParticipantSearchResults>
                  {searchResults.map(u => (
                    <ParticipantSearchRow key={u.userId} onClick={() => handleAddMember(u)}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
                      {u.email && <span style={{ color: theme.colors.ashLight, marginLeft: 6 }}>{u.email}</span>}
                    </ParticipantSearchRow>
                  ))}
                </ParticipantSearchResults>
              )}
              {!searchLoading && memberSearch.trim() && searchResults.length === 0 && (
                <div style={{ fontSize: 11, color: theme.colors.ash, marginTop: 4 }}>No users found</div>
              )}
            </div>
          )}
          <ParticipantChipsWrap>
            {conv.participants.map(p => {
              const isMe    = String(p.userId) === String(currentUserId);
              const pName   = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unknown';
              const isRemoving = removing === p.userId || groupRemoving === p.userId;
              const isToggling = adminToggling === p.userId;
              return (
                <ParticipantChip key={p.userId} isMe={isMe}>
                  {pName}
                  {isMe && <ChipMeta>you</ChipMeta>}
                  {/* Admin badge — creator (accent) or co-admin (muted), group threads only */}
                  {isGroupThread && p.isCreator && <ChipAdminBadge>Admin</ChipAdminBadge>}
                  {isGroupThread && !p.isCreator && p.isCoAdmin && <ChipCoAdminBadge>Co-admin</ChipCoAdminBadge>}
                  {/* Make/Remove admin — creator or super admin only; never on the creator themself */}
                  {isGroupThread && canManageAdmins && !isGroupDisabled && !isMe && !p.isCreator && (
                    <ChipIconBtn
                      size="sm"
                      starred={p.isCoAdmin}
                      title={p.isCoAdmin ? `Remove ${pName} as group admin` : `Make ${pName} a group admin`}
                      onClick={() => handleToggleAdmin(p.userId, pName, !p.isCoAdmin)}
                      disabled={!!isToggling}
                    >
                      {isToggling
                        ? <Spinner style={{ width: 9, height: 9, borderWidth: 1.5 }}/>
                        : (p.isCoAdmin ? '★' : '☆')}
                    </ChipIconBtn>
                  )}
                  {/* Remove button — CC: sender only; group_thread: group admin only */}
                  {((isCcThread && isSender) || (isGroupThread && isGroupAdmin && !isGroupDisabled)) && !isMe && !(isGroupThread && p.isCreator) && (
                    <ChipIconBtn
                      danger
                      title={`Remove ${pName}`}
                      onClick={() => isGroupThread ? handleGroupRemoveMember(p.userId, pName) : handleRemoveParticipant(p.userId, pName)}
                      disabled={!!isRemoving}
                    >
                      {isRemoving
                        ? <Spinner style={{ width: 10, height: 10, borderWidth: 1.5 }}/>
                        : '×'}
                    </ChipIconBtn>
                  )}
                </ParticipantChip>
              );
            })}
          </ParticipantChipsWrap>
        </ParticipantsPanel>
      )}

      {/* ── Messages ── */}
      <ThreadScrollWrap>
        <GmailThreadView
          ref={containerRef}
          className="gmail-thread-view"
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
          {loading && <LoaderWrap><Spinner/></LoaderWrap>}
          {error && (() => {
            // "access denied" / "not a participant" errors come from assertConversationParticipant
            // in messageService.getThread — they mean the user is not (yet) a member of this
            // chat thread. Show a clear, non-alarming message instead of "Failed to load. Retry".
            const isAccessDenied =
              /access denied|not a participant|not an active participant/i.test(error);
            return (
              <NoAccessWrap>
                {isAccessDenied ? (
                  <>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                      stroke={theme.colors.ash} strokeWidth="1.6">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span style={{ fontSize: 13, color: theme.colors.ash, lineHeight: 1.5 }}>
                      You don't have access to this conversation.<br/>
                      <span style={{ fontSize: 12 }}>
                        Ask a Manager to add you to the activity.
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: theme.colors.danger }}>
                      Failed to load.
                    </span>
                    <RetryBtn onClick={refetch}>Retry</RetryBtn>
                  </>
                )}
              </NoAccessWrap>
            );
          })()}
          {!loading && messages.map(msg => (
            <div key={msg.messageId}>
              {msg.messageId === dividerId && (
                <UnreadDivider ref={dividerRef}><span>New messages</span></UnreadDivider>
              )}
              <MessageBubble
                message={msg}
                isMine={String(msg.senderId) === String(currentUserId)}
                isGroup={isGroup}
                currentUserId={currentUserId}
                isLastSentByMe={msg.messageId === lastSentByMeId}
                onReply={canReply ? handleReply : null}
                onJumpToParent={handleJumpToParent}
                isHighlighted={msg.messageId === highlightedId}
                registerRef={registerMessageRef}
                isEditing={editingMessageId === msg.messageId}
                editBody={editBody}
                onEditBodyChange={setEditBody}
                onEditStart={() => handleEditStart(msg)}
                onEditCancel={handleEditCancel}
                onEditSave={() => handleEditSave(msg.messageId)}
                editSaving={editSaving}
                editError={editingMessageId === msg.messageId ? editError : ''}
                editDeadlineMinutes={editDeadlineMinutes}
              />
            </div>
          ))}
          <div ref={bottomRef}/>
        </GmailThreadView>

        {showNewPill && (
          <NewMsgPill onClick={handleJumpToBottom}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
            </svg>
            {newPillCount > 1 ? `${newPillCount} new messages` : 'New message'}
          </NewMsgPill>
        )}
      </ThreadScrollWrap>

      {/* ── Composer (or read-only banner when the group has been disabled) ── */}
      {isGroupDisabled ? (
        <DisabledBanner>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          {isGroupThread
            ? 'This group has been disabled by its admin — you can still read past messages, but no one can send new ones.'
            : 'This thread has been disabled by an admin — you can still read past messages, but no one can send new ones.'}
        </DisabledBanner>
      ) : (
        <div ref={composerRef}>
          <Composer
            allowReply={canReply}
            isRemoved={isRemoved}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSend={handleSend}
            participants={mentionableParticipants}
          />
        </div>
      )}
    </>
  );
}
