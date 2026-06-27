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
  const markedReadRef   = useRef(new Set());
  // Callback ref so ChatWindow can react to new messages (highlight, mark-read)
  // Declared here (not below) so onNew socket handler can safely reference it
  const onNewMessageRef = useRef(null);

  const fetchThread = useCallback(async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      const data = await messageApi.getThread(conversationId);
      setMessages(data.messages || []);
      setConversation(data.conversation || null);
      setError(null); // clear any previous error on success
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Fetch on open + join socket room
  useEffect(() => {
    if (!conversationId) return;
    // Reset everything when switching conversations
    setError(null);
    setMessages([]);
    setConversation(null);
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
      if (String(payload.conversationId) !== String(conversationId)) return;

      // If the payload has the full message body, append directly — no HTTP round-trip
      if (payload.bodyHtml != null) {
        const newMsg = {
          messageId:     payload.messageId,
          conversationId: payload.conversationId,
          senderId:      payload.senderUserId,
          senderName:    payload.senderName,
          bodyHtml:      payload.bodyHtml,
          createdAt:     payload.createdAt || new Date().toISOString(),
          attachments:   payload.attachments || [],
          parentMessage: payload.parentMessage || null,
          readReceipts:  payload.readReceipts || [],
        };
        setMessages(prev => {
          // Deduplicate — socket may fire for own messages too
          if (prev.find(m => m.messageId === newMsg.messageId)) return prev;
          return [...prev, newMsg];
        });
        // Notify ChatWindow to scroll / mark read
        if (onNewMessageRef.current) onNewMessageRef.current(payload);
      } else {
        // Fallback: payload missing bodyHtml (e.g. older server) — refetch
        fetchThread().then(() => {
          if (onNewMessageRef.current) onNewMessageRef.current(payload);
        });
      }
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
   * - Writes to DB via REST (strict participant check — no super-admin bypass)
   * - Server now calls broadcastMarkRead() after DB write, so co-viewers
   *   receive live MARK_READ events via the server broadcast. The client
   *   no longer emits MARK_READ itself — doing so after the server already
   *   broadcast it would cause co-viewers to receive the event twice and
   *   briefly show duplicate tick animations.
   * - Deduped via markedReadRef so repeated calls are no-ops
   */
  const markRead = useCallback(async (messageId) => {
    if (markedReadRef.current.has(messageId)) return;
    markedReadRef.current.add(messageId);
    try {
      await messageApi.markRead(messageId);
      // No client-side socket.emit('MARK_READ') — server handles broadcast.
    } catch (_) {
      // Remove from ref on failure so it can be retried
      markedReadRef.current.delete(messageId);
    }
  }, []);

  /**
   * FIX Bug 3: markAllRead previously called setMessages() to access the
   * latest messages snapshot, then called markRead() as a side effect
   * inside the updater function. Side effects inside setState updaters are
   * unreliable (React may call them multiple times in concurrent/strict mode).
   * Fixed by reading the ref-attached snapshot directly.
   *
   * Also: ChatWindow was triggering this on `messages.length` change —
   * meaning every new incoming message caused a full re-scan of all messages.
   * The markedReadRef deduplication prevents double DB writes, but the
   * iteration still happened. This function now uses the messages ref so
   * ChatWindow can call it once on conversation open without depending on
   * messages in its effect dependency array.
   */
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  const markAllRead = useCallback((currentUserId) => {
    const currentMessages = messagesRef.current;
    const unread = currentMessages.filter(
      m => String(m.senderId) !== String(currentUserId) &&
        !m.readReceipts?.find(r => String(r.userId) === String(currentUserId)) &&
        !markedReadRef.current.has(m.messageId)
    );
    unread.forEach(m => markRead(m.messageId));
  }, [markRead]);

  const sendReply = useCallback(async (payload) => {
    const result = await messageApi.reply(conversationId, payload);
    // The server broadcasts NEW_MESSAGE back to the sender's conv: room,
    // which our onNew handler will catch and append — no manual refetch needed.
    // We still return the result in case the caller needs it.
    return result;
  }, [conversationId]);

  return {
    messages, conversation, loading, error,
    markRead, markAllRead, sendReply,
    refetch: fetchThread,
    onNewMessageRef,
  };
}