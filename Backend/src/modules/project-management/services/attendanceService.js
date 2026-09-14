'use strict';

/**
 * attendanceService — a project's daily Attendance.
 *
 * One row per (project, member, date) in pm_attendance. A member can check
 * themselves in as 'Present' for TODAY only (self-service); a project
 * Manager/Owner (or admin — same "canEdit" bypass used everywhere else in
 * this module) can set ANY member's status for ANY date, with a note.
 * Members with no row yet for a given date just read as unmarked, not an
 * error — getForDate LEFT JOINs every project member against that date.
 */

const { getPool, sql } = require('../../../config/db');

const STATUSES = ['Present', 'Absent', 'Half Day', 'Leave'];
const todayStr = () => new Date().toISOString().slice(0, 10);

async function isProjectMember(projectId, userId) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT 1 AS ok FROM pm_members WHERE project_id=@projectId AND user_id=@userId`);
  return r.recordset.length > 0;
}

// Every project member's attendance status for one date — members with no
// row yet come back with status:null (unmarked), not omitted.
async function getForDate(projectId, date) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).input('date', sql.Date, date).query(`
    SELECT m.user_id AS userId,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           m.role AS projectRole,
           a.status, a.note,
           a.marked_by AS markedById,
           COALESCE(NULLIF(TRIM(CONCAT(mu.first_name,' ',mu.last_name)),''), mu.email) AS markedByName,
           a.updated_at AS updatedAt
    FROM pm_members m
    INNER JOIN auth_users u ON u.user_id = m.user_id AND u.is_active = 1
    LEFT JOIN pm_attendance a ON a.project_id = m.project_id AND a.user_id = m.user_id AND a.attendance_date = @date
    LEFT JOIN auth_users mu ON mu.user_id = a.marked_by
    WHERE m.project_id = @projectId
    ORDER BY u.first_name, u.last_name
  `);
  return r.recordset;
}

async function upsert(projectId, targetUserId, date, status, note, markedBy) {
  if (!STATUSES.includes(status)) { const e = new Error('Invalid attendance status.'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('userId',    sql.UniqueIdentifier, targetUserId)
    .input('date',       sql.Date, date)
    .input('status',     sql.NVarChar(20), status)
    .input('note',       sql.NVarChar(300), note || null)
    .input('markedBy',   sql.UniqueIdentifier, markedBy)
    .query(`
      MERGE pm_attendance AS target
      USING (SELECT @projectId AS project_id, @userId AS user_id, @date AS attendance_date) AS src
      ON (target.project_id = src.project_id AND target.user_id = src.user_id AND target.attendance_date = src.attendance_date)
      WHEN MATCHED THEN UPDATE SET status=@status, note=@note, marked_by=@markedBy, updated_at=SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN INSERT (project_id, user_id, attendance_date, status, note, marked_by)
        VALUES (@projectId, @userId, @date, @status, @note, @markedBy);
    `);
}

// Self check-in — always today's date, regardless of what the client sends,
// so nobody can back/post-date their own attendance.
async function checkIn(projectId, userId, status = 'Present', note) {
  if (!(await isProjectMember(projectId, userId))) {
    const e = new Error('You are not a member of this project.'); e.statusCode = 403; throw e;
  }
  await upsert(projectId, userId, todayStr(), status, note, userId);
  return getForDate(projectId, todayStr());
}

// Manager/admin override — any member, any date.
async function setStatus(projectId, targetUserId, date, status, note, actorUserId) {
  if (!(await isProjectMember(projectId, targetUserId))) {
    const e = new Error('That user is not a member of this project.'); e.statusCode = 400; throw e;
  }
  await upsert(projectId, targetUserId, date, status, note, actorUserId);
  return getForDate(projectId, date);
}

// Per-member counts of each status within a calendar month ('YYYY-MM') —
// the Attendance tab's "This month" summary strip.
async function getMonthSummary(projectId, yearMonth) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).input('ym', sql.Char(7), yearMonth).query(`
    SELECT m.user_id AS userId,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           SUM(CASE WHEN a.status='Present'  THEN 1 ELSE 0 END) AS presentDays,
           SUM(CASE WHEN a.status='Absent'   THEN 1 ELSE 0 END) AS absentDays,
           SUM(CASE WHEN a.status='Half Day' THEN 1 ELSE 0 END) AS halfDays,
           SUM(CASE WHEN a.status='Leave'    THEN 1 ELSE 0 END) AS leaveDays,
           COUNT(a.attendance_id) AS markedDays
    FROM pm_members m
    INNER JOIN auth_users u ON u.user_id = m.user_id AND u.is_active = 1
    LEFT JOIN pm_attendance a ON a.project_id = m.project_id AND a.user_id = m.user_id
      AND FORMAT(a.attendance_date, 'yyyy-MM') = @ym
    WHERE m.project_id = @projectId
    GROUP BY m.user_id, u.first_name, u.last_name, u.email
    ORDER BY u.first_name, u.last_name
  `);
  return r.recordset;
}

module.exports = { STATUSES, getForDate, checkIn, setStatus, getMonthSummary };
