import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { activityApi, taskApi } from '../api/projectApi';
import { useMessaging } from '../../messages/context/MessagingContext';
import { BtnGhost } from '../styles/shared.styles';

/**
 * ChatButton
 * compact — icon only, no label (used in space-constrained activity header row)
 * When the backend returns 403 (not a member), shows a friendly tooltip instead
 * of the alarming red "!" badge.
 */
export default function ChatButton({ kind, id, label, compact = false }) {
  const { requestOpenConversation, requestOpenGroup } = useMessaging();
  const [loading, setLoading] = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!id) return;
    setLoading(true); setErrMsg('');
    try {
      const data = kind === 'activity'
        ? await activityApi.getChat(id)
        : await taskApi.getChat(id);

      if (kind === 'activity') {
        requestOpenGroup({
          conversationId: data.conversationId,
          groupId:        data.groupId  || null,
          subject:        data.subject  || '',
        });
      } else {
        requestOpenConversation({
          conversationId: data.conversationId,
          subject:        data.subject  || '',
          convType:       data.convType || 'cc',
        });
      }
      window.dispatchEvent(new CustomEvent('open-messages-panel'));
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) {
        setErrMsg('You are not a member of this activity\'s chat');
      } else {
        setErrMsg(err?.response?.data?.error || 'Chat not available yet');
      }
    } finally { setLoading(false); }
  };

  // Determine what to show in the button
  const defaultLabel = kind === 'activity' ? 'Group Chat' : 'Chat';
  const displayLabel = compact ? null : (label || defaultLabel);

  const title = errMsg
    || (loading ? 'Opening…' : (kind === 'activity' ? 'Open activity group chat' : 'Open task chat'));

  return (
    <BtnGhost
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: compact ? 0 : 5,
        fontSize: 11,
        // When there's a no-access error, mute the button instead of alarming red
        opacity: errMsg ? 0.45 : 1,
        cursor: errMsg ? 'not-allowed' : 'pointer',
        padding: compact ? '4px 6px' : undefined,
      }}
    >
      <MessageSquare size={13} strokeWidth={2.2} />
      {displayLabel && (loading ? '…' : displayLabel)}
    </BtnGhost>
  );
}