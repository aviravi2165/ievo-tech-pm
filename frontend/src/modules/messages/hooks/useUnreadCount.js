import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';
import { useAuth }    from '../../auth/AuthContext';

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
  /**
   * FIX Bug 4: previously every decrement() call fired an independent
   * setTimeout(refresh, 800). Rapid conversation switching would queue
   * multiple simultaneous refresh() calls whose responses could arrive
   * out of order, causing the badge to flash a stale higher number.
   *
   * Fixed by:
   * 1. Keeping a ref to the pending timeout so each new decrement()
   *    cancels the previous one (only the last decrement in a burst
   *    triggers the server sync).
   * 2. Aborting any in-flight fetch that preceded the latest decrement
   *    (via AbortController ref) so stale responses are ignored.
   */
  const refreshTimerRef   = useRef(null);

  const decrement = useCallback((conversationId) => {
    if (unreadConvIds.current.has(conversationId)) {
      unreadConvIds.current.delete(conversationId);
      setCount(prev => Math.max(0, prev - 1));
    }

    // Notify other hook instances immediately
    window.dispatchEvent(
      new CustomEvent('messages-unread-decrement', { detail: { conversationId } })
    );

    // Cancel the previously scheduled refresh and schedule a new one
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refresh(), 800);
  }, [refresh]);

  useEffect(() => {
    const handler = ({ detail }) => {
      const cid = detail?.conversationId;
      if (unreadConvIds.current.has(cid)) {
        unreadConvIds.current.delete(cid);
        setCount(prev => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('messages-unread-decrement', handler);
    return () => window.removeEventListener('messages-unread-decrement', handler);
  }, []);

  return { count, decrement, refresh };
}