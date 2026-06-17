import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';
import { useAuth }    from '../../auth/AuthContext';

/**
 * FIX (new-message-needs-refresh bug):
 * Previously the NEW_MESSAGE handler called fetchInbox() *inside* the
 * setConversations updater function when the conversation wasn't already
 * in the list (i.e. it's a brand new conversation). Calling an async
 * function with its own setState from inside another setState's updater
 * is unreliable — the updater must return a value synchronously, and the
 * side-effect (fetchInbox) resolves later, frequently after React has
 * already moved on, so the new conversation never visibly appears until
 * a manual refresh.
 *
 * Fix: keep the updater pure (only handles the "conversation already
 * exists" case) and run fetchInbox() as a plain side effect on the
 * "doesn't exist yet" branch, outside of any setState callback.
 */
export function useInbox() {
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  // Track conversation ids we already know about, for the socket handler
  const knownIdsRef = useRef(new Set());

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      const data = await messageApi.getInbox();
      const list = data.conversations || data || [];
      setConversations(list);
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

      const alreadyKnown = knownIdsRef.current.has(payload.conversationId);

      if (!alreadyKnown) {
        // FIX: brand new conversation — fetch fresh list as a plain side
        // effect (not nested inside a setState updater). fetchInbox()
        // itself updates knownIdsRef once the new data lands.
        fetchInbox();
        return;
      }

      setConversations((prev) => {
        const exists = prev.find(c => c.conversationId === payload.conversationId);
        if (!exists) return prev; // safety: race with fetchInbox already in flight

        return [
          {
            ...exists,
            latestSender: payload.senderName,
            latestAt:     new Date().toISOString(),
            unreadCount: isMine
              ? (exists.unreadCount || 0)
              : (exists.unreadCount || 0) + 1,
          },
          ...prev.filter(c => c.conversationId !== payload.conversationId),
        ];
      });
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, fetchInbox, user?.userId]);

  const archiveConversation = useCallback(async (conversationId) => {
    await messageApi.archive(conversationId);
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
    knownIdsRef.current.delete(conversationId);
  }, []);

  /**
   * Called when user opens a conversation — clears the unread dot immediately
   * without waiting for a server round-trip.
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
    archiveConversation,
    clearUnreadDot,
  };
}
