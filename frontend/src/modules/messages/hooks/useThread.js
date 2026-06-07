import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';

export function useThread(conversationId) {
  const { socket } = useSocket();
  const [messages,     setMessages]     = useState([]);
  const [conversation, setConversation] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

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

  useEffect(() => {
    if (!conversationId) return;
    fetchThread();
    if (socket) socket.emit('join_conversation', { conversationId });
    return () => {
      if (socket) socket.emit('leave_conversation', { conversationId });
    };
  }, [conversationId, socket, fetchThread]);

  // Live: new message or read receipt
  useEffect(() => {
    if (!socket || !conversationId) return;

    const onNew = (payload) => {
      if (payload.conversationId !== conversationId) return;
      fetchThread();
    };

    // Live read receipt — update the specific message's receipts in place
    const onRead = ({ messageId, userId, readAt, userName }) => {
      setMessages(prev =>
        prev.map(m => {
          if (m.messageId !== messageId) return m;
          // Avoid duplicate receipts
          const already = m.readReceipts?.some(r => r.userId === userId);
          if (already) return m;
          return {
            ...m,
            readReceipts: [
              ...(m.readReceipts || []),
              { userId, readAt, userName },
            ],
          };
        })
      );
    };

    socket.on('NEW_MESSAGE', onNew);
    socket.on('MARK_READ',   onRead);
    return () => {
      socket.off('NEW_MESSAGE', onNew);
      socket.off('MARK_READ',   onRead);
    };
  }, [socket, conversationId, fetchThread]);

  /**
   * Mark a single message read — writes to DB and emits MARK_READ to conv room
   * so other viewers see the tick update live.
   */
  const markRead = useCallback(async (messageId) => {
    try {
      await messageApi.markRead(messageId);
      if (socket) {
        socket.emit('MARK_READ', { messageId, conversationId });
      }
    } catch (_) { /* silent */ }
  }, [socket, conversationId]);

  /**
   * Mark ALL unread messages in this conversation read in one go.
   * Called by ChatWindow on open.
   */
  const markAllRead = useCallback(async (currentUserId) => {
    const unread = (messages).filter(
      m => m.senderId !== currentUserId &&
        !m.readReceipts?.find(r => r.userId === currentUserId)
    );
    await Promise.all(unread.map(m => markRead(m.messageId)));
  }, [messages, markRead]);

  const sendReply = useCallback(async (payload) => {
    const result = await messageApi.reply(conversationId, payload);
    await fetchThread();
    return result;
  }, [conversationId, fetchThread]);

  return {
    messages, conversation, loading, error,
    markRead, markAllRead, sendReply,
    refetch: fetchThread,
  };
}