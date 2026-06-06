import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../../auth/AuthContext';

/**
 * Returns the total unread message count.
 *
 * BUG FIX: Was incrementing badge even when the current user sent the message.
 * Now checks payload.senderUserId against the logged-in user and skips
 * incrementing when it's your own message.
 */
export function useUnreadCount() {
  const { socket } = useSocket();
  const { user }   = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const c = await messageApi.getUnreadCount();
      setCount(c);
    } catch (_) {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      // BUG FIX: Don't increment badge for messages you sent yourself
      const isMine = payload.senderUserId && user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) return;

      setCount(prev => prev + 1);
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId]);

  const decrement = useCallback((by = 1) => {
    setCount(prev => Math.max(0, prev - by));
  }, []);

  return { count, decrement, refresh };
}