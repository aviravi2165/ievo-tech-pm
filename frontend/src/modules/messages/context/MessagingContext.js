/**
 * MessagingContext.js
 *
 * Single source of truth for all messaging state.
 *
 * Design: purely socket-driven after the initial page load.
 *
 *   INITIAL LOAD  — fetchInbox() runs once on mount; loads all conversation
 *                   rows including per-conversation unreadCount from the server.
 *
 *   AFTER THAT    — socket events (NEW_MESSAGE, MARK_READ) mutate the in-memory
 *                   conversations array directly. No timers, no polling, no
 *                   debounced server re-syncs.
 *
 *   unreadCount   — derived inline from conversations state:
 *                     conversations.filter(c => c.unreadCount > 0).length
 *                   It updates instantly whenever a conversation row changes,
 *                   with zero extra HTTP calls.
 *
 *   Brand-new conversation  — when a NEW_MESSAGE arrives for a conversationId
 *                   that isn't in the current list yet (first message in a new
 *                   thread), fetchInbox() is called once to pull the new row.
 *                   That is the only non-initial server call and it is
 *                   triggered by a socket event, not a timer.
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
  // ref  — read synchronously inside socket handlers (no stale closure)
  // state — drives re-renders in consumers
  const activeConvIdRef = useRef(null);
  const [activeConversationId, _setActiveConvId] = useState(null);

  const setActiveConversationId = useCallback((id) => {
    activeConvIdRef.current = id ?? null;
    _setActiveConvId(id ?? null);
  }, []);

  // ── Inbox list ─────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState([]);
  const [inboxLoading,  setInboxLoading]  = useState(true);
  const [inboxError,    setInboxError]    = useState(null);

  // Tracks which conversationIds are currently rendered so the NEW_MESSAGE
  // handler knows whether to update a row in-place or fetch the full list.
  const knownIdsRef = useRef(new Set());

  const fetchInbox = useCallback(async () => {
    try {
      setInboxLoading(true);
      const data = await messageApi.getInbox();
      const list = data.conversations || data || [];

      // If a conversation is open while this fetch lands, make sure we don't
      // re-show its unread dot (mark-read REST calls may still be in flight).
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

  // Single server call on mount — everything after this is socket-driven.
  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // ── unreadCount ────────────────────────────────────────────────────────────
  // Derived directly from conversations — always in sync, zero extra calls.
  const unreadCount = conversations.filter(c => c.unreadCount > 0).length;

  // ── clearUnreadDot ─────────────────────────────────────────────────────────
  // Zeroes the per-row unread indicator when the user opens a conversation.
  const clearUnreadDot = useCallback((conversationId) => {
    setConversations(prev =>
      prev.map(c =>
        String(c.conversationId) === String(conversationId)
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
  }, []);

  // ── decrement ──────────────────────────────────────────────────────────────
  // Called by MessagingPage when a conversation is opened.
  // With socket-driven state the badge recalculates from conversations
  // automatically — clearing the dot is the only action needed.
  // No debounced server re-sync, no setTimeout.
  const decrement = useCallback((conversationId) => {
    clearUnreadDot(conversationId);
  }, [clearUnreadDot]);

  // ── archiveConversation ────────────────────────────────────────────────────
  const archiveConversation = useCallback(async (conversationId) => {
    await messageApi.archive(conversationId);
    setConversations(prev => prev.filter(c => c.conversationId !== conversationId));
    knownIdsRef.current.delete(conversationId);
  }, []);

  // ── Socket: NEW_MESSAGE ────────────────────────────────────────────────────
  // Handles badge, inbox row update, and flash highlight in one place.
  // No polling, no timers — state changes are instant.
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

      // Brand-new conversation not yet in the list — fetch once to get the
      // full row (subject, participant names, etc.). This is the only
      // non-initial fetch and it is socket-triggered, not a timer.
      if (!knownIdsRef.current.has(payload.conversationId)) {
        if (!isMine) fetchInbox();
        return;
      }

      setConversations(prev => {
        const exists = prev.find(c =>
          String(c.conversationId) === String(payload.conversationId)
        );
        if (!exists) return prev;

        const updated = {
          ...exists,
          latestSender: payload.senderName,
          latestAt:     new Date().toISOString(),
          // unreadCount drives both the row dot and the header badge (derived)
          unreadCount:
            isMine || isOpen
              ? (exists.unreadCount || 0)         // own message / already open — no dot
              : (exists.unreadCount || 0) + 1,    // genuine new unread
          _flash: !isMine && !isOpen,
        };

        // Clear the flash highlight after 1.6 s (visual cue only, no server call)
        if (updated._flash) {
          setTimeout(() => {
            setConversations(p =>
              p.map(c =>
                String(c.conversationId) === String(payload.conversationId)
                  ? { ...c, _flash: false }
                  : c
              )
            );
          }, 1600);
        }

        return [updated, ...prev.filter(c =>
          String(c.conversationId) !== String(payload.conversationId)
        )];
      });
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, user?.userId, fetchInbox]);

  // ── Socket: MARK_READ ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (payload) => {
      if (!payload.conversationId || !payload.userId) return;
      setConversations(prev =>
        prev.map(c =>
          String(c.conversationId) === String(payload.conversationId) && c.unreadCount > 0
            ? { ...c }  // shallow clone triggers re-render in ChatWindow
            : c
        )
      );
    };
    socket.on('MARK_READ', handler);
    return () => socket.off('MARK_READ', handler);
  }, [socket]);

  const value = {
    // Badge — derived from conversations, always in sync
    unreadCount,
    decrement,

    // Inbox
    conversations,
    inboxLoading,
    inboxError,
    fetchInbox,
    clearUnreadDot,
    archiveConversation,

    // Active conversation
    activeConversationId,
    setActiveConversationId,
    activeConvIdRef,
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