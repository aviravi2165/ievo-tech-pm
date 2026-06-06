import { useState, useEffect, useCallback, useRef } from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from '../context/SocketContext';
import { useAuth }    from '../../auth/AuthContext';

export function useUnreadCount() {
  const { socket } = useSocket();
  const { user }   = useAuth();
  const [count, setCount] = useState(0);

  // Track which conv IDs are unread so we don't double-count
  const unreadConvIds = useRef(new Set());

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
      const isMine =
        payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);
      if (isMine) return;

      const convId = payload.conversationId;
      if (!unreadConvIds.current.has(convId)) {
        unreadConvIds.current.add(convId);
        setCount(prev => prev + 1);
      }
    };
    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId]);

  const decrement = useCallback((conversationId) => {
    if (unreadConvIds.current.has(conversationId)) {
      unreadConvIds.current.delete(conversationId);
      setCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  // Called by useInbox on load to prime the set
  const syncUnreadConvIds = useCallback((convIds) => {
    unreadConvIds.current = new Set(convIds);
  }, []);

  return { count, decrement, refresh, syncUnreadConvIds };
}