import { useState, useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { activityApi, taskApi } from '../api/projectApi';
import { useMessaging } from '../../messages/context/MessagingContext';
import { useSocket } from '../../messages/context/SocketContext';
import { useAuth } from '../../auth/AuthContext';
import { BtnGhost } from '../styles/shared.styles';

/**
 * ChatButton
 * compact — icon only, no label (used in space-constrained activity header row)
 * When the backend returns 403 (not a member), shows a friendly tooltip instead
 * of the alarming red "!" badge.
 *
 * hasUnread / conversationId — the row's own unread signal (see
 * activityService.getActivitiesForPhase / taskService.getTasksForActivity's
 * hasUnreadChat), deliberately separate from the global Inbox/Groups badge:
 * scoped to just this one Activity/Task chat, and counts system messages
 * (e.g. the Activity Insights cron post) too, which the global badge
 * excludes. Shown as a plain dot (no count — the ask was "is there
 * something new," not "how many"). Kept live without a page/list refetch
 * two ways: a NEW_MESSAGE socket event for this exact conversation flips it
 * on immediately, and opening the chat (this button's own click) clears it
 * optimistically rather than waiting for the next list refetch to catch up.
 */
export default function ChatButton({ kind, id, label, compact = false, hasUnread = false, conversationId = null }) {
  const { requestOpenConversation, requestOpenGroup, requestManageGroup, requestManageThread, isSuperAdmin } = useMessaging();
  const { socket } = useSocket();
  const { user } = useAuth();
  const currentUserId = user?.userId;
  const [loading, setLoading] = useState(false);
  const [errMsg,  setErrMsg]  = useState('');
  const [unread,  setUnread]  = useState(hasUnread);
  const convIdRef = useRef(conversationId);
  convIdRef.current = conversationId;

  // Server truth (from the row's own list fetch) wins whenever it changes —
  // a poll/refetch elsewhere in the app is still the source of truth; the
  // socket listener below only covers the gap between refetches.
  useEffect(() => { setUnread(hasUnread); }, [hasUnread]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (payload) => {
      if (!convIdRef.current) return;
      if (String(payload.conversationId) !== String(convIdRef.current)) return;
      // A message this same user just sent elsewhere (e.g. the chat panel
      // already open) shouldn't light up its own button.
      if (payload.senderUserId && currentUserId && String(payload.senderUserId) === String(currentUserId)) return;
      setUnread(true);
    };
    socket.on('NEW_MESSAGE', onNewMessage);
    return () => socket.off('NEW_MESSAGE', onNewMessage);
  }, [socket, currentUserId]);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!id) return;
    setLoading(true); setErrMsg('');
    try {
      const data = kind === 'activity'
        ? await activityApi.getChat(id)
        : await taskApi.getChat(id);

      // Admins have no message-CONTENT access anywhere in Messaging (see
      // MessagingPage's showThread, unconditionally false for isSuperAdmin)
      // — routing them through the normal open-conversation/open-group path
      // here left the panel rendering completely blank. Send them straight
      // into the moderation view for this specific group/thread instead —
      // same view they'd land on clicking it from their own group/thread list.
      if (isSuperAdmin) {
        if (kind === 'activity') {
          requestManageGroup({ conversationId: data.conversationId, groupId: data.groupId || null });
        } else {
          requestManageThread({ conversationId: data.conversationId });
        }
      } else if (kind === 'activity') {
        requestOpenGroup({
          conversationId: data.conversationId,
          groupId:        data.groupId  || null,
          subject:        data.subject  || '',
        });
      } else {
        requestOpenConversation({
          conversationId: data.conversationId,
          subject:        data.subject  || '',
          convType:       data.convType || 'cc',
        });
      }
      window.dispatchEvent(new CustomEvent('open-messages-panel'));
      // Clear optimistically on successful open — ChatWindow's own
      // mark-as-read flow handles the real comm_read_receipts rows; this
      // just keeps the dot in sync with that without waiting for this
      // row's list to refetch.
      setUnread(false);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) {
        setErrMsg('You are not a member of this activity\'s chat');
      } else {
        setErrMsg(err?.response?.data?.error || 'Chat not available yet');
      }
    } finally { setLoading(false); }
  };

  // Determine what to show in the button
  const defaultLabel = kind === 'activity' ? 'Group Chat' : 'Chat';
  const displayLabel = compact ? null : (label || defaultLabel);
  // Admins have no real read/unread state here (they're never an actual
  // comm_participants row on these threads — same reasoning the global
  // unread badge already applies elsewhere), so the dot would just read
  // permanently "unread" for them. Shown only for real participants.
  const showUnreadDot = unread && !isSuperAdmin && !errMsg;

  const title = errMsg
    || (loading ? 'Opening…' : isSuperAdmin
      ? (kind === 'activity' ? 'Manage activity group chat' : 'Manage task chat')
      : `${kind === 'activity' ? 'Open activity group chat' : 'Open task chat'}${showUnreadDot ? ' — new messages' : ''}`);

  return (
    <BtnGhost
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={title}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: compact ? 0 : 5,
        fontSize: 11,
        // When there's a no-access error, mute the button instead of alarming red
        opacity: errMsg ? 0.45 : 1,
        cursor: errMsg ? 'not-allowed' : 'pointer',
        padding: compact ? '4px 6px' : undefined,
      }}
    >
      <MessageSquare size={13} strokeWidth={2.2} />
      {displayLabel && (loading ? '…' : displayLabel)}
      {showUnreadDot && (
        <span style={{
          position: 'absolute', top: compact ? 2 : 0, right: compact ? 2 : -2,
          width: 7, height: 7, borderRadius: '50%',
          background: '#c12d16', border: '1.5px solid #fff',
        }} />
      )}
    </BtnGhost>
  );
}