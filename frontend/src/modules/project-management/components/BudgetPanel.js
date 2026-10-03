import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@emotion/react';
import { Pencil, Trash2 } from 'lucide-react';
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
const categoryLabel = (e) => (e.category === 'Other' ? (e.categoryOther || 'Other') : e.category);

function KpiCard({ label, value, color, theme }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '10px 12px', background: theme.colors.white }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || theme.colors.onyx, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function ExpenseModal({ categories, expense, onClose, onSave }) {
  const theme = useTheme();
  const [category, setCategory] = useState(expense?.category || '');
  const [categoryOther, setCategoryOther] = useState(expense?.categoryOther || '');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate || todayStr());
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy || 'Company');
  const [description, setDescription] = useState(expense?.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!category) { setError('Pick a category.'); return; }
    if (category === 'Other' && !categoryOther.trim()) { setError('Describe the "Other" category.'); return; }
    if (!expenseDate) { setError('Date is required.'); return; }
    if (!(Number(amount) > 0)) { setError('Amount must be greater than 0.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ category, categoryOther: category === 'Other' ? categoryOther.trim() : null, expenseDate, amount: Number(amount), paidBy, description: description.trim() || null });
      onClose();
    } catch (err) { setError(apiErrorMessage(err, 'Failed to save the expense.')); }
    finally { setSaving(false); }
  };

  const radio = (value, label) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: theme.colors.onyx, cursor: 'pointer' }}>
      <input type="radio" name="paidBy" value={value} checked={paidBy === value} onChange={() => setPaidBy(value)} style={{ margin: 0 }} />
      {label}
    </label>
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
            <input value={categoryOther} onChange={e => setCategoryOther(e.target.value)} maxLength={100} placeholder="e.g. Courier charges" />
          </Field>
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
          <div style={{ fontSize: 11, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
            Paid by <span style={{ color: theme.colors.espresso }}>*</span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {radio('Company', 'Company')}
            {radio('Own', 'My own money')}
          </div>
          {paidBy === 'Own' && (
            <div style={{ fontSize: 11, color: theme.colors.ash, marginTop: 6 }}>Shown as "Pending reimbursement" until the Manager marks it reimbursed.</div>
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

/** BudgetPanel — the project "Budget" tab: expenses with who paid and reimbursement. */
export default function BudgetPanel({ projectId }) {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | { expense? }
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

  const save = async (body) => {
    if (modal?.expense) await budgetApi.update(projectId, modal.expense.expenseId, body);
    else await budgetApi.create(projectId, body);
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

  const visibleTotal = visible.reduce((t, e) => t + e.amount, 0);
  const selectStyle = { fontSize: 12, padding: '6px 8px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, background: theme.colors.white, color: theme.colors.onyx, fontFamily: 'inherit' };
  const th = { fontSize: 10.5, color: theme.colors.ash, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { fontSize: 12.5, color: theme.colors.onyx, padding: '9px 10px', borderTop: `1px solid ${theme.colors.border}`, verticalAlign: 'top' };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <KpiCard theme={theme} label="Total spent" value={money(data.totals.total)} />
        <KpiCard theme={theme} label="Paid by company" value={money(data.totals.company)} />
        <KpiCard theme={theme} label="Paid from own money" value={money(data.totals.own)} />
        <KpiCard theme={theme} label="Pending reimbursement" value={money(data.totals.ownPending)} color={data.totals.ownPending > 0 ? theme.colors.danger : undefined} />
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
        {data.canAdd && <BtnPrimary type="button" onClick={() => setModal({})} style={{ fontSize: 12, padding: '7px 14px' }}>+ Add Expense</BtnPrimary>}
      </div>

      {visible.length === 0 ? (
        <Empty>{data.items.length === 0 ? 'No expenses recorded yet.' : 'No expenses match these filters.'}</Empty>
      ) : (
        <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, overflowX: 'auto', background: theme.colors.white }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: theme.colors.greige }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={th}>Paid by</th>
                <th style={th}>Added by</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.expenseId}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(e.expenseDate)}</td>
                  <td style={td}>{categoryLabel(e)}</td>
                  <td style={{ ...td, color: e.description ? theme.colors.onyx : theme.colors.ashLight, maxWidth: 280, wordBreak: 'break-word' }}>{e.description || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(e.amount)}</td>
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
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.createdByName}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {data.canManage && e.paidBy === 'Own' && (
                        <BtnGhost type="button" onClick={() => toggleReimbursed(e)} style={{ fontSize: 10.5, padding: '3px 8px' }}>
                          {e.isReimbursed ? 'Undo reimbursed' : 'Mark reimbursed'}
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

      {modal && <ExpenseModal categories={data.categories} expense={modal.expense} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
