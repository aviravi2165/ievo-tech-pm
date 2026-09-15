import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@emotion/react';
import { X } from 'lucide-react';
import { dateApproverApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import UserSearchInput from './UserSearchInput';
import { ModalOverlay, Modal, BtnPrimary, BtnGhost } from '../styles/shared.styles';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

function initials(name = '') { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

/**
 * ManageApproversModal — admin-only. Curates pm_date_approvers: the fixed
 * list of people (besides admins, who are always eligible) a requester can
 * send a date-change request to. Opened from TopBanner's "Manage Approvers"
 * button, same pattern as UserManagementModal.
 */
export default function ManageApproversModal({ open, onClose }) {
  const theme = useTheme();
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEscapeKey(open ? onClose : undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try { setApprovers(await dateApproverApi.list()); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to load approvers.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  if (!open) return null;

  const addApprover = async () => {
    if (!pick) return;
    setAdding(true); setError('');
    try { setApprovers(await dateApproverApi.add(pick.userId)); setPick(null); }
    catch (err) { setError(apiErrorMessage(err, 'Failed to add approver.')); }
    finally { setAdding(false); }
  };

  const removeApprover = async (userId) => {
    setBusyId(userId);
    try { setApprovers(await dateApproverApi.remove(userId)); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to remove approver.')); }
    finally { setBusyId(null); }
  };

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal style={{ maxWidth: 460 }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex' }} title="Close">
          <X size={18} strokeWidth={2} />
        </button>
        <h3>Manage Approvers</h3>
        <p style={{ fontSize: 12.5, color: theme.colors.ash, lineHeight: 1.6, marginTop: -10, marginBottom: 18 }}>
          Everyone here (plus every admin) can be picked as the approver for a date-change request, on any project — they don't need to be a member of it.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <UserSearchInput selectedUser={pick} onSelect={setPick} excludeUserIds={approvers.map(a => a.userId)} placeholder="Search a user to add as approver…" />
          <BtnPrimary onClick={addApprover} disabled={!pick || adding} style={{ flexShrink: 0 }}>{adding ? 'Adding…' : 'Add'}</BtnPrimary>
        </div>
        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 14 }}>{error}</div>}

        {loading ? (
          <div style={{ color: theme.colors.ash, fontSize: 13 }}>Loading…</div>
        ) : approvers.length === 0 ? (
          <div style={{ color: theme.colors.ash, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No approvers added yet.</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {approvers.map(a => (
              <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${theme.colors.border}` }}>
                <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', background: theme.colors.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: theme.colors.onyx }}>{initials(a.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: theme.colors.onyx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: theme.colors.ash, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email}</div>
                </div>
                <BtnGhost onClick={() => removeApprover(a.userId)} disabled={busyId === a.userId} style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}>
                  {busyId === a.userId ? 'Removing…' : 'Remove'}
                </BtnGhost>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </ModalOverlay>
  );
}
