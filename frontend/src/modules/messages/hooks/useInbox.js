import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';
import { useAuth }    from '../../auth/AuthContext';

export function useInbox() {
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      const data = await messageApi.getInbox();
      setConversations(data.conversations || data || []);
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

      setConversations((prev) => {
        const exists = prev.find(c => c.conversationId === payload.conversationId);

        if (exists) {
          return [
            {
              ...exists,
              latestSender: payload.senderName,
              latestAt:     new Date().toISOString(),
              // Only bump unread dot for others' messages
              unreadCount: isMine
                ? (exists.unreadCount || 0)
                : (exists.unreadCount || 0) + 1,
            },
            ...prev.filter(c => c.conversationId !== payload.conversationId),
          ];
        }

        // Conversation not in list (new or was archived) — fetch fresh
        fetchInbox();
        return prev;
      });
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, fetchInbox, user?.userId]);

  const archiveConversation = useCallback(async (conversationId) => {
    await messageApi.archive(conversationId);
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
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