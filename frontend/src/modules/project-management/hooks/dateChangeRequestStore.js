// Module-level pub-sub store for the date-change-approval modal — same
// pattern as toastStore.js. A locked-date save (409, code:'DATE_LOCKED')
// can happen from ProjectEditModal, PhasePanel, ActivityRow or TaskItem;
// this lets any of them open ONE shared modal (mounted once in
// ProjectDetailPage) without prop-drilling its open state through the tree.
import { showToast } from './toastStore';

let listeners = [];
let current = null; // { entityType, entityId, field, oldValue, newValue, projectId, onDone? } | null

function emit() { listeners.forEach(l => l(current)); }

export function openDateChangeRequest(meta) {
  current = meta;
  emit();
}

export function closeDateChangeRequest() {
  current = null;
  emit();
}

export function subscribeDateChangeRequest(listener) {
  listeners.push(listener);
  listener(current);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

// Drop-in replacement for `catch (err) { showToast(apiErrorMessage(err, fallback)); }`
// in every date-editing save call — opens the request modal on a locked-date
// 409 (using the entityType/entityId/field/oldValue/newValue/projectId the
// backend's error attaches), otherwise falls back to the normal error toast.
export function handleSaveError(err, fallback = 'Something went wrong.') {
  const data = err?.response?.data;
  if (data?.code === 'DATE_LOCKED' && data?.meta) {
    openDateChangeRequest(data.meta);
    return;
  }
  showToast(data?.error || data?.message || fallback);
}
