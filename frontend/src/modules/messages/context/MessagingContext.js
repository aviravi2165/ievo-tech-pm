/**
 * MessagingContext.js
 *
 * Single source of truth for all messaging state.
 * Purely socket-driven after the initial page load — no timers, no polling.
 *
 *   INITIAL LOAD        — fetchInbox() once on mount.
 *   BADGE (unreadCount) — derived from conversations[].unreadCount. Zero extra calls.
 *   NEW_MESSAGE         — updates inbox row in-place. If the conversationId is
 *                         not yet in the list (brand-new thread, including ones
 *                         the current user just sent), fetchInbox() is called
 *                         once to pull the new row. Socket-triggered, not a timer.
 *   MARK_READ           — clears the unread dot for the relevant conversation.
 */

import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef,
} from 'react';
import { messageApi } from '../api/messageApi';
import { useSocket }  from './SocketContext';
import { useAuth }    from '../../auth/AuthContext';
import { useGroups }  from '../hooks/useGroups';

const MessagingContext = createContext(null);

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'info', onClick) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type, onClick }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  return { toasts, toast: add };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function MessagingProvider({ children }) {
  const { socket } = useSocket();
  const { user }   = useAuth();
  const { toasts, toast } = useToast();

  // ── Identity ───────────────────────────────────────────────────────────────
  const currentUserId = user?.userId;
  const isSuperAdmin  = Boolean(
    user?.isSuperAdmin || user?.is_super_admin || user?.isAdmin || user?.is_admin ||
    user?.user_type === 'admin' || user?.userType === 'admin' || user?.role === 'super_admin'
  );

  // ── Groups ─────────────────────────────────────────────────────────────────
  const {
    groups, loading: groupsLoading,
    createGroup, disableGroup, enableGroup, deleteGroup, hideGroup,
    refetch: refetchGroups,
  } = useGroups();

  useEffect(() => {
    window.addEventListener('groups-updated', refetchGroups);
    return () => window.removeEventListener('groups-updated', refetchGroups);
  }, [refetchGroups]);

  // ── Active conversation ────────────────────────────────────────────────────
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
  const knownIdsRef = useRef(new Set());

  const fetchInbox = useCallback(async () => {
    try {
      setInboxLoading(true);
      const data = await messageApi.getInbox();
      const list = data.conversations || data || [];
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

  // ── Sent tab ───────────────────────────────────────────────────────────────
  const [sentConvs,   setSentConvs]   = useState([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError,   setSentError]   = useState(null);

  const fetchSent = useCallback(() => {
    setSentLoading(true);
    setSentError(null);
    messageApi.getSent()
      .then(data => setSentConvs(data.conversations || data || []))
      .catch(err  => setSentError(err.message || 'Failed to load sent mail'))
      .finally(() => setSentLoading(false));
  }, []);

  // ── unreadCount ────────────────────────────────────────────────────────────
  const unreadCount = conversations.filter(c => c.unreadCount > 0).length;

  // ── clearUnreadDot / decrement ─────────────────────────────────────────────
  const clearUnreadDot = useCallback((conversationId) => {
    setConversations(prev =>
      prev.map(c =>
        String(c.conversationId) === String(conversationId)
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
  }, []);

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
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      const isMine =
        payload.senderUserId && currentUserId &&
        String(payload.senderUserId) === String(currentUserId);

      const isOpen =
        activeConvIdRef.current != null &&
        String(activeConvIdRef.current) === String(payload.conversationId);

      // Brand-new conversation not yet in the list — fetch once to get the
      // full row. This covers BOTH messages from others AND messages the
      // current user just sent (isMine=true for a new BCC conversation).
      // Previously the !isMine guard here caused the inbox to never update
      // when the current user sent a message to a brand-new thread.
      if (!knownIdsRef.current.has(payload.conversationId)) {
        fetchInbox();
        // Also refresh sent tab since the user just sent a new conversation
        if (isMine) fetchSent();
        return;
      }

      // Existing conversation — update the row in-place
      if (isMine) {
        // For own messages in existing convs, just refresh sent tab
        fetchSent();
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
          unreadCount:
            isOpen
              ? (exists.unreadCount || 0)
              : (exists.unreadCount || 0) + 1,
          _flash: !isOpen,
        };

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
  }, [socket, currentUserId, fetchInbox, fetchSent]);

  // ── Socket: MARK_READ ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      // When the current user marks messages read, clear the dot
      if (String(userId) === String(currentUserId)) {
        clearUnreadDot(conversationId);
      }
    };
    socket.on('MARK_READ', handler);
    return () => socket.off('MARK_READ', handler);
  }, [socket, currentUserId, clearUnreadDot]);

  const value = {
    // Identity
    currentUserId,
    isSuperAdmin,

    // Toast
    toast,
    toasts,

    // Groups
    groups,
    groupsLoading,
    createGroup,
    disableGroup,
    enableGroup,
    deleteGroup,
    hideGroup,
    refetchGroups,

    // Badge
    unreadCount,
    decrement,

    // Inbox
    conversations,
    inboxLoading,
    inboxError,
    fetchInbox,
    clearUnreadDot,
    archiveConversation,

    // Sent
    sentConvs,
    sentLoading,
    sentError,
    fetchSent,

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