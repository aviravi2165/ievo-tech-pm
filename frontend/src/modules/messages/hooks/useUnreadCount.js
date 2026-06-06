import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../../auth/AuthContext';

/**
 * useUnreadCount
 *
 * Returns the number of CONVERSATIONS (not individual messages) that have at
 * least one unread message.  This keeps the message icon badge and the inbox
 * tab badge in sync — both show the same number.
 *
 * FIX: The old socket handler incremented count by 1 for every NEW_MESSAGE
 * event, meaning 2 messages in the same unread conversation counted as 2.
 * The backend now returns conversation-level counts, and the socket handler
 * only increments when the incoming message is from a conversation that was
 * previously read (i.e. not already contributing to the badge).
 *
 * To do this cleanly we track the set of currently-unread conversation IDs
 * in a ref so we can check membership without stale closure issues.
 */

import { useRef } from 'react';

export function useUnreadCount() {
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [count, setCount] = useState(0);

  // Track which conversation IDs are currently unread so the socket handler
  // knows whether to bump the badge or not.
  const unreadConvIds = useRef(new Set());

  const refresh = useCallback(async () => {
    try {
      const c = await messageApi.getUnreadCount();
      setCount(c);
      // Re-sync the set from the inbox list so socket increments stay accurate.
      // We re-fetch a lightweight unread-convos list from the same endpoint —
      // the backend now returns the conversation count, so we also need the IDs.
      // We get these from the inbox conversations that have unreadCount > 0.
      // The cleanest way without a new endpoint: refresh from inbox state is
      // handled by useInbox; here we just trust the numeric count from the API
      // and let addUnreadConvId / removeUnreadConvId keep the set current.
    } catch (_) {}
  }, []);

  // Called by useInbox when it loads conversations, so this hook knows which
  // conv IDs are already unread (prevents double-counting on socket events).
  const syncUnreadConvIds = useCallback((convIds) => {
    unreadConvIds.current = new Set(convIds);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      // Never count own messages
      const isMine =
        payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) return;

      const convId = payload.conversationId;

      // FIX: Only increment badge when this conversation wasn't already unread.
      // If it was already in the unread set, the badge is already counting it —
      // adding another message to the same thread doesn't change the conv count.
      if (!unreadConvIds.current.has(convId)) {
        unreadConvIds.current.add(convId);
        setCount((prev) => prev + 1);
      }
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId]);

  const decrement = useCallback((conversationId) => {
    // Accept either a conversationId (preferred) or a numeric count for
    // backwards-compat with callers that pass conv.unreadCount.
    if (typeof conversationId === 'string' || (typeof conversationId === 'number' && conversationId > 1000)) {
      // Looks like a real ID — remove it from the set
      const wasUnread = unreadConvIds.current.has(conversationId);
      unreadConvIds.current.delete(conversationId);
      if (wasUnread) {
        setCount((prev) => Math.max(0, prev - 1));
      }
    } else {
      // Legacy numeric decrement (e.g. decrement(conv.unreadCount))
      // Just subtract 1 from the badge since we can't know the conv ID
      setCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  return { count, decrement, refresh, syncUnreadConvIds };
}