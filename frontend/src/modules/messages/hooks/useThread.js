import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';

/**
 * Loads a conversation thread and subscribes to live updates for that room.
 * Emits join/leave room events so MARK_READ broadcasts reach co-viewers.
 */
export function useThread(conversationId) {
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchThread = useCallback(async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      const data = await messageApi.getThread(conversationId);
      setMessages(data.messages || []);
      setConversation(data.conversation || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Fetch on open + join socket room
  useEffect(() => {
    if (!conversationId) return;
    fetchThread();

    if (socket) {
      socket.emit('join_conversation', { conversationId });
    }
    return () => {
      if (socket) {
        socket.emit('leave_conversation', { conversationId });
      }
    };
  }, [conversationId, socket, fetchThread]);

  // Live: append incoming message to thread (after REST fetch by caller if needed)
  useEffect(() => {
    if (!socket || !conversationId) return;

    const onNew = (payload) => {
      if (payload.conversationId !== conversationId) return;
      // Fetch the actual content via REST (socket only carries signal)
      fetchThread();
    };

    const onRead = ({ messageId, userId, readAt }) => {
      setMessages(prev =>
        prev.map(m =>
          m.messageId === messageId
            ? { ...m, readReceipts: [...(m.readReceipts || []), { userId, readAt }] }
            : m
        )
      );
    };

    socket.on('NEW_MESSAGE', onNew);
    socket.on('MARK_READ', onRead);
    return () => {
      socket.off('NEW_MESSAGE', onNew);
      socket.off('MARK_READ', onRead);
    };
  }, [socket, conversationId, fetchThread]);

  // Mark messages as read silently
  const markRead = useCallback(async (messageId) => {
    try {
      await messageApi.markRead(messageId);
      if (socket) {
        socket.emit('MARK_READ', { messageId, conversationId });
      }
    } catch (_) { /* silent */ }
  }, [socket, conversationId]);

  const sendReply = useCallback(async (payload) => {
    const result = await messageApi.reply(conversationId, payload);
    await fetchThread();
    return result;
  }, [conversationId, fetchThread]);

  return { messages, conversation, loading, error, markRead, sendReply, refetch: fetchThread };
}