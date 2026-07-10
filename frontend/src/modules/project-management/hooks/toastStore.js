// Minimal module-level pub-sub toast store — deliberately NOT a React
// Context. Blocked-action errors need to be raised from TaskItem/
// ActivityRow/PhasePanel, three levels deep in the tree, and those errors
// were previously just swallowed by an empty `catch {}` with no feedback
// at all — a user clicking a blocked task's status dropdown saw nothing
// happen and had no idea why. A plain importable function avoids threading
// a callback prop through three component levels just for this.
let listeners = [];
let toasts = [];
let counter = 0;

function emit() { listeners.forEach(l => l(toasts)); }

export function showToast(msg, type = 'error') {
  const id = ++counter;
  toasts = [...toasts, { id, msg, type }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    emit();
  }, 4500);
}

export function subscribeToasts(listener) {
  listeners.push(listener);
  listener(toasts);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

// Extracts the backend's actual error message (app.js's error handler
// always responds { error, message }) so the toast shows WHY an action
// was blocked, not a generic "something went wrong."
export function apiErrorMessage(err, fallback = 'Something went wrong.') {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}
