import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket } from '../context/SocketContext';

/**
 * Returns the total unread message count.
 * Increments live via NEW_MESSAGE; resets when a thread is opened (caller resets).
 */
export function useUnreadCount() {
  const { socket } = useSocket();
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
    const handler = () => setCount(prev => prev + 1);
    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket]);

  const decrement = useCallback((by = 1) => {
    setCount(prev => Math.max(0, prev - by));
  }, []);

  return { count, decrement, refresh };
}