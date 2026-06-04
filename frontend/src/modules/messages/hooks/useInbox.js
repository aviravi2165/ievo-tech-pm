import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../../auth/AuthContext';

/**
 * Manages the inbox conversation list.
 *
 * Fixes:
 * 1. Archived conversations reappear when a new reply arrives on them.
 * 2. Sender's own messages don't bump unread count in their inbox.
 * 3. Socket handler always calls fetchInbox for unknown/archived convs
 *    so they surface back at the top.
 */
export function useInbox() {
  const { socket }  = useSocket();
  const { user }    = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

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

  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      // payload: { conversationId, messageId, senderName, senderUserId, subject }
      const isMine = payload.senderUserId && user?.userId
        && payload.senderUserId === user.userId;

      setConversations((prev) => {
        const exists = prev.find(c => c.conversationId === payload.conversationId);

        if (exists) {
          // Move to top; only bump unread if someone else sent it
          return [
            {
              ...exists,
              latestSender: payload.senderName,
              latestAt:     new Date().toISOString(),
              unreadCount:  isMine ? (exists.unreadCount || 0) : (exists.unreadCount || 0) + 1,
            },
            ...prev.filter(c => c.conversationId !== payload.conversationId),
          ];
        }

        // Conversation not in list — could be new OR was archived.
        // Either way fetch fresh so it reappears at top.
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

  return { conversations, loading, error, refetch: fetchInbox, archiveConversation };
}