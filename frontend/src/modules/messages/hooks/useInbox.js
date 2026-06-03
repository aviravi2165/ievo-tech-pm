import { useState, useEffect, useCallback, useContext } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';

/**
 * Manages the inbox conversation list.
 * Keeps itself fresh via Socket.io NEW_MESSAGE events.
 */
export function useInbox() {
  const { socket } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      const data = await messageApi.getInbox();
      setConversations(data.conversations || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // Real-time: prepend new conversation or update existing
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      // { conversationId, messageId, senderName, subject }
      setConversations((prev) => {
        const exists = prev.find(c => c.conversationId === payload.conversationId);
        if (exists) {
          // Move to top, mark unread
          return [
            { ...exists, latestSender: payload.senderName, unreadCount: (exists.unreadCount || 0) + 1 },
            ...prev.filter(c => c.conversationId !== payload.conversationId),
          ];
        }
        // New conversation: fetch fresh list (lightweight)
        fetchInbox();
        return prev;
      });
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, fetchInbox]);

  const archiveConversation = useCallback(async (conversationId) => {
    await messageApi.archive(conversationId);
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
  }, []);

  return { conversations, loading, error, refetch: fetchInbox, archiveConversation };
}