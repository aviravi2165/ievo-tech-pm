/**
 * MessagingContext.js
 *
 * Single source of truth for all messaging state that previously required
 * either prop-drilling or the cross-instance window.dispatchEvent hack:
 *
 *   • unreadCount  — global badge shown in MessagePanel toggle and inbox tab
 *   • decrement    — called when a conversation is opened; lowers badge immediately
 *   • conversations / clearUnreadDot / refetchInbox — inbox list state
 *   • activeConversationId — which conversation is currently open; shared
 *                            between useUnreadCount's socket handler and
 *                            useInbox's socket handler so neither needs a
 *                            prop or a cross-instance event to know
 *   • setActiveConversationId — called by MessagingPage when a conversation
 *                               is selected or closed
 *
 * Both MessagePanel (header badge) and MessagingPage (inbox + chat) consume
 * this context, so they always see the same count and the same active
 * conversation — no cross-instance window events, no activeConvIdRef prop
 * threading, no duplicate socket listeners.
 *
 * Usage:
 *   // Wrap once, high up in the tree (currently in CommunicationModule or App)
 *   <MessagingProvider currentUser={user}>...</MessagingProvider>
 *
 *   // Anywhere inside:
 *   const { unreadCount, decrement, conversations, ... } = useMessaging();
 */

import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef,
} from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from './SocketContext';
import { useAuth }    from '../../auth/AuthContext';

const MessagingContext = createContext(null);

export function MessagingProvider({ children }) {
  const { socket } = useSocket();
  const { user }   = useAuth();

  // ── Active conversation ────────────────────────────────────────────────────
  // Stored as a ref AND state:
  //   • ref  — read synchronously inside socket handlers without stale closure
  //   • state — triggers re-renders in consumers that need it (MessagingPage)
  const activeConvIdRef = useRef(null);
  const [activeConversationId, _setActiveConvId] = useState(null);

  const setActiveConversationId = useCallback((id) => {
    activeConvIdRef.current = id ?? null;
    _setActiveConvId(id ?? null);
  }, []);

  // ── Unread badge ───────────────────────────────────────────────────────────
  const unreadConvIds   = useRef(new Set());
  const refreshTimerRef = useRef(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const ids   = await messageApi.getUnreadConversationIds();
      const idSet = new Set(ids);
      unreadConvIds.current = idSet;
      setUnreadCount(idSet.size);
    } catch {
      try {
        const n = await messageApi.getUnreadCount();
        setUnreadCount(n);
      } catch { /* silent */ }
    }
  }, []);

  // Load on mount
  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Called when a conversation is opened — drops badge immediately, then
  // does a debounced server re-sync to catch any additional marks made inside
  // the thread.
  const decrement = useCallback((conversationId) => {
    if (unreadConvIds.current.has(conversationId)) {
      unreadConvIds.current.delete(conversationId);
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refreshUnread(), 3000);
  }, [refreshUnread]);

  // ── Inbox list ─────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState([]);
  const [inboxLoading,  setInboxLoading]  = useState(true);
  const [inboxError,    setInboxError]    = useState(null);
  const knownIdsRef = useRef(new Set());

  const fetchInbox = useCallback(async () => {
    try {
      setInboxLoading(true);
      const data = await messageApi.getInbox();
      const list = data.conversations || data || [];
      // Zero out unread dot for the currently-open conversation in case
      // this fetch races with an in-flight markRead call
      const active = activeConvIdRef.current;
      setConversations(
        active
          ? list.map(c =>
              String(c.conversationId) === String(active)
                ? { ...c, unreadCount: 0 }
                : c
            )
          : list
      );
      knownIdsRef.current = new Set(list.map(c => c.conversationId));
      setInboxError(null);
    } catch (err) {
      setInboxError(err.message);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const clearUnreadDot = useCallback((conversationId) => {
    setConversations(prev =>
      prev.map(c =>
        c.conversationId === conversationId ? { ...c, unreadCount: 0 } : c
      )
    );
  }, []);

  const archiveConversation = useCallback(async (conversationId) => {
    await messageApi.archive(conversationId);
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
    knownIdsRef.current.delete(conversationId);
  }, []);

  // ── Socket: NEW_MESSAGE ────────────────────────────────────────────────────
  // Single listener handles everything: unread badge, inbox row update,
  // per-row flash. No prop drilling, no window events, no duplicate listeners
  // across hook instances.
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      const isMine =
        payload.senderUserId &&
        user?.userId &&
        String(payload.senderUserId) === String(user.userId);

      const isOpen =
        activeConvIdRef.current != null &&
        String(activeConvIdRef.current) === String(payload.conversationId);

      // ── Badge ──────────────────────────────────────────────────────────────
      if (!isMine && !isOpen) {
        const convId = payload.conversationId;
        if (!unreadConvIds.current.has(convId)) {
          unreadConvIds.current.add(convId);
          setUnreadCount(prev => prev + 1);
        }
      }

      // ── Inbox list ─────────────────────────────────────────────────────────
      if (!knownIdsRef.current.has(payload.conversationId)) {
        // Brand-new conversation — fetch full list
        fetchInbox();
        return;
      }

      setConversations(prev => {
        const exists = prev.find(c => c.conversationId === payload.conversationId);
        if (!exists) return prev;

        const updated = {
          ...exists,
          latestSender: payload.senderName,
          latestAt:     new Date().toISOString(),
          unreadCount:
            isMine || isOpen
              ? (exists.unreadCount || 0)
              : (exists.unreadCount || 0) + 1,
          _flash: !isMine && !isOpen,
        };

        // Clear the flash highlight after 1.6 s
        if (updated._flash) {
          setTimeout(() => {
            setConversations(p =>
              p.map(c =>
                c.conversationId === payload.conversationId
                  ? { ...c, _flash: false }
                  : c
              )
            );
          }, 1600);
        }

        return [updated, ...prev.filter(c => c.conversationId !== payload.conversationId)];
      });
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId, fetchInbox]);

  // ── MARK_READ: update per-message read receipts in conversations list ──────
  useEffect(() => {
    if (!socket) return;
    const handler = (payload) => {
      // Keep per-row unread dots accurate when a co-viewer marks messages
      // read in a shared conversation (cc / group_thread)
      if (!payload.conversationId || !payload.userId) return;
      setConversations(prev =>
        prev.map(c =>
          c.conversationId === payload.conversationId && c.unreadCount > 0
            ? { ...c }  // triggers re-render; actual dot is per-message in ChatWindow
            : c
        )
      );
    };
    socket.on('MARK_READ', handler);
    return () => socket.off('MARK_READ', handler);
  }, [socket]);

  const value = {
    // Badge
    unreadCount,
    decrement,
    refreshUnread,

    // Inbox
    conversations,
    inboxLoading,
    inboxError,
    fetchInbox,
    clearUnreadDot,
    archiveConversation,

    // Active conversation — set/clear when user opens/closes a thread
    activeConversationId,
    setActiveConversationId,
    activeConvIdRef,  // for consumers that need synchronous ref access
  };

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used inside <MessagingProvider>');
  return ctx;
}