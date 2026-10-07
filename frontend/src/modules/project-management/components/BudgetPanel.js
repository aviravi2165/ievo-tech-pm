import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { Pencil, Trash2, Paperclip, FileText, X } from 'lucide-react';
import { budgetApi } from '../api/projectApi';
import { showToast, apiErrorMessage } from '../hooks/toastStore';
import { ModalOverlay, Modal, Field, ModalFooter, BtnPrimary, BtnGhost, IconBtn, IconBtnDanger, Empty } from '../styles/shared.styles';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}
const categoryLabel = (e) => {
  if (e.category === 'Other') return e.categoryOther || 'Other';
  if (e.category === 'Travel' && e.travelMode) return `Travel · ${e.travelMode}`;
  return e.category;
};

function KpiCard({ label, value, color, theme }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '10px 12px', background: theme.colors.white }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || theme.colors.onyx, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const isInvoiceFile = (f) => f.type === 'application/pdf' || f.type.startsWith('image/');

function ExpenseModal({ categories, travelModes, otherMax, maxInvoices, expense, onClose, onSave }) {
  const theme = useTheme();
  const [category, setCategory] = useState(expense?.category || '');
  const [categoryOther, setCategoryOther] = useState(expense?.categoryOther || '');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate || todayStr());
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy || 'Company');
  const [travelMode, setTravelMode] = useState(expense?.travelMode || '');
  const [travelFrom, setTravelFrom] = useState(expense?.travelFrom || '');
  const [travelTo, setTravelTo] = useState(expense?.travelTo || '');
  const [description, setDescription] = useState(expense?.description || '');
  const [newFiles, setNewFiles] = useState([]);
  const [removeIds, setRemoveIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!category) { setError('Pick a category.'); return; }
    if (category === 'Other' && !categoryOther.trim()) { setError('Describe the "Other" category.'); return; }
    if (category === 'Travel' && !travelMode) { setError('Choose the travel mode: Car, Train or Flight.'); return; }
    if (category === 'Travel' && (!travelFrom.trim() || !travelTo.trim())) { setError('Enter where the travel was From and To.'); return; }
    if (!expenseDate) { setError('Date is required.'); return; }
    if (!(Number(amount) > 0)) { setError('Amount must be greater than 0.'); return; }
    if (keptFiles.length + newFiles.length === 0) { setError('Attach the invoice (PDF or image) — it is required.'); return; }
    setSaving(true); setError('');
    try {
      const isTravel = category === 'Travel';
      await onSave({
        category, categoryOther: category === 'Other' ? categoryOther.trim() : null,
        travelMode: isTravel ? travelMode : null, travelFrom: isTravel ? travelFrom.trim() : null, travelTo: isTravel ? travelTo.trim() : null,
        expenseDate, amount: Number(amount), paidBy, description: description.trim() || null,
      }, newFiles, removeIds);
      onClose();
    } catch (err) { setError(apiErrorMessage(err, 'Failed to save the expense.')); }
    finally { setSaving(false); }
  };

  const radio = (name, value, label, current, set) => (
    <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: theme.colors.onyx, cursor: 'pointer' }}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => set(value)} style={{ margin: 0 }} />
      {label}
    </label>
  );
  const sectionLabel = { fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 };

  const keptFiles = (expense?.invoices || []).filter(f => !removeIds.includes(f.fileId));
  const slotsLeft = maxInvoices - keptFiles.length - newFiles.length;
  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const bad = picked.filter(f => !isInvoiceFile(f));
    if (bad.length) { setError(`Invoice must be a PDF or an image — "${bad[0].name}" is not.`); return; }
    setError('');
    setNewFiles(prev => [...prev, ...picked].slice(0, maxInvoices - keptFiles.length));
  };
  const fileChip = (key, name, size, onRemove) => (
    <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: theme.colors.onyx, background: theme.colors.mid, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '4px 6px 4px 10px', maxWidth: '100%' }}>
      <FileText size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {size != null && <span style={{ color: theme.colors.ash, flexShrink: 0 }}>{fmtSize(size)}</span>}
      <button type="button" title="Remove" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.ash, display: 'flex', padding: 0 }}><X size={12} strokeWidth={2} /></button>
    </span>
  );

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal style={{ maxWidth: 460 }}>
        <h3>{expense ? 'Edit expense' : 'Add expense'}</h3>
        <Field>
          <label>Category <span className="req">*</span></label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Select a category…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {category === 'Other' && (
          <Field>
            <label>Other category <span className="req">*</span></label>
            <input value={categoryOther} onChange={e => setCategoryOther(e.target.value.slice(0, otherMax))} maxLength={otherMax} placeholder="e.g. Courier charges" />
            <div style={{ fontSize: 10.5, color: categoryOther.length >= otherMax ? theme.colors.danger : theme.colors.ashLight, textAlign: 'right', marginTop: 3 }}>
              {categoryOther.length}/{otherMax}
            </div>
          </Field>
        )}
        {/* Not inside <Field> — Field's input{width:100%} would stretch the radios. */}
        {category === 'Travel' && (
          <div style={{ marginBottom: 16 }}>
            <div style={sectionLabel}>Travel mode <span style={{ color: theme.colors.espresso }}>*</span></div>
            <div style={{ display: 'flex', gap: 20 }}>
              {travelModes.map(m => radio('travelMode', m, m, travelMode, setTravelMode))}
            </div>
          </div>
        )}
        {category === 'Travel' && travelMode && (
          <div style={{ display: 'flex', gap: 12 }}>
            <Field style={{ flex: 1 }}>
              <label>From <span className="req">*</span></label>
              <input value={travelFrom} onChange={e => setTravelFrom(e.target.value)} maxLength={100} placeholder="e.g. Ahmedabad" />
            </Field>
            <Field style={{ flex: 1 }}>
              <label>To <span className="req">*</span></label>
              <input value={travelTo} onChange={e => setTravelTo(e.target.value)} maxLength={100} placeholder="e.g. Mumbai" />
            </Field>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <Field style={{ flex: 1 }}>
            <label>Date <span className="req">*</span></label>
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
          </Field>
          <Field style={{ flex: 1 }}>
            <label>Amount (₹) <span className="req">*</span></label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        {/* Not inside <Field> — Field's input{width:100%} would stretch the radios. */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>
            Paid by <span style={{ color: theme.colors.espresso }}>*</span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {radio('paidBy', 'Company', 'Company', paidBy, setPaidBy)}
            {radio('paidBy', 'Own', 'My own money', paidBy, setPaidBy)}
          </div>
          {paidBy === 'Own' && (
            <div style={{ fontSize: 11, color: theme.colors.ash, marginTop: 6 }}>Shown as "Pending reimbursement" until it is marked reimbursed.</div>
          )}
        </div>
        {/* Invoice — mandatory. Not inside <Field>, whose label/input rules would restyle the upload control. */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Invoice <span style={{ color: theme.colors.espresso }}>*</span> <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(PDF or image)</span></div>
          {(keptFiles.length > 0 || newFiles.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {keptFiles.map(f => fileChip(`k${f.fileId}`, f.originalName, f.fileSize, () => setRemoveIds(prev => [...prev, f.fileId])))}
              {newFiles.map((f, i) => fileChip(`n${i}`, f.name, f.size, () => setNewFiles(prev => prev.filter((_, j) => j !== i))))}
            </div>
          )}
          {slotsLeft > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: theme.colors.onyx, border: `1px dashed ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '7px 12px', cursor: 'pointer', background: theme.colors.white }}>
              <Paperclip size={13} strokeWidth={2} />
              {keptFiles.length + newFiles.length === 0 ? 'Upload invoice' : 'Add another file'}
              <input type="file" accept="application/pdf,image/*" multiple onChange={pickFiles} style={{ display: 'none' }} />
            </label>
          )}
        </div>
        <Field>
          <label>Description (optional)</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="What was it for?" />
        </Field>
        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginBottom: 4 }}>{error}</div>}
        <ModalFooter>
          <BtnGhost onClick={onClose} disabled={saving}>Cancel</BtnGhost>
          <BtnPrimary onClick={submit} disabled={saving}>{saving ? 'Saving…' : (expense ? 'Save changes' : 'Add expense')}</BtnPrimary>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}

// Pick which pending own-money expenses were paid back, then mark them all at once.
function ReimburseModal({ pending, showOwner, onClose, onConfirm }) {
  const theme = useTheme();
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = pending.length > 0 && selected.size === pending.length;
  const selectedTotal = pending.filter(e => selected.has(e.expenseId)).reduce((t, e) => t + e.amount, 0);

  const confirm = async () => {
    if (!selected.size) { setError('Select at least one expense.'); return; }
    setSaving(true); setError('');
    try { await onConfirm([...selected]); onClose(); }
    catch (err) { setError(apiErrorMessage(err, 'Failed to mark as reimbursed.')); }
    finally { setSaving(false); }
  };

  return (
    <ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal style={{ maxWidth: 520 }}>
        <h3>Mark reimbursed</h3>
        <div style={{ fontSize: 12, color: theme.colors.ash, margin: '-6px 0 12px' }}>Select the own-money expenses that have been paid back.</div>
        {pending.length === 0 ? (
          <Empty>No pending own-money expenses.</Empty>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11.5, color: theme.colors.ash, marginBottom: 6 }}>
              <span>{selected.size} selected · {money(selectedTotal)}</span>
              <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(pending.map(e => e.expenseId)))}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: theme.colors.espresso }}>
                {allSelected ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm }}>
              {pending.map(e => (
                <label key={e.expenseId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${theme.colors.border}`, cursor: 'pointer', background: selected.has(e.expenseId) ? theme.colors.greige : theme.colors.white }}>
                  <input type="checkbox" checked={selected.has(e.expenseId)} onChange={() => toggle(e.expenseId)} style={{ margin: 0, width: 15, height: 15, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, color: theme.colors.onyx }}>{categoryLabel(e)}</span>
                    <span style={{ display: 'block', fontSize: 11, color: theme.colors.ash }}>
                      {fmtDate(e.expenseDate)}{showOwner ? ` · ${e.createdByName}` : ''}{e.description ? ` · ${e.description}` : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.colors.onyx, whiteSpace: 'nowrap' }}>{money(e.amount)}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {error && <div style={{ color: theme.colors.danger, fontSize: 12, marginTop: 8 }}>{error}</div>}
        <ModalFooter>
          <BtnGhost onClick={onClose} disabled={saving}>Cancel</BtnGhost>
          <BtnPrimary onClick={confirm} disabled={saving || selected.size === 0}>{saving ? 'Saving…' : `Mark ${selected.size || ''} reimbursed`}</BtnPrimary>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}

/** BudgetPanel — the project "Budget" tab: expenses with who paid and reimbursement. */
export default function BudgetPanel({ projectId }) {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | { expense? }
  const [showReimburse, setShowReimburse] = useState(false);
  const [paidFilter, setPaidFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const load = useCallback(async () => {
    try { setData(await budgetApi.list(projectId)); setError(''); }
    catch (err) { setError(apiErrorMessage(err, 'Failed to load expenses.')); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (data?.items || []).filter(e =>
    (paidFilter === 'All' || (paidFilter === 'Pending' ? e.paidBy === 'Own' && !e.isReimbursed : e.paidBy === paidFilter)) &&
    (categoryFilter === 'All' || e.category === categoryFilter)
  ), [data, paidFilter, categoryFilter]);

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <div style={{ padding: 20, color: theme.colors.ash, fontSize: 13 }}>Loading…</div>;

  const save = async (body, files, removeFileIds) => {
    if (modal?.expense) await budgetApi.update(projectId, modal.expense.expenseId, body, files, removeFileIds);
    else await budgetApi.create(projectId, body, files);
    showToast(modal?.expense ? 'Expense updated.' : 'Expense added.', 'success');
    await load();
  };

  const remove = async (e) => {
    if (!window.confirm(`Delete this ${money(e.amount)} expense?`)) return;
    try { await budgetApi.remove(projectId, e.expenseId); await load(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to delete the expense.')); }
  };

  const toggleReimbursed = async (e) => {
    try { await budgetApi.reimburse(projectId, e.expenseId, !e.isReimbursed); await load(); }
    catch (err) { showToast(apiErrorMessage(err, 'Failed to update reimbursement.')); }
  };

  const bulkReimburse = async (ids) => {
    const r = await budgetApi.bulkReimburse(projectId, ids);
    showToast(`${r.reimbursed} expense${r.reimbursed === 1 ? '' : 's'} (${money(r.amount)}) marked reimbursed.`, 'success');
    await load();
  };

  const downloadInvoice = async (e, f) => {
    try { await budgetApi.downloadInvoice(projectId, e.expenseId, f); }
    catch (err) { showToast(apiErrorMessage(err, 'Download failed.')); }
  };

  const pendingReimbursable = data.items.filter(e => e.paidBy === 'Own' && !e.isReimbursed && e.canReimburse);
  const visibleTotal = visible.reduce((t, e) => t + e.amount, 0);
  const isProjectScope = data.scope === 'project';
  // KPI cards follow the filters — they total only the rows currently shown.
  const sumOf = (arr) => arr.reduce((t, e) => t + e.amount, 0);
  const visibleOwn = visible.filter(e => e.paidBy === 'Own');
  const kpi = {
    total: visibleTotal,
    company: sumOf(visible.filter(e => e.paidBy === 'Company')),
    own: sumOf(visibleOwn),
    ownPending: sumOf(visibleOwn.filter(e => !e.isReimbursed)),
  };
  const activeFilters = [
    categoryFilter !== 'All' && categoryFilter,
    paidFilter !== 'All' && { Company: 'Paid by company', Own: 'Own money', Pending: 'Pending reimbursement' }[paidFilter],
  ].filter(Boolean);
  const selectStyle = { fontSize: 12, padding: '6px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.white, color: theme.colors.onyx, fontFamily: 'inherit' };
  const th = { fontSize: 10.5, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { fontSize: 12.5, color: theme.colors.onyx, padding: '9px 10px', borderTop: `1px solid ${theme.colors.border}`, verticalAlign: 'top' };

  return (
    <div>
      <div style={{ fontSize: 12, color: theme.colors.ash, marginBottom: 8 }}>
        {isProjectScope ? 'All expenses on this project.' : 'Your expenses — only you and the project Manager can see these.'}
        {activeFilters.length > 0 && (
          <> Totals below are for <strong style={{ color: theme.colors.onyx }}>{activeFilters.join(' · ')}</strong>.</>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <KpiCard theme={theme} label={isProjectScope ? 'Total spent' : 'Your total spent'} value={money(kpi.total)} />
        <KpiCard theme={theme} label="Paid by company" value={money(kpi.company)} />
        <KpiCard theme={theme} label={isProjectScope ? 'Paid from own money' : 'Paid from your own money'} value={money(kpi.own)} />
        <KpiCard theme={theme} label="Pending reimbursement" value={money(kpi.ownPending)} color={kpi.ownPending > 0 ? theme.colors.danger : undefined} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={paidFilter} onChange={e => setPaidFilter(e.target.value)} style={selectStyle}>
          <option value="All">All payments</option>
          <option value="Company">Paid by company</option>
          <option value="Own">Own money</option>
          <option value="Pending">Pending reimbursement</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
          <option value="All">All categories</option>
          {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: theme.colors.ash }}>{visible.length} {visible.length === 1 ? 'entry' : 'entries'} · {money(visibleTotal)}</span>
        <span style={{ flex: 1 }} />
        {pendingReimbursable.length > 0 && (
          <BtnGhost type="button" onClick={() => setShowReimburse(true)} style={{ fontSize: 12, padding: '7px 14px' }}>
            Mark reimbursed ({pendingReimbursable.length})
          </BtnGhost>
        )}
        {data.canAdd && <BtnPrimary type="button" onClick={() => setModal({})} style={{ fontSize: 12, padding: '7px 14px' }}>+ Add Expense</BtnPrimary>}
      </div>

      {visible.length === 0 ? (
        <Empty>{data.items.length === 0 ? (isProjectScope ? 'No expenses recorded yet.' : 'You have not added any expenses yet.') : 'No expenses match these filters.'}</Empty>
      ) : (
        <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, overflowX: 'auto', background: theme.colors.white }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: theme.colors.greige }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={th}>Invoice</th>
                <th style={th}>Paid by</th>
                {isProjectScope && <th style={th}>Added by</th>}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.expenseId}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(e.expenseDate)}</td>
                  <td style={td}>
                    {categoryLabel(e)}
                    {e.category === 'Travel' && e.travelFrom && (
                      <div style={{ fontSize: 11, color: theme.colors.ash, marginTop: 2 }}>{e.travelFrom} → {e.travelTo}</div>
                    )}
                  </td>
                  <td style={{ ...td, color: e.description ? theme.colors.onyx : theme.colors.ashLight, maxWidth: 280, wordBreak: 'break-word' }}>{e.description || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(e.amount)}</td>
                  <td style={td}>
                    {e.invoices.length === 0 ? <span style={{ color: theme.colors.ashLight }}>—</span> : (
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {e.invoices.map(f => (
                          <button key={f.fileId} type="button" onClick={() => downloadInvoice(e, f)} title={`Download ${f.originalName}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 160, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, color: theme.colors.espresso, fontFamily: 'inherit' }}>
                            <FileText size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>{f.originalName}</span>
                          </button>
                        ))}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {e.paidBy === 'Company' ? 'Company' : (
                      <span>
                        Own money{' '}
                        <span title={e.isReimbursed ? `Reimbursed${e.reimbursedByName ? ` by ${e.reimbursedByName}` : ''}` : undefined}
                          style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 8, marginLeft: 4,
                            color: e.isReimbursed ? theme.colors.success : theme.colors.danger,
                            background: `${e.isReimbursed ? theme.colors.success : theme.colors.danger}1a` }}>
                          {e.isReimbursed ? 'Reimbursed' : 'Pending'}
                        </span>
                      </span>
                    )}
                  </td>
                  {isProjectScope && <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.createdByName}</td>}
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {/* Marking happens from the top "Mark reimbursed" button; the row only offers Undo for a mistake. */}
                      {e.canReimburse && e.isReimbursed && (
                        <BtnGhost type="button" onClick={() => toggleReimbursed(e)} style={{ fontSize: 10.5, padding: '3px 8px' }}>
                          Undo reimbursed
                        </BtnGhost>
                      )}
                      {e.canEdit && <IconBtn title="Edit" onClick={() => setModal({ expense: e })}><Pencil size={12} strokeWidth={2} /></IconBtn>}
                      {e.canEdit && <IconBtnDanger title="Delete" onClick={() => remove(e)}><Trash2 size={12} strokeWidth={2} /></IconBtnDanger>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ExpenseModal categories={data.categories} travelModes={data.travelModes || ['Car', 'Train', 'Flight']} otherMax={data.otherMax || 20} maxInvoices={data.maxInvoices || 5} expense={modal.expense} onClose={() => setModal(null)} onSave={save} />}
      {showReimburse && <ReimburseModal pending={pendingReimbursable} showOwner={isProjectScope} onClose={() => setShowReimburse(false)} onConfirm={bulkReimburse} />}
    </div>
  );
}
