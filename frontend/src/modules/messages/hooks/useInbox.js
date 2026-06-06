import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../../auth/AuthContext';
import { useUnreadCount } from './useUnreadCount';

/**
 * useInbox
 *
 * FIX: After loading conversations, calls syncUnreadConvIds() so useUnreadCount
 * knows which conversation IDs are already contributing to the badge.
 * This prevents the socket handler in useUnreadCount from double-counting
 * conversations that are already marked unread in the list.
 */
export function useInbox() {
  const { socket } = useSocket();
  const { user }   = useAuth();
  const { syncUnreadConvIds } = useUnreadCount();

  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      const data = await messageApi.getInbox();
      const convs = data.conversations || data || [];
      setConversations(convs);
      setError(null);

      // FIX: Tell useUnreadCount which conv IDs are already unread so socket
      // events for those convos don't bump the badge a second time.
      const unreadIds = convs
        .filter((c) => (c.unreadCount || 0) > 0)
        .map((c) => c.conversationId);
      syncUnreadConvIds(unreadIds);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [syncUnreadConvIds]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      const isMine =
        payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);

      setConversations((prev) => {
        const exists = prev.find(
          (c) => c.conversationId === payload.conversationId
        );

        if (exists) {
          return [
            {
              ...exists,
              latestSender: payload.senderName,
              latestAt: new Date().toISOString(),
              // Only bump per-conversation unread counter for others' messages
              unreadCount: isMine
                ? (exists.unreadCount || 0)
                : (exists.unreadCount || 0) + 1,
            },
            ...prev.filter(
              (c) => c.conversationId !== payload.conversationId
            ),
          ];
        }

        // New conversation not yet in list — fetch fresh
        fetchInbox();
        return prev;
      });
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, fetchInbox, user?.userId]);

  const archiveConversation = useCallback(async (conversationId) => {
    await messageApi.archive(conversationId);
    setConversations((prev) =>
      prev.filter((c) => c.conversationId !== conversationId)
    );
  }, []);

  return {
    conversations,
    loading,
    error,
    refetch: fetchInbox,
    archiveConversation,
  };
}