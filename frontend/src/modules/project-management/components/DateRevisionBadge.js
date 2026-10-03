import { createContext, useContext, useState } from 'react';
import { useTheme } from '@emotion/react';
import { History, X } from 'lucide-react';
import { ModalOverlay, Modal } from '../styles/shared.styles';

// { 'task:12': { count, events: [...] }, ... } for the open project — loaded
// once by ProjectDetailPage so rows don't each fetch their own history.
export const DateRevisionsContext = createContext({});

function fmtDay(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}
function fmtStamp(ts) {
  if (!ts) return '';
  const dt = new Date(ts);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()} ${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}
function shiftLabel(oldValue, newValue) {
  if (!oldValue || !newValue) return null;
  const days = Math.round((new Date(newValue) - new Date(oldValue)) / 86400000);
  if (!days) return null;
  return days > 0 ? `+${days}d later` : `${days}d earlier`;
}

function RevisionHistoryModal({ title, info, onClose }) {
  const theme = useTheme();
  return (
    <ModalOverlay onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} onClick={e => e.stopPropagation()}>
      <Modal style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Date revision history</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: theme.colors.onyx, marginTop: 2, wordBreak: 'break-word' }}>{title}</div>
            <div style={{ fontSize: 12, color: theme.colors.ash, marginTop: 2 }}>Dates revised {info.count} time{info.count === 1 ? '' : 's'}</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {info.events.map((ev, i) => {
            const shift = shiftLabel(ev.oldValue, ev.newValue);
            return (
              <div key={i} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '9px 12px', background: ev.isRevision ? theme.colors.white : theme.colors.greige }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: theme.colors.ash, textTransform: 'uppercase' }}>{ev.fieldLabel}</span>
                  {ev.isRevision ? (
                    <span style={{ fontSize: 13, color: theme.colors.onyx }}>
                      <span style={{ textDecoration: 'line-through', color: theme.colors.ash }}>{fmtDay(ev.oldValue)}</span>
                      {'  →  '}
                      <strong>{fmtDay(ev.newValue)}</strong>
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: theme.colors.onyx }}>Set to <strong>{fmtDay(ev.newValue)}</strong></span>
                  )}
                  {shift && <span style={{ fontSize: 10.5, fontWeight: 700, color: shift.startsWith('+') ? theme.colors.danger : theme.colors.success }}>{shift}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: theme.colors.ash, marginTop: 4 }}>
                  {ev.kind === 'approved'
                    ? <>Requested by {ev.byName || '—'} · approved by {ev.approvedByName || '—'} · {fmtStamp(ev.at)}</>
                    : <>Changed directly by {ev.byName || '—'} · {fmtStamp(ev.at)}</>}
                </div>
                {ev.reason && <div style={{ fontSize: 12, color: theme.colors.onyx, marginTop: 4 }}>Reason: {ev.reason}</div>}
                {ev.decisionNote && <div style={{ fontSize: 12, color: theme.colors.ash, marginTop: 2 }}>Approver note: {ev.decisionNote}</div>}
              </div>
            );
          })}
        </div>
      </Modal>
    </ModalOverlay>
  );
}

/** Small "↺ N" chip shown next to an entity's dates once they've been revised. */
export default function DateRevisionBadge({ entityType, entityId, title }) {
  const theme = useTheme();
  const revisions = useContext(DateRevisionsContext);
  const [open, setOpen] = useState(false);
  const info = revisions?.[`${entityType}:${entityId}`];
  if (!info) return null;
  return (
    <>
      <button type="button" title={`Dates revised ${info.count} time${info.count === 1 ? '' : 's'} — click for history`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap',
          color: theme.colors.warning, background: `${theme.colors.warning}1f`, border: `1px solid ${theme.colors.warning}55`,
          borderRadius: 8, padding: '1px 6px', cursor: 'pointer', lineHeight: 1.4 }}>
        <History size={9} strokeWidth={2.5} /> Revised ×{info.count}
      </button>
      {open && <RevisionHistoryModal title={title} info={info} onClose={() => setOpen(false)} />}
    </>
  );
}
