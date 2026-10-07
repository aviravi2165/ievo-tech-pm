'use strict';

/**
 * budgetService — project expenses (the Budget tab).
 *
 * Any project Member+ records an expense: category (or "Other" + free text,
 * max 20 chars), date, amount, who paid — the Company, or the person's Own
 * money — and at least one invoice file (PDF or image). Travel expenses also
 * carry the mode (Car/Train/Flight) and From/To.
 *
 * Visibility: a Manager (or admin) sees every expense on the project; anyone
 * else sees — and gets KPI totals for — only the expenses they added. The
 * same rule gates invoice downloads.
 * Edit/delete: the entry's creator, or a Manager.
 * Reimbursed: own-money entries only; the creator marks the ones they were
 * paid back for (one or many at once), and a Manager can mark any.
 */

const fs = require('fs');
const path = require('path');
const { getPool, sql, withTransaction } = require('../../../config/db');
const { STORAGE_ROOT } = require('../../../middleware/upload');

const CATEGORIES = ['Travel', 'Food', 'Accommodation', 'Local Conveyance', 'Materials', 'Printing & Stationery', 'Software / Subscription', 'Other'];
const PAID_BY = ['Company', 'Own'];
const TRAVEL_MODES = ['Car', 'Train', 'Flight'];
const OTHER_MAX = 20;
const PLACE_MAX = 100;
const MAX_INVOICES = 5;

function httpError(status, message) { const e = new Error(message); e.statusCode = status; return e; }

function normalize({ category, categoryOther, description, expenseDate, amount, paidBy, travelMode, travelFrom, travelTo }) {
  if (!CATEGORIES.includes(category)) throw httpError(400, 'Pick a category.');
  const other = (categoryOther || '').trim();
  if (category === 'Other' && !other) throw httpError(400, 'Describe the "Other" category.');
  if (category === 'Other' && other.length > OTHER_MAX) throw httpError(400, `Other category can be at most ${OTHER_MAX} characters.`);
  let travel = { travelMode: null, travelFrom: null, travelTo: null };
  if (category === 'Travel') {
    if (!TRAVEL_MODES.includes(travelMode)) throw httpError(400, 'Choose the travel mode: Car, Train or Flight.');
    const from = (travelFrom || '').trim();
    const to = (travelTo || '').trim();
    if (!from || !to) throw httpError(400, 'Enter where the travel was From and To.');
    if (from.length > PLACE_MAX || to.length > PLACE_MAX) throw httpError(400, `From / To can be at most ${PLACE_MAX} characters.`);
    travel = { travelMode, travelFrom: from, travelTo: to };
  }
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
    expenseDate: date, amount: Math.round(amt * 100) / 100, paidBy, ...travel,
  };
}

// ── Invoice files ─────────────────────────────────────────────────────────
const isInvoiceType = (f) => f.mimetype === 'application/pdf' || /^image\//.test(f.mimetype || '');

function removeUploaded(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
}

function removeStored(relativePaths) {
  const root = path.resolve(STORAGE_ROOT);
  for (const rel of relativePaths) {
    const full = path.resolve(root, rel);
    if (full.startsWith(root)) { try { fs.unlinkSync(full); } catch { /* already gone */ } }
  }
}

function assertInvoiceFiles(files) {
  const bad = (files || []).filter(f => !isInvoiceType(f));
  if (bad.length) throw httpError(400, `Invoice must be a PDF or an image (${bad.map(f => f.originalname).join(', ')} is not).`);
}

async function insertFiles(req, expenseId, files, actorId) {
  for (const f of files) {
    await req().input('expenseId', sql.Int, expenseId)
      .input('originalName', sql.NVarChar(260), f.originalname.slice(0, 260))
      .input('storedName', sql.NVarChar(100), f.filename)
      .input('storagePath', sql.NVarChar(500), path.relative(STORAGE_ROOT, f.path))
      .input('mimeType', sql.NVarChar(150), f.mimetype || null)
      .input('fileSize', sql.BigInt, f.size)
      .input('uploadedBy', sql.UniqueIdentifier, actorId)
      .query(`INSERT INTO pm_project_expense_files (expense_id, original_name, stored_name, storage_path, mime_type, file_size, uploaded_by)
              VALUES (@expenseId, @originalName, @storedName, @storagePath, @mimeType, @fileSize, @uploadedBy)`);
  }
}

async function getFilesFor(expenseIds) {
  const map = new Map();
  if (!expenseIds.length) return map;
  const pool = await getPool();
  const req = pool.request();
  const params = expenseIds.map((id, i) => { req.input(`e${i}`, sql.Int, id); return `@e${i}`; });
  const r = await req.query(`
    SELECT file_id AS fileId, expense_id AS expenseId, original_name AS originalName, mime_type AS mimeType, file_size AS fileSize
    FROM pm_project_expense_files WHERE expense_id IN (${params.join(',')}) ORDER BY file_id`);
  for (const f of r.recordset) {
    if (!map.has(f.expenseId)) map.set(f.expenseId, []);
    map.get(f.expenseId).push({ ...f, fileSize: Number(f.fileSize) });
  }
  return map;
}

// Multipart forms send arrays as a JSON string (or a repeated field).
function parseIdList(v) {
  if (v === undefined || v === null || v === '') return [];
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { arr = v.split(','); } }
  if (!Array.isArray(arr)) arr = [arr];
  return [...new Set(arr.map(Number).filter(Number.isInteger))];
}

// ── Expenses ──────────────────────────────────────────────────────────────
const SELECT = `
  SELECT e.expense_id AS expenseId, e.category, e.category_other AS categoryOther, e.description,
         CONVERT(varchar(10), e.expense_date, 23) AS expenseDate, e.amount, e.paid_by AS paidBy,
         e.travel_mode AS travelMode, e.travel_from AS travelFrom, e.travel_to AS travelTo,
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

const isOwner = (expense, userId) => String(expense.createdById) === String(userId);

function decorate(row, viewerId, projectRole, files = []) {
  const mine = isOwner(row, viewerId);
  const canEdit = mine || projectRole === 'Manager';
  return {
    ...row, amount: Number(row.amount), invoices: files,
    canEdit, canReimburse: row.paidBy === 'Own' && canEdit,
  };
}

async function getDecorated(expenseId, projectId, viewerId, projectRole) {
  const row = await getExpense(expenseId, projectId);
  const files = await getFilesFor([row.expenseId]);
  return decorate(row, viewerId, projectRole, files.get(row.expenseId) || []);
}

function assertCanEdit(expense, actorId, projectRole) {
  if (projectRole !== 'Manager' && !isOwner(expense, actorId)) {
    throw httpError(403, 'You can only change expenses you added.');
  }
}

async function listExpenses(projectId, viewerId, projectRole) {
  const isManager = projectRole === 'Manager';
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).input('viewerId', sql.UniqueIdentifier, viewerId)
    .query(`${SELECT} WHERE e.project_id=@projectId AND e.is_deleted=0
            ${isManager ? '' : 'AND e.created_by=@viewerId'}
            ORDER BY e.expense_date DESC, e.expense_id DESC`);
  const files = await getFilesFor(r.recordset.map(x => x.expenseId));
  const items = r.recordset.map(row => decorate(row, viewerId, projectRole, files.get(row.expenseId) || []));
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
    travelModes: TRAVEL_MODES,
    otherMax: OTHER_MAX,
    maxInvoices: MAX_INVOICES,
    scope: isManager ? 'project' : 'mine',
    canAdd: isManager || projectRole === 'Member',
    canManage: isManager,
  };
}

async function createExpense(projectId, body, files, actorId, projectRole) {
  try {
    const v = normalize(body);
    if (!files || !files.length) throw httpError(400, 'Attach the invoice (PDF or image) — it is required.');
    if (files.length > MAX_INVOICES) throw httpError(400, `At most ${MAX_INVOICES} invoice files per expense.`);
    assertInvoiceFiles(files);

    let expenseId;
    await withTransaction(async (req) => {
      const r = await req()
        .input('projectId', sql.Int, projectId).input('category', sql.NVarChar(50), v.category)
        .input('categoryOther', sql.NVarChar(100), v.categoryOther).input('description', sql.NVarChar(500), v.description)
        .input('expenseDate', sql.Date, v.expenseDate).input('amount', sql.Decimal(14, 2), v.amount)
        .input('paidBy', sql.NVarChar(10), v.paidBy).input('createdBy', sql.UniqueIdentifier, actorId)
        .input('travelMode', sql.NVarChar(10), v.travelMode).input('travelFrom', sql.NVarChar(100), v.travelFrom).input('travelTo', sql.NVarChar(100), v.travelTo)
        .query(`INSERT INTO pm_project_expenses (project_id, category, category_other, description, expense_date, amount, paid_by, created_by, travel_mode, travel_from, travel_to)
                OUTPUT INSERTED.expense_id
                VALUES (@projectId, @category, @categoryOther, @description, @expenseDate, @amount, @paidBy, @createdBy, @travelMode, @travelFrom, @travelTo)`);
      expenseId = r.recordset[0].expense_id;
      await insertFiles(req, expenseId, files, actorId);
    });
    return getDecorated(expenseId, projectId, actorId, projectRole);
  } catch (e) {
    removeUploaded(files);
    throw e;
  }
}

async function updateExpense(projectId, expenseId, body, files, actorId, projectRole) {
  let removedPaths = [];
  try {
    assertCanEdit(await getExpense(expenseId, projectId), actorId, projectRole);
    const v = normalize(body);
    assertInvoiceFiles(files);
    const removeIds = parseIdList(body.removeFileIds);

    const pool = await getPool();
    const existing = (await pool.request().input('id', sql.Int, expenseId)
      .query(`SELECT file_id AS fileId, storage_path AS storagePath FROM pm_project_expense_files WHERE expense_id=@id`)).recordset;
    const toRemove = existing.filter(f => removeIds.includes(f.fileId));
    const remaining = existing.length - toRemove.length + (files || []).length;
    if (remaining < 1) throw httpError(400, 'An expense must keep at least one invoice.');
    if (remaining > MAX_INVOICES) throw httpError(400, `At most ${MAX_INVOICES} invoice files per expense.`);

    await withTransaction(async (req) => {
      // Switching an entry to Company-paid drops any reimbursement mark.
      await req()
        .input('id', sql.Int, expenseId).input('category', sql.NVarChar(50), v.category)
        .input('categoryOther', sql.NVarChar(100), v.categoryOther).input('description', sql.NVarChar(500), v.description)
        .input('expenseDate', sql.Date, v.expenseDate).input('amount', sql.Decimal(14, 2), v.amount)
        .input('paidBy', sql.NVarChar(10), v.paidBy)
        .input('travelMode', sql.NVarChar(10), v.travelMode).input('travelFrom', sql.NVarChar(100), v.travelFrom).input('travelTo', sql.NVarChar(100), v.travelTo)
        .query(`UPDATE pm_project_expenses SET category=@category, category_other=@categoryOther, description=@description,
                  expense_date=@expenseDate, amount=@amount, paid_by=@paidBy,
                  travel_mode=@travelMode, travel_from=@travelFrom, travel_to=@travelTo,
                  is_reimbursed = CASE WHEN @paidBy='Own' THEN is_reimbursed ELSE 0 END,
                  reimbursed_by = CASE WHEN @paidBy='Own' THEN reimbursed_by ELSE NULL END,
                  reimbursed_at = CASE WHEN @paidBy='Own' THEN reimbursed_at ELSE NULL END,
                  updated_at=SYSDATETIMEOFFSET()
                WHERE expense_id=@id`);
      for (const f of toRemove) {
        await req().input('fileId', sql.Int, f.fileId).input('id', sql.Int, expenseId)
          .query(`DELETE FROM pm_project_expense_files WHERE file_id=@fileId AND expense_id=@id`);
      }
      if (files && files.length) await insertFiles(req, expenseId, files, actorId);
    });
    removedPaths = toRemove.map(f => f.storagePath);
  } catch (e) {
    removeUploaded(files);
    throw e;
  }
  removeStored(removedPaths);
  return getDecorated(expenseId, projectId, actorId, projectRole);
}

async function deleteExpense(projectId, expenseId, actorId, projectRole) {
  assertCanEdit(await getExpense(expenseId, projectId), actorId, projectRole);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, expenseId)
    .query(`UPDATE pm_project_expenses SET is_deleted=1, updated_at=SYSDATETIMEOFFSET() WHERE expense_id=@id`);
  return { deleted: true };
}

async function applyReimbursed(req, expenseIds, reimbursed, actorId) {
  for (const id of expenseIds) {
    await req().input('id', sql.Int, id).input('flag', sql.Bit, reimbursed ? 1 : 0)
      .input('actor', sql.UniqueIdentifier, actorId)
      .query(`UPDATE pm_project_expenses SET is_reimbursed=@flag,
                reimbursed_by = CASE WHEN @flag=1 THEN @actor ELSE NULL END,
                reimbursed_at = CASE WHEN @flag=1 THEN SYSDATETIMEOFFSET() ELSE NULL END
              WHERE expense_id=@id`);
  }
}

// Creator or Manager — mark/unmark one own-money expense.
async function setReimbursed(projectId, expenseId, reimbursed, actorId, projectRole) {
  const existing = await getExpense(expenseId, projectId);
  assertCanEdit(existing, actorId, projectRole);
  if (existing.paidBy !== 'Own') throw httpError(400, 'Only own-money expenses can be reimbursed.');
  await withTransaction(req => applyReimbursed(req, [existing.expenseId], reimbursed, actorId));
  return getDecorated(expenseId, projectId, actorId, projectRole);
}

// Creator (their own) or Manager (any) — mark several pending own-money
// expenses reimbursed at once. All-or-nothing: one invalid id rejects the lot.
async function bulkReimburse(projectId, expenseIdsRaw, actorId, projectRole) {
  const ids = parseIdList(expenseIdsRaw);
  if (!ids.length) throw httpError(400, 'Select at least one expense.');
  const rows = [];
  for (const id of ids) {
    const e = await getExpense(id, projectId);
    assertCanEdit(e, actorId, projectRole);
    if (e.paidBy !== 'Own') throw httpError(400, 'Only own-money expenses can be reimbursed.');
    if (e.isReimbursed) throw httpError(409, 'One of the selected expenses is already reimbursed. Refresh and try again.');
    rows.push(e);
  }
  await withTransaction(req => applyReimbursed(req, rows.map(r => r.expenseId), true, actorId));
  return { reimbursed: rows.length, amount: Math.round(rows.reduce((t, r) => t + Number(r.amount), 0) * 100) / 100 };
}

// Invoice download — same visibility as the expense itself.
async function getInvoiceForDownload(projectId, expenseId, fileId, viewerId, projectRole) {
  const expense = await getExpense(expenseId, projectId);
  if (projectRole !== 'Manager' && !isOwner(expense, viewerId)) throw httpError(404, 'Expense not found.');
  const pool = await getPool();
  const r = await pool.request().input('fileId', sql.Int, fileId).input('id', sql.Int, expenseId)
    .query(`SELECT original_name AS originalName, storage_path AS storagePath FROM pm_project_expense_files WHERE file_id=@fileId AND expense_id=@id`);
  const f = r.recordset[0];
  if (!f) throw httpError(404, 'Invoice not found.');
  const root = path.resolve(STORAGE_ROOT);
  const full = path.resolve(root, f.storagePath);
  if (!full.startsWith(root)) throw httpError(400, 'Invalid file path.');
  if (!fs.existsSync(full)) throw httpError(404, 'Invoice file is missing on the server.');
  return { originalName: f.originalName, fullPath: full };
}

module.exports = {
  CATEGORIES, listExpenses, createExpense, updateExpense, deleteExpense,
  setReimbursed, bulkReimburse, getInvoiceForDownload,
};
