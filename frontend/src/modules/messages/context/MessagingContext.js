/**
 * MessagingContext.js
 *
 * Single source of truth for all messaging state.
 * Purely socket-driven — no timers, no polling.
 *
 * KEY DESIGN:
 *   - Inbox (bcc/cc) and Group (group_thread) conversations are tracked
 *     separately with separate unread counts so their tab badges are independent.
 *   - Both contribute to a combined total badge shown outside the module.
 *   - NEW_MESSAGE from a group thread increments groupUnreadCount only.
 *   - NEW_MESSAGE from bcc/cc increments inboxUnreadCount only.
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

  // ── Inbox conversations (bcc / cc only) ───────────────────────────────────
  const [conversations,    setConversations]    = useState([]);
  const [inboxLoading,     setInboxLoading]     = useState(true);
  const [inboxError,       setInboxError]       = useState(null);
  const knownInboxIdsRef = useRef(new Set());

  // ── Group conversations (group_thread only) ───────────────────────────────
  const [groupConversations,   setGroupConversations]   = useState([]);
  const [groupConvsLoading,    setGroupConvsLoading]    = useState(true);
  const knownGroupIdsRef = useRef(new Set());

  const fetchInbox = useCallback(async () => {
    try {
      setInboxLoading(true);
      const data = await messageApi.getInbox();
      const all  = data.conversations || data || [];

      // Split into inbox (bcc/cc) and group (group_thread)
      const inbox  = all.filter(c => c.convType !== 'group_thread' && !c.groupName);
      const groups = all.filter(c => c.convType === 'group_thread' || !!c.groupName);

      const active = activeConvIdRef.current;

      setConversations(
        active ? inbox.map(c =>
          String(c.conversationId) === String(active) ? { ...c, unreadCount: 0 } : c
        ) : inbox
      );
      setGroupConversations(
        active ? groups.map(c =>
          String(c.conversationId) === String(active) ? { ...c, unreadCount: 0 } : c
        ) : groups
      );

      knownInboxIdsRef.current = new Set(inbox.map(c => c.conversationId));
      knownGroupIdsRef.current = new Set(groups.map(c => c.conversationId));
      setInboxError(null);
    } catch (err) {
      setInboxError(err.message);
    } finally {
      setInboxLoading(false);
      setGroupConvsLoading(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // ── Separate unread counts ─────────────────────────────────────────────────
  const inboxUnreadCount = conversations.filter(c => c.unreadCount > 0).length;
  const groupUnreadCount = groupConversations.filter(c => c.unreadCount > 0).length;
  // Combined for the external badge (MessagePanel)
  const unreadCount = inboxUnreadCount + groupUnreadCount;

  // ── clearUnreadDot ─────────────────────────────────────────────────────────
  const clearUnreadDot = useCallback((conversationId) => {
    setConversations(prev =>
      prev.map(c => String(c.conversationId) === String(conversationId) ? { ...c, unreadCount: 0 } : c)
    );
    setGroupConversations(prev =>
      prev.map(c => String(c.conversationId) === String(conversationId) ? { ...c, unreadCount: 0 } : c)
    );
  }, []);

  const decrement = useCallback((conversationId) => {
    clearUnreadDot(conversationId);
  }, [clearUnreadDot]);

  // ── Socket: NEW_MESSAGE ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      const isMine  = payload.senderUserId && currentUserId &&
        String(payload.senderUserId) === String(currentUserId);
      const isOpen  = activeConvIdRef.current != null &&
        String(activeConvIdRef.current) === String(payload.conversationId);
      const isGroup = payload.convType === 'group_thread' || !!payload.groupName || !!payload.groupId;

      // Brand-new conversation not yet in any list — refetch
      const isKnown = knownInboxIdsRef.current.has(payload.conversationId) ||
                      knownGroupIdsRef.current.has(payload.conversationId);
      if (!isKnown) {
        fetchInbox();
        return;
      }

      // Own message in existing conv — move to top only
      if (isMine) {
        const bubbleToTop = (setter) => setter(prev => {
          const match = prev.find(c => String(c.conversationId) === String(payload.conversationId));
          if (!match) return prev;
          return [
            { ...match, latestAt: new Date().toISOString() },
            ...prev.filter(c => String(c.conversationId) !== String(payload.conversationId)),
          ];
        });
        if (isGroup) bubbleToTop(setGroupConversations);
        else         bubbleToTop(setConversations);
        return;
      }

      // Message from someone else — update the right list.
      // System messages (group name/description changes, sender = null) never
      // count toward unread — they're informational chips, not real content.
      const updateList = (setter) => setter(prev => {
        const exists = prev.find(c => String(c.conversationId) === String(payload.conversationId));
        if (!exists) return prev;
        const updated = {
          ...exists,
          latestSender: payload.isSystem ? exists.latestSender : payload.senderName,
          latestAt:     new Date().toISOString(),
          unreadCount:  payload.isSystem
            ? (exists.unreadCount || 0)
            : (isOpen ? (exists.unreadCount || 0) : (exists.unreadCount || 0) + 1),
          _flash: !payload.isSystem && !isOpen,
        };
        if (updated._flash) {
          setTimeout(() => {
            setter(p => p.map(c =>
              String(c.conversationId) === String(payload.conversationId)
                ? { ...c, _flash: false } : c
            ));
          }, 1600);
        }
        return [updated, ...prev.filter(c =>
          String(c.conversationId) !== String(payload.conversationId)
        )];
      });

      if (isGroup) updateList(setGroupConversations);
      else         updateList(setConversations);
    };

    socket.on('NEW_MESSAGE', handler);
    return () => socket.off('NEW_MESSAGE', handler);
  }, [socket, currentUserId, fetchInbox]);

  // ── Socket: MARK_READ ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      if (String(userId) === String(currentUserId)) clearUnreadDot(conversationId);
    };
    socket.on('MARK_READ', handler);
    return () => socket.off('MARK_READ', handler);
  }, [socket, currentUserId, clearUnreadDot]);

  const value = {
    currentUserId, isSuperAdmin,
    toast, toasts,
    groups, groupsLoading, createGroup, disableGroup, enableGroup, deleteGroup, hideGroup, refetchGroups,
    unreadCount, inboxUnreadCount, groupUnreadCount, decrement,
    conversations, groupConversations, groupConvsLoading,
    inboxLoading, inboxError, fetchInbox, clearUnreadDot,
    activeConversationId, setActiveConversationId, activeConvIdRef,
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