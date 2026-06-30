import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';

export function useThread(conversationId) {
  const { socket }  = useSocket();
  const [messages,     setMessages]     = useState([]);
  const [conversation, setConversation] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const markedReadRef   = useRef(new Set());
  // Callback ref so ChatWindow can react to incoming messages (scroll, mark-read pill)
  const onNewMessageRef = useRef(null);

  const fetchThread = useCallback(async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      const data = await messageApi.getThread(conversationId);
      setMessages(data.messages || []);
      setConversation(data.conversation || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load conversation.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Fetch on open + join socket room
  useEffect(() => {
    if (!conversationId) return;
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

      // Capture scroll distance BEFORE the state update triggers a re-render —
      // this must happen synchronously so the "scrolled away" snapshot is
      // accurate (after render, auto-scroll effects may have already moved
      // the container, making it look like the user was at the bottom).
      const threadEl = document.querySelector('.gmail-thread-view');
      const distBefore = threadEl
        ? threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight
        : 0;

      if (payload.bodyHtml != null) {
        // ── Fast path: append directly, no HTTP round-trip ────────────────
        const newMsg = {
          messageId:      payload.messageId,
          conversationId: payload.conversationId,
          senderId:       payload.senderUserId,
          senderName:     payload.senderName,
          bodyHtml:       payload.bodyHtml,
          sentAt:         payload.createdAt || new Date().toISOString(),
          attachments:    payload.attachments   || [],
          parentMessage:  payload.parentMessage || null,
          readReceipts:   payload.readReceipts  || [],
          isEdited:       false,
          isSystem:       Boolean(payload.isSystem),
        };
        setMessages(prev => {
          if (prev.find(m => m.messageId === newMsg.messageId)) return prev;
          return [...prev, newMsg];
        });
        if (onNewMessageRef.current) {
          onNewMessageRef.current({ ...payload, _distanceFromBottom: distBefore });
        }
      } else {
        // Fallback for older server without enriched payload
        Promise.resolve(fetchThread()).then(() => {
          if (onNewMessageRef.current) {
            onNewMessageRef.current({ ...payload, _distanceFromBottom: distBefore });
          }
        });
      }
    };

    // Live read receipt — update the specific message in place
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

    // Message edited — update body in place
    const onEdited = ({ messageId, bodyHtml, isEdited, editedAt }) => {
      setMessages(prev =>
        prev.map(m =>
          m.messageId === messageId
            ? { ...m, bodyHtml, isEdited: Boolean(isEdited), editedAt }
            : m
        )
      );
    };

    socket.on('NEW_MESSAGE',     onNew);
    socket.on('MARK_READ',       onRead);
    socket.on('MESSAGE_EDITED',  onEdited);
    return () => {
      socket.off('NEW_MESSAGE',    onNew);
      socket.off('MARK_READ',      onRead);
      socket.off('MESSAGE_EDITED', onEdited);
    };
  }, [socket, conversationId, fetchThread]);

  const markRead = useCallback(async (messageId) => {
    if (markedReadRef.current.has(messageId)) return;
    markedReadRef.current.add(messageId);
    try {
      await messageApi.markRead(messageId);
    } catch (_) {
      markedReadRef.current.delete(messageId);
    }
  }, []);

  const messagesRef = useRef([]);
  messagesRef.current = messages;

  const markAllRead = useCallback((currentUserId) => {
    const unread = messagesRef.current.filter(
      m => String(m.senderId) !== String(currentUserId) &&
        !m.readReceipts?.find(r => String(r.userId) === String(currentUserId)) &&
        !markedReadRef.current.has(m.messageId)
    );
    unread.forEach(m => markRead(m.messageId));
  }, [markRead]);

  // Send reply — socket event handles appending; no refetch needed
  const sendReply = useCallback(async (payload) => {
    return messageApi.reply(conversationId, payload);
  }, [conversationId]);

  // Edit message — updates locally optimistically, server confirms via socket
  const editMessageLocal = useCallback(async (messageId, bodyHtml) => {
    const result = await messageApi.editMessage(messageId, bodyHtml);
    // Update locally immediately (socket will also fire MESSAGE_EDITED)
    setMessages(prev =>
      prev.map(m =>
        m.messageId === messageId
          ? { ...m, bodyHtml: result.bodyHtml, isEdited: true, editedAt: result.editedAt }
          : m
      )
    );
    return result;
  }, []);

  // Append a message directly from a REST response (e.g. the system message
  // returned by groupApi.update() right after a name/description change),
  // instead of waiting for the NEW_MESSAGE socket round-trip. Guards against
  // duplicates the same way the socket handler does, so when the real
  // NEW_MESSAGE event does arrive a moment later for the same messageId,
  // it's a silent no-op.
  const appendMessage = useCallback((messageData) => {
    if (!messageData?.messageId) return;
    setMessages(prev => {
      if (prev.find(m => m.messageId === messageData.messageId)) return prev;
      return [...prev, messageData];
    });
  }, []);

  return {
    messages, conversation, loading, error,
    markRead, markAllRead, sendReply, editMessage: editMessageLocal,
    appendMessage,
    refetch: fetchThread,
    onNewMessageRef,
  };
}