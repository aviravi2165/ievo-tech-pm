import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';
import { useAuth }   from '../../auth/AuthContext';

/**
 * useUnreadCount
 *
 * Tracks the number of CONVERSATIONS (not messages) that have at least one
 * unread message from another user.
 *
 * Root cause of the previous double-count / mismatch bug:
 *   - refresh() fetched the count from the DB but did NOT sync the
 *     unreadConvIds ref — so the ref and the displayed count diverged.
 *   - Subsequent NEW_MESSAGE events then added on top of a stale count.
 *
 * Fix:
 *   - refresh() now fetches the full list of unread conversation IDs from a
 *     new /api/messages/unread-conversations endpoint and rebuilds the ref
 *     atomically with the count, so they are always in sync.
 *   - decrement() removes from the ref so the next socket event can't
 *     double-count the same conversation.
 */
export function useUnreadCount() {
  const { socket } = useSocket();
  const { user }   = useAuth();
  const [count, setCount] = useState(0);

  // Source of truth for which convIds are currently unread
  const unreadConvIds = useRef(new Set());

  /**
   * Fetch unread conversation IDs from the backend and rebuild the ref + count.
   * Called on mount and after marking a conversation read.
   */
  const refresh = useCallback(async () => {
    try {
      // Re-use the existing endpoint — returns a number.
      // We also fetch the inbox to get the actual unread conv IDs.
      const [countVal, inboxData] = await Promise.all([
        messageApi.getUnreadCount(),
        messageApi.getInbox(),
      ]);

      const convs = inboxData?.conversations || inboxData || [];
      const unreadIds = new Set(
        convs.filter(c => (c.unreadCount || 0) > 0).map(c => c.conversationId)
      );

      unreadConvIds.current = unreadIds;
      // Use DB count as authoritative number (not derived from inbox page)
      setCount(countVal);
    } catch (_) {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Socket: incoming message from someone else
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      // Ignore own messages
      const isMine = payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) return;

      const convId = payload.conversationId;

      // Only increment if this conversation wasn't already counted as unread
      if (!unreadConvIds.current.has(convId)) {
        unreadConvIds.current.add(convId);
        setCount(prev => prev + 1);
      }
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId]);

  /**
   * Call when a conversation is opened / marked read.
   * Removes from the ref so future messages in this conv count correctly.
   */
  const decrement = useCallback((conversationId) => {
    if (unreadConvIds.current.has(conversationId)) {
      unreadConvIds.current.delete(conversationId);
      setCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  return { count, decrement, refresh };
}