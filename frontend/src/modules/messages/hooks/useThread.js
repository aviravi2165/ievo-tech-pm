import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';

export function useThread(conversationId) {
  const { socket }  = useSocket();
  const [messages,     setMessages]     = useState([]);
  const [conversation, setConversation] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  // Ref to track which messages have already been marked read this session
  // so we don't fire duplicate PATCH calls when messages state updates
  const markedReadRef = useRef(new Set());

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
    // Reset the marked-read ref when switching conversations
    markedReadRef.current = new Set();
    fetchThread();
    if (socket) socket.emit('join_conversation', { conversationId });
    return () => {
      if (socket) socket.emit('leave_conversation', { conversationId });
    };
  }, [conversationId, socket, fetchThread]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !conversationId) return;

    const onNew = (payload) => {
      if (payload.conversationId !== conversationId) return;
      fetchThread();
    };

    // Live read receipt — update the specific message in place
    // userName is included from the socket event (set by sender's REST response)
    const onRead = ({ messageId, userId, readAt, userName }) => {
      setMessages(prev =>
        prev.map(m => {
          if (m.messageId !== messageId) return m;
          const already = m.readReceipts?.some(r => String(r.userId) === String(userId));
          if (already) return m;
          return {
            ...m,
            readReceipts: [
              ...(m.readReceipts || []),
              { userId, readAt, userName: userName || 'Someone' },
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
   * Mark a single message read.
   * - Writes to DB via REST
   * - REST response includes userName (from messageService.markMessageRead)
   * - Emits MARK_READ socket event with userName so co-viewers update live
   * - Deduped via markedReadRef so repeated calls are no-ops
   */
  const markRead = useCallback(async (messageId) => {
    if (markedReadRef.current.has(messageId)) return;
    markedReadRef.current.add(messageId);
    try {
      const result = await messageApi.markRead(messageId);
      if (socket) {
        socket.emit('MARK_READ', {
          messageId,
          conversationId,
          userName: result.userName,
          readAt:   result.readAt,
        });
      }
    } catch (_) {
      // Remove from ref on failure so it can be retried
      markedReadRef.current.delete(messageId);
    }
  }, [socket, conversationId]);

  /**
   * Mark ALL unread messages in this thread read.
   * Called once by ChatWindow when the conversation opens.
   * Uses markedReadRef to ensure no message is marked twice even if
   * this function is called multiple times (e.g. on message list refresh).
   */
  const markAllRead = useCallback((currentUserId) => {
    // Read messages snapshot at call time — don't put messages in dep array
    setMessages(currentMessages => {
      const unread = currentMessages.filter(
        m => String(m.senderId) !== String(currentUserId) &&
          !m.readReceipts?.find(r => String(r.userId) === String(currentUserId))
      );
      unread.forEach(m => markRead(m.messageId));
      return currentMessages; // no state change, just side effects
    });
  }, [markRead]);

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