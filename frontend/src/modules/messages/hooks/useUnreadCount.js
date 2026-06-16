import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';
import { useAuth }    from '../../auth/AuthContext';

/**
 * useUnreadCount — tracks unread CONVERSATION count (not message count).
 *
 * FIXES applied:
 *  1. refresh() now uses the dedicated /api/messages/unread-conversation-ids
 *     endpoint instead of fetching the full inbox. This is a single lightweight
 *     query and correctly rebuilds the ref + count atomically.
 *
 *  2. The old code used Promise.all([getUnreadCount(), getInbox()]) and then
 *     tried to derive unread conv IDs from the inbox response. The inbox paging
 *     and response shape made this fragile — if the inbox returned 0 items on
 *     first render (race condition), the ref was empty and subsequent socket
 *     events double-counted. Now the ref is always sourced from the dedicated
 *     endpoint which returns exactly the unread conv IDs and nothing else.
 *
 *  3. decrement() is called by MessagingPage when a conversation is opened.
 *     It now also fires a silent refresh after 800ms to keep the count
 *     accurate when the user has marked messages read via the thread
 *     (where multiple messages may be read at once).
 */
export function useUnreadCount() {
  const { socket } = useSocket();
  const { user }   = useAuth();
  const [count, setCount] = useState(0);

  // Source of truth — which conv IDs are currently unread for this session
  const unreadConvIds = useRef(new Set());

  /**
   * Rebuild unreadConvIds ref and count from the server.
   * Called on mount and after opening a conversation.
   */
  const refresh = useCallback(async () => {
    try {
      const ids = await messageApi.getUnreadConversationIds();
      const idSet = new Set(ids);
      unreadConvIds.current = idSet;
      setCount(idSet.size);
    } catch (_) {
      // On failure fall back to the count endpoint alone
      try {
        const n = await messageApi.getUnreadCount();
        setCount(n);
      } catch (_2) { /* silent */ }
    }
  }, []);

  // Load on mount
  useEffect(() => { refresh(); }, [refresh]);

  // Socket: new message from someone else
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      // Never increment for own messages
      const isMine =
        payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) return;

      const convId = payload.conversationId;

      // Only bump if this conv wasn't already in our unread set
      if (!unreadConvIds.current.has(convId)) {
        unreadConvIds.current.add(convId);
        setCount(prev => prev + 1);
      }
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId]);

  /**
   * Called by MessagingPage when a conversation is opened.
   * Immediately removes the conv from the unread set so the badge
   * drops right away, then re-syncs with the server shortly after
   * to catch any additional messages marked read inside the thread.
   */
const decrement = useCallback((conversationId) => {
  if (unreadConvIds.current.has(conversationId)) {
    unreadConvIds.current.delete(conversationId);
    setCount(prev => Math.max(0, prev - 1));
  }

  // Notify other hook instances immediately
  window.dispatchEvent(
    new CustomEvent('messages-unread-decrement', {
      detail: { conversationId }
    })
  );

  setTimeout(() => refresh(), 800);
}, [refresh]);
useEffect(() => {
  const handler = ({ detail }) => {
    const conversationId = detail?.conversationId;

    if (unreadConvIds.current.has(conversationId)) {
      unreadConvIds.current.delete(conversationId);
      setCount(prev => Math.max(0, prev - 1));
    }
  };

  window.addEventListener('messages-unread-decrement', handler);

  return () =>
    window.removeEventListener('messages-unread-decrement', handler);
}, []);

  return { count, decrement, refresh };
}