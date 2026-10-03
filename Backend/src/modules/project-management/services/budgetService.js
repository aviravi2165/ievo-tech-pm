'use strict';

/**
 * budgetService — project expenses (the Budget tab).
 *
 * Any project Member+ records an expense: category (or "Other" + free text),
 * date, amount, and who paid — the Company, or the person's Own money. Own-
 * money entries are tracked until a Manager marks them Reimbursed.
 * Edit/delete: the entry's creator, or a Manager.
 */

const { getPool, sql } = require('../../../config/db');

const CATEGORIES = ['Travel', 'Food', 'Accommodation', 'Local Conveyance', 'Materials', 'Printing & Stationery', 'Software / Subscription', 'Other'];
const PAID_BY = ['Company', 'Own'];

function httpError(status, message) { const e = new Error(message); e.statusCode = status; return e; }

function normalize({ category, categoryOther, description, expenseDate, amount, paidBy }) {
  if (!CATEGORIES.includes(category)) throw httpError(400, 'Pick a category.');
  const other = (categoryOther || '').trim();
  if (category === 'Other' && !other) throw httpError(400, 'Describe the "Other" category.');
  if (other.length > 100) throw httpError(400, 'Category text is too long (max 100).');
  const desc = (description || '').trim();
  if (desc.length > 500) throw httpError(400, 'Description is too long (max 500).');
  const date = String(expenseDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'Date is required.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw httpError(400, 'Amount must be greater than 0.');
  if (amt > 999999999999) throw httpError(400, 'Amount is too large.');
  if (!PAID_BY.includes(paidBy)) throw httpError(400, 'Choose who paid: Company or Own money.');
  return {
    category, categoryOther: category === 'Other' ? other : null, description: desc || null,
    expenseDate: date, amount: Math.round(amt * 100) / 100, paidBy,
  };
}

const SELECT = `
  SELECT e.expense_id AS expenseId, e.category, e.category_other AS categoryOther, e.description,
         CONVERT(varchar(10), e.expense_date, 23) AS expenseDate, e.amount, e.paid_by AS paidBy,
         e.is_reimbursed AS isReimbursed, e.reimbursed_at AS reimbursedAt,
         e.created_by AS createdById, e.created_at AS createdAt, e.updated_at AS updatedAt,
         COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS createdByName,
         COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email) AS reimbursedByName
  FROM pm_project_expenses e
  INNER JOIN auth_users u ON u.user_id = e.created_by
  LEFT JOIN auth_users ru ON ru.user_id = e.reimbursed_by`;

async function getExpense(expenseId, projectId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, expenseId).input('projectId', sql.Int, projectId)
    .query(`${SELECT} WHERE e.expense_id=@id AND e.project_id=@projectId AND e.is_deleted=0`);
  const row = r.recordset[0];
  if (!row) throw httpError(404, 'Expense not found.');
  return row;
}

function decorate(row, viewerId, projectRole) {
  const mine = String(row.createdById) === String(viewerId);
  return { ...row, amount: Number(row.amount), canEdit: mine || projectRole === 'Manager' };
}

function assertCanEdit(expense, actorId, projectRole) {
  if (projectRole !== 'Manager' && String(expense.createdById) !== String(actorId)) {
    throw httpError(403, 'You can only change expenses you added.');
  }
}

async function listExpenses(projectId, viewerId, projectRole) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId)
    .query(`${SELECT} WHERE e.project_id=@projectId AND e.is_deleted=0 ORDER BY e.expense_date DESC, e.expense_id DESC`);
  const items = r.recordset.map(row => decorate(row, viewerId, projectRole));
  const sum = (arr) => Math.round(arr.reduce((t, x) => t + x.amount, 0) * 100) / 100;
  const own = items.filter(x => x.paidBy === 'Own');
  return {
    categories: CATEGORIES,
    items,
    totals: {
      total: sum(items),
      company: sum(items.filter(x => x.paidBy === 'Company')),
      own: sum(own),
      ownPending: sum(own.filter(x => !x.isReimbursed)),
    },
    canAdd: projectRole === 'Manager' || projectRole === 'Member',
    canManage: projectRole === 'Manager',
  };
}

async function createExpense(projectId, body, actorId, projectRole) {
  const v = normalize(body);
  const pool = await getPool();
  const r = await pool.request()
    .input('projectId', sql.Int, projectId).input('category', sql.NVarChar(50), v.category)
    .input('categoryOther', sql.NVarChar(100), v.categoryOther).input('description', sql.NVarChar(500), v.description)
    .input('expenseDate', sql.Date, v.expenseDate).input('amount', sql.Decimal(14, 2), v.amount)
    .input('paidBy', sql.NVarChar(10), v.paidBy).input('createdBy', sql.UniqueIdentifier, actorId)
    .query(`INSERT INTO pm_project_expenses (project_id, category, category_other, description, expense_date, amount, paid_by, created_by)
            OUTPUT INSERTED.expense_id
            VALUES (@projectId, @category, @categoryOther, @description, @expenseDate, @amount, @paidBy, @createdBy)`);
  return decorate(await getExpense(r.recordset[0].expense_id, projectId), actorId, projectRole);
}

async function updateExpense(projectId, expenseId, body, actorId, projectRole) {
  assertCanEdit(await getExpense(expenseId, projectId), actorId, projectRole);
  const v = normalize(body);
  const pool = await getPool();
  // Switching an entry to Company-paid drops any reimbursement mark.
  await pool.request()
    .input('id', sql.Int, expenseId).input('category', sql.NVarChar(50), v.category)
    .input('categoryOther', sql.NVarChar(100), v.categoryOther).input('description', sql.NVarChar(500), v.description)
    .input('expenseDate', sql.Date, v.expenseDate).input('amount', sql.Decimal(14, 2), v.amount)
    .input('paidBy', sql.NVarChar(10), v.paidBy)
    .query(`UPDATE pm_project_expenses SET category=@category, category_other=@categoryOther, description=@description,
              expense_date=@expenseDate, amount=@amount, paid_by=@paidBy,
              is_reimbursed = CASE WHEN @paidBy='Own' THEN is_reimbursed ELSE 0 END,
              reimbursed_by = CASE WHEN @paidBy='Own' THEN reimbursed_by ELSE NULL END,
              reimbursed_at = CASE WHEN @paidBy='Own' THEN reimbursed_at ELSE NULL END,
              updated_at=SYSDATETIMEOFFSET()
            WHERE expense_id=@id`);
  return decorate(await getExpense(expenseId, projectId), actorId, projectRole);
}

async function deleteExpense(projectId, expenseId, actorId, projectRole) {
  assertCanEdit(await getExpense(expenseId, projectId), actorId, projectRole);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, expenseId)
    .query(`UPDATE pm_project_expenses SET is_deleted=1, updated_at=SYSDATETIMEOFFSET() WHERE expense_id=@id`);
  return { deleted: true };
}

// Manager only (route-gated).
async function setReimbursed(projectId, expenseId, reimbursed, actorId, projectRole) {
  const existing = await getExpense(expenseId, projectId);
  if (existing.paidBy !== 'Own') throw httpError(400, 'Only own-money expenses can be reimbursed.');
  const pool = await getPool();
  await pool.request().input('id', sql.Int, expenseId).input('flag', sql.Bit, reimbursed ? 1 : 0)
    .input('actor', sql.UniqueIdentifier, actorId)
    .query(`UPDATE pm_project_expenses SET is_reimbursed=@flag,
              reimbursed_by = CASE WHEN @flag=1 THEN @actor ELSE NULL END,
              reimbursed_at = CASE WHEN @flag=1 THEN SYSDATETIMEOFFSET() ELSE NULL END
            WHERE expense_id=@id`);
  return decorate(await getExpense(expenseId, projectId), actorId, projectRole);
}

module.exports = { CATEGORIES, listExpenses, createExpense, updateExpense, deleteExpense, setReimbursed };
