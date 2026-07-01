import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';
import { useAuth }    from '../../auth/AuthContext';

/**
 * useInbox
 *
 * Accepts `activeConversationId` (the conversation currently open in
 * ChatWindow) so the NEW_MESSAGE socket handler can skip incrementing
 * `unreadCount` for that conversation — the user is already reading it
 * and markAllRead will fire immediately, so incrementing then immediately
 * clearing causes a brief dot-flash that is confusing.
 *
 * Bug fixes applied here:
 *
 * FIX Bug 3 (new-message-needs-refresh): fetchInbox() is called as a
 * plain side effect for brand-new conversations, not nested inside a
 * setState updater.
 *
 * FIX Bug 8 (dot-flash for open conversation): NEW_MESSAGE handler
 * checks activeConvIdRef before incrementing unreadCount so the currently
 * open thread's sidebar row stays at zero while the user is reading.
 */
export function useInbox(activeConversationId = null) {
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const knownIdsRef     = useRef(new Set());
  // FIX Bug 8: keep a ref so the socket handler (which closes over a
  // stable function reference) always reads the *current* active id.
  const activeConvIdRef = useRef(activeConversationId);
  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      const data = await messageApi.getInbox();
      const list = data.conversations || data || [];
      // Don't re-show unread dot for the currently open conversation —
      // mark-read REST calls may still be in flight when this fetch lands
      const activeId = activeConvIdRef.current;
      const adjusted = list.map(c =>
        activeId && String(c.conversationId) === String(activeId)
          ? { ...c, unreadCount: 0 }
          : c
      );
      setConversations(adjusted);
      knownIdsRef.current = new Set(list.map(c => c.conversationId));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // Socket: real-time inbox updates
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      const isMine = payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);

      // FIX Bug 8: don't increment unread for the conversation currently
      // open — the user is already reading it, markAllRead will fire on
      // the next render, and incrementing here would cause a brief
      // unread-dot flash that then immediately disappears.
      const isCurrentlyOpen =
        activeConvIdRef.current != null &&
        String(activeConvIdRef.current) === String(payload.conversationId);

      const alreadyKnown = knownIdsRef.current.has(payload.conversationId);

      if (!alreadyKnown) {
        fetchInbox();
        return;
      }

      setConversations((prev) => {
        const exists = prev.find(c => c.conversationId === payload.conversationId);
        if (!exists) return prev;

        return [
          {
            ...exists,
            latestSender: payload.senderName,
            latestAt:     new Date().toISOString(),
            unreadCount:
              isMine || isCurrentlyOpen
                ? (exists.unreadCount || 0)          // already reading or own message — no dot
                : (exists.unreadCount || 0) + 1,     // genuinely new unread
            // Brief pulse highlight on the row — a quiet visual cue for a
            // message landing in a conversation other than the one you're
            // currently reading. Cleared below after ~1.6s.
            _flash: !isMine && !isCurrentlyOpen,
          },
          ...prev.filter(c => c.conversationId !== payload.conversationId),
        ];
      });

      if (!isMine && !isCurrentlyOpen) {
        setTimeout(() => {
          setConversations(prev => prev.map(c =>
            c.conversationId === payload.conversationId ? { ...c, _flash: false } : c
          ));
        }, 1600);
      }
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, fetchInbox, user?.userId]);

  /**
   * Called when user opens a conversation — clears the unread dot
   * immediately without waiting for a server round-trip.
   */
  const clearUnreadDot = useCallback((conversationId) => {
    setConversations(prev =>
      prev.map(c => c.conversationId === conversationId
        ? { ...c, unreadCount: 0 }
        : c
      )
    );
  }, []);

  return {
    conversations, loading, error,
    refetch: fetchInbox,
    clearUnreadDot,
  };
}