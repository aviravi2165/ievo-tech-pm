'use strict';

/**
 * meetingAttendanceService — Meeting/Session-based Attendance.
 *
 * Replaces the old date-only pm_attendance model (still present, untouched —
 * see attendanceService.js) with one where every attendance record belongs
 * to a specific pm_meetings row (title + date), each with its own roster
 * (pm_meeting_members) so multiple meetings can exist on the same date.
 *
 * Two distinct write paths, per the spec:
 *   1. OFFICIAL attendance (pm_meeting_attendance) — only a project Manager
 *      (or admin) can set this directly, via markAttendance.
 *   2. SELF attendance CHANGE REQUESTS (pm_attendance_change_requests) — a
 *      Member submits one for their OWN row only; it does not touch the
 *      official record until a Manager approves it (decideChangeRequest).
 *
 * Role mapping reuses the existing pm_members role triad as-is (no new
 * role/table): Manager = full control, Member = view + self-request,
 * Viewer = read-only everywhere (this is the spec's "Project
 * Owner/Leadership" tier — Viewer already meant "read-only, project-wide"
 * before this feature existed, just wasn't used by the old Attendance tab).
 * Route-level requireRole() is what actually enforces this server-side;
 * this service still re-checks the few things that need to be more precise
 * than a flat role floor (e.g. "only the requester can cancel their own
 * pending request").
 */

const { getPool, sql, withTransaction } = require('../../../config/db');
const audit = require('./auditService');

const STATUSES = ['Present', 'Absent'];

function assertValidStatus(status) {
  if (!STATUSES.includes(status)) {
    const e = new Error(`Status must be one of: ${STATUSES.join(', ')}.`); e.statusCode = 400; throw e;
  }
}

// ── Meetings — list / create / detail / update / cancel ────────────────────

// `viewerRole` gates whether pendingRequestCount is computed per row (only a
// Manager acts on requests, so only a Manager needs the count — kept out of
// the payload entirely for Member/Viewer rather than just hidden by the UI).
async function listMeetings(projectId, viewerRole, { search, dateFrom, dateTo } = {}) {
  const pool = await getPool();
  const req = pool.request().input('projectId', sql.Int, projectId);
  let where = 'm.project_id = @projectId AND m.is_cancelled = 0';
  if (search && search.trim()) { req.input('search', sql.NVarChar(200), `%${search.trim()}%`); where += ' AND m.title LIKE @search'; }
  if (dateFrom) { req.input('dateFrom', sql.Date, dateFrom); where += ' AND m.meeting_date >= @dateFrom'; }
  if (dateTo)   { req.input('dateTo',   sql.Date, dateTo);   where += ' AND m.meeting_date <= @dateTo'; }

  const includePending = viewerRole === 'Manager';
  const r = await req.query(`
    SELECT m.meeting_id AS meetingId, m.title, m.meeting_date AS meetingDate, m.description,
           m.created_at AS createdAt,
           COALESCE(NULLIF(TRIM(CONCAT(cu.first_name,' ',cu.last_name)),''), cu.email) AS createdByName,
           (SELECT COUNT(*) FROM pm_meeting_members mm WHERE mm.meeting_id = m.meeting_id) AS totalMembers,
           (SELECT COUNT(*) FROM pm_meeting_attendance a WHERE a.meeting_id = m.meeting_id AND a.status = 'Present')  AS presentCount,
           (SELECT COUNT(*) FROM pm_meeting_attendance a WHERE a.meeting_id = m.meeting_id AND a.status = 'Absent')   AS absentCount
           ${includePending ? `,
           (SELECT COUNT(*) FROM pm_attendance_change_requests r WHERE r.meeting_id = m.meeting_id AND r.status = 'pending') AS pendingRequestCount` : ''}
    FROM pm_meetings m
    LEFT JOIN auth_users cu ON cu.user_id = m.created_by
    WHERE ${where}
    ORDER BY m.meeting_date DESC, m.meeting_id DESC
  `);
  return r.recordset;
}

async function assertMembersOfProject(projectId, userIds) {
  if (!userIds?.length) { const e = new Error('Select at least one project member.'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const reqCheck = pool.request().input('projectId', sql.Int, projectId);
  const placeholders = userIds.map((id, i) => { reqCheck.input(`u${i}`, sql.UniqueIdentifier, id); return `@u${i}`; }).join(',');
  const r = await reqCheck.query(`SELECT user_id AS userId FROM pm_members WHERE project_id=@projectId AND user_id IN (${placeholders})`);
  if (r.recordset.length !== new Set(userIds.map(String)).size) {
    const e = new Error('One or more selected users are not members of this project.'); e.statusCode = 400; throw e;
  }
}

async function createMeeting(projectId, { title, meetingDate, description, memberIds }, actorId) {
  if (!title?.trim()) { const e = new Error('Meeting title is required.'); e.statusCode = 400; throw e; }
  if (!meetingDate) { const e = new Error('Meeting date is required.'); e.statusCode = 400; throw e; }
  await assertMembersOfProject(projectId, memberIds);

  const meetingId = await withTransaction(async (req) => {
    const ins = await req()
      .input('projectId', sql.Int, projectId)
      .input('title', sql.NVarChar(200), title.trim())
      .input('date', sql.Date, meetingDate)
      .input('description', sql.NVarChar(1000), description?.trim() || null)
      .input('createdBy', sql.UniqueIdentifier, actorId)
      .query(`
        INSERT INTO pm_meetings (project_id, title, meeting_date, description, created_by)
        OUTPUT INSERTED.meeting_id AS meetingId
        VALUES (@projectId, @title, @date, @description, @createdBy)
      `);
    const id = ins.recordset[0].meetingId;
    for (const uid of memberIds) {
      await req().input('meetingId', sql.Int, id).input('userId', sql.UniqueIdentifier, uid)
        .query(`INSERT INTO pm_meeting_members (meeting_id, user_id) VALUES (@meetingId, @userId)`);
    }
    return id;
  });
  await audit.log({ entityType: 'meeting', entityId: meetingId, projectId, userId: actorId, action: 'meeting_created', newValue: title.trim() });
  return getMeetingDetail(meetingId, projectId, actorId, 'Manager');
}

async function getMeetingRow(meetingId, projectId) {
  const pool = await getPool();
  const r = await pool.request().input('meetingId', sql.Int, meetingId).input('projectId', sql.Int, projectId).query(`
    SELECT m.meeting_id AS meetingId, m.project_id AS projectId, m.title, m.meeting_date AS meetingDate,
           m.description, m.is_cancelled AS isCancelled, m.created_at AS createdAt,
           m.created_by AS createdById,
           COALESCE(NULLIF(TRIM(CONCAT(cu.first_name,' ',cu.last_name)),''), cu.email) AS createdByName
    FROM pm_meetings m
    LEFT JOIN auth_users cu ON cu.user_id = m.created_by
    WHERE m.meeting_id = @meetingId AND m.project_id = @projectId
  `);
  return r.recordset[0] || null;
}

// Full detail: meeting header, KPI summary, and every roster member's
// official status/remarks + (conditionally) their pending change request.
// `viewerId`/`viewerRole` decide per-row pending-request visibility: the
// member themselves always sees their own pending request; a Manager sees
// everyone's (so they can act on it); anyone else just doesn't get that
// field at all — same privacy shape as the existing date-change Approvals
// (only requester + approver/admin see the reason/detail there too).
async function getMeetingDetail(meetingId, projectId, viewerId, viewerRole) {
  const meeting = await getMeetingRow(meetingId, projectId);
  if (!meeting) { const e = new Error('Meeting not found.'); e.statusCode = 404; throw e; }

  const pool = await getPool();
  const membersR = await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT mm.user_id AS userId,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           a.status, a.remarks, a.updated_at AS updatedAt,
           a.marked_by AS markedById,
           COALESCE(NULLIF(TRIM(CONCAT(mu.first_name,' ',mu.last_name)),''), mu.email) AS markedByName
    FROM pm_meeting_members mm
    INNER JOIN auth_users u ON u.user_id = mm.user_id
    LEFT JOIN pm_meeting_attendance a ON a.meeting_id = mm.meeting_id AND a.user_id = mm.user_id
    LEFT JOIN auth_users mu ON mu.user_id = a.marked_by
    WHERE mm.meeting_id = @meetingId
    ORDER BY u.first_name, u.last_name
  `);

  const requestsR = await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT r.request_id AS requestId, r.user_id AS userId, r.requested_status AS requestedStatus,
           r.reason, r.status, r.decision_note AS decisionNote, r.decided_at AS decidedAt,
           r.created_at AS createdAt,
           COALESCE(NULLIF(TRIM(CONCAT(du.first_name,' ',du.last_name)),''), du.email) AS decidedByName
    FROM pm_attendance_change_requests r
    LEFT JOIN auth_users du ON du.user_id = r.decided_by
    WHERE r.meeting_id = @meetingId
    ORDER BY r.created_at DESC
  `);
  // Latest request per user (pending one if present, else most recent decided one).
  const latestByUser = new Map();
  for (const r of requestsR.recordset) {
    const key = String(r.userId);
    const existing = latestByUser.get(key);
    if (!existing || r.status === 'pending') { if (!existing || existing.status !== 'pending') latestByUser.set(key, r); }
  }

  const isManager = viewerRole === 'Manager';
  const members = membersR.recordset.map(m => {
    const req = latestByUser.get(String(m.userId));
    const canSeeRequest = req && (isManager || String(m.userId) === String(viewerId));
    return { ...m, pendingRequest: canSeeRequest ? req : (req && req.status === 'pending' ? { status: 'pending' } : null) };
  });

  const kpis = {
    total: members.length,
    present: members.filter(m => m.status === 'Present').length,
    absent: members.filter(m => m.status === 'Absent').length,
    notMarked: members.filter(m => !m.status).length,
  };

  return { meeting, kpis, members };
}

async function updateMeeting(meetingId, projectId, { title, meetingDate, description }, actorId) {
  const meeting = await getMeetingRow(meetingId, projectId);
  if (!meeting) { const e = new Error('Meeting not found.'); e.statusCode = 404; throw e; }
  if (!title?.trim()) { const e = new Error('Meeting title is required.'); e.statusCode = 400; throw e; }
  if (!meetingDate) { const e = new Error('Meeting date is required.'); e.statusCode = 400; throw e; }

  const pool = await getPool();
  await pool.request()
    .input('meetingId', sql.Int, meetingId)
    .input('title', sql.NVarChar(200), title.trim())
    .input('date', sql.Date, meetingDate)
    .input('description', sql.NVarChar(1000), description?.trim() || null)
    .query(`UPDATE pm_meetings SET title=@title, meeting_date=@date, description=@description, updated_at=SYSDATETIMEOFFSET() WHERE meeting_id=@meetingId`);
  await audit.log({ entityType: 'meeting', entityId: meetingId, projectId, userId: actorId, action: 'meeting_updated', oldValue: meeting.title, newValue: title.trim() });
  return getMeetingDetail(meetingId, projectId, actorId, 'Manager');
}

// Replace the roster with `memberIds` — adds new members, removes members no
// longer selected (cascading their attendance/request rows off via the FK).
async function updateMeetingMembers(meetingId, projectId, memberIds, actorId) {
  const meeting = await getMeetingRow(meetingId, projectId);
  if (!meeting) { const e = new Error('Meeting not found.'); e.statusCode = 404; throw e; }
  await assertMembersOfProject(projectId, memberIds);

  const pool = await getPool();
  const currentR = await pool.request().input('meetingId', sql.Int, meetingId).query(`SELECT user_id AS userId FROM pm_meeting_members WHERE meeting_id=@meetingId`);
  const current = new Set(currentR.recordset.map(r => String(r.userId)));
  const desired = new Set(memberIds.map(String));
  const toAdd = [...desired].filter(id => !current.has(id));
  const toRemove = [...current].filter(id => !desired.has(id));

  for (const uid of toAdd) {
    await pool.request().input('meetingId', sql.Int, meetingId).input('userId', sql.UniqueIdentifier, uid)
      .query(`INSERT INTO pm_meeting_members (meeting_id, user_id) VALUES (@meetingId, @userId)`);
  }
  for (const uid of toRemove) {
    await pool.request().input('meetingId', sql.Int, meetingId).input('userId', sql.UniqueIdentifier, uid)
      .query(`DELETE FROM pm_meeting_members WHERE meeting_id=@meetingId AND user_id=@userId`);
  }
  if (toAdd.length || toRemove.length) {
    await audit.log({ entityType: 'meeting', entityId: meetingId, projectId, userId: actorId, action: 'meeting_members_updated', newValue: `+${toAdd.length}/-${toRemove.length}` });
  }
  return getMeetingDetail(meetingId, projectId, actorId, 'Manager');
}

async function cancelMeeting(meetingId, projectId, actorId) {
  const meeting = await getMeetingRow(meetingId, projectId);
  if (!meeting) { const e = new Error('Meeting not found.'); e.statusCode = 404; throw e; }
  const pool = await getPool();
  await pool.request().input('meetingId', sql.Int, meetingId).input('actorId', sql.UniqueIdentifier, actorId)
    .query(`UPDATE pm_meetings SET is_cancelled=1, cancelled_by=@actorId, cancelled_at=SYSDATETIMEOFFSET(), updated_at=SYSDATETIMEOFFSET() WHERE meeting_id=@meetingId`);
  await audit.log({ entityType: 'meeting', entityId: meetingId, projectId, userId: actorId, action: 'meeting_cancelled', oldValue: meeting.title });
  return { cancelled: true };
}

// ── Official attendance — Manager/admin only (route-gated) ─────────────────
async function markAttendance(meetingId, projectId, targetUserId, status, remarks, actorId) {
  const meeting = await getMeetingRow(meetingId, projectId);
  if (!meeting) { const e = new Error('Meeting not found.'); e.statusCode = 404; throw e; }
  assertValidStatus(status);
  if (status === 'Absent' && !remarks?.trim()) {
    const e = new Error('A remark/reason is required when marking someone Absent.'); e.statusCode = 400; throw e;
  }
  const pool = await getPool();
  const rosterCheck = await pool.request().input('meetingId', sql.Int, meetingId).input('userId', sql.UniqueIdentifier, targetUserId)
    .query(`SELECT 1 AS ok FROM pm_meeting_members WHERE meeting_id=@meetingId AND user_id=@userId`);
  if (!rosterCheck.recordset.length) { const e = new Error('That user is not on this meeting\'s roster.'); e.statusCode = 400; throw e; }

  await pool.request()
    .input('meetingId', sql.Int, meetingId).input('userId', sql.UniqueIdentifier, targetUserId)
    .input('status', sql.NVarChar(20), status).input('remarks', sql.NVarChar(500), remarks?.trim() || null)
    .input('markedBy', sql.UniqueIdentifier, actorId)
    .query(`
      MERGE pm_meeting_attendance AS target
      USING (SELECT @meetingId AS meeting_id, @userId AS user_id) AS src
      ON (target.meeting_id = src.meeting_id AND target.user_id = src.user_id)
      WHEN MATCHED THEN UPDATE SET status=@status, remarks=@remarks, marked_by=@markedBy, updated_at=SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN INSERT (meeting_id, user_id, status, remarks, marked_by) VALUES (@meetingId, @userId, @status, @remarks, @markedBy);
    `);
  await audit.log({ entityType: 'meeting', entityId: meetingId, projectId, userId: actorId, action: 'attendance_marked', fieldChanged: 'status', newValue: status });
  return getMeetingDetail(meetingId, projectId, actorId, 'Manager');
}

// ── Self attendance change requests ─────────────────────────────────────────

// Member submits a request for THEIR OWN row only — requestedBy is always
// taken from the authenticated session (req.user.userId), never a body
// param, so a member can never submit on behalf of anyone else.
async function createChangeRequest(meetingId, projectId, requestedBy, requestedStatus, reason) {
  const meeting = await getMeetingRow(meetingId, projectId);
  if (!meeting) { const e = new Error('Meeting not found.'); e.statusCode = 404; throw e; }
  assertValidStatus(requestedStatus);
  if (!reason?.trim()) { const e = new Error('A reason is required.'); e.statusCode = 400; throw e; }

  const pool = await getPool();
  const rosterCheck = await pool.request().input('meetingId', sql.Int, meetingId).input('userId', sql.UniqueIdentifier, requestedBy)
    .query(`SELECT 1 AS ok FROM pm_meeting_members WHERE meeting_id=@meetingId AND user_id=@userId`);
  if (!rosterCheck.recordset.length) { const e = new Error('You are not on this meeting\'s roster.'); e.statusCode = 403; throw e; }

  try {
    const ins = await pool.request()
      .input('meetingId', sql.Int, meetingId).input('projectId', sql.Int, projectId)
      .input('userId', sql.UniqueIdentifier, requestedBy)
      .input('requestedStatus', sql.NVarChar(20), requestedStatus)
      .input('reason', sql.NVarChar(500), reason.trim())
      .query(`
        INSERT INTO pm_attendance_change_requests (meeting_id, project_id, user_id, requested_status, reason)
        OUTPUT INSERTED.request_id AS requestId
        VALUES (@meetingId, @projectId, @userId, @requestedStatus, @reason)
      `);
    await audit.log({ entityType: 'meeting', entityId: meetingId, projectId, userId: requestedBy, action: 'attendance_change_requested', newValue: requestedStatus });
    return { requestId: ins.recordset[0].requestId };
  } catch (err) {
    // Filtered unique index UQ_pm_acr_one_pending — a pending request already exists.
    if (err.number === 2601 || err.number === 2627) {
      const e = new Error('You already have a pending request for this meeting. Wait for it to be decided before submitting another.');
      e.statusCode = 409; throw e;
    }
    throw err;
  }
}

async function getChangeRequestById(requestId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, requestId).query(`
    SELECT r.request_id AS requestId, r.meeting_id AS meetingId, r.project_id AS projectId, r.user_id AS userId,
           r.requested_status AS requestedStatus, r.reason, r.status, r.decision_note AS decisionNote,
           r.decided_by AS decidedById, r.decided_at AS decidedAt, r.created_at AS createdAt
    FROM pm_attendance_change_requests r WHERE r.request_id = @id
  `);
  return r.recordset[0] || null;
}

// Manager (or admin) approves or rejects. Approving APPLIES the requested
// status to the official record (marked_by = the approving Manager, remarks
// set to the request's own reason so the mandatory-remarks-on-Absent rule
// stays satisfied automatically) and records who/when. Rejecting leaves the
// official record untouched; the reason for rejection is stored as
// decision_note. Managers can never decide their own request (they'd have
// no reason to submit one — they can just mark directly — but this is
// blocked explicitly anyway, matching the spec).
async function decideChangeRequest(requestId, projectId, actorId, action, note) {
  const request = await getChangeRequestById(requestId);
  if (!request || String(request.projectId) !== String(projectId)) { const e = new Error('Request not found.'); e.statusCode = 404; throw e; }
  if (request.status !== 'pending') { const e = new Error('This request has already been decided.'); e.statusCode = 409; throw e; }
  if (String(request.userId) === String(actorId)) { const e = new Error('You cannot approve or reject your own request.'); e.statusCode = 403; throw e; }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const pool = await getPool();

  if (action === 'approve') {
    await pool.request()
      .input('meetingId', sql.Int, request.meetingId).input('userId', sql.UniqueIdentifier, request.userId)
      .input('status', sql.NVarChar(20), request.requestedStatus).input('remarks', sql.NVarChar(500), request.reason)
      .input('markedBy', sql.UniqueIdentifier, actorId)
      .query(`
        MERGE pm_meeting_attendance AS target
        USING (SELECT @meetingId AS meeting_id, @userId AS user_id) AS src
        ON (target.meeting_id = src.meeting_id AND target.user_id = src.user_id)
        WHEN MATCHED THEN UPDATE SET status=@status, remarks=@remarks, marked_by=@markedBy, updated_at=SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN INSERT (meeting_id, user_id, status, remarks, marked_by) VALUES (@meetingId, @userId, @status, @remarks, @markedBy);
      `);
    await audit.log({ entityType: 'meeting', entityId: request.meetingId, projectId, userId: actorId, action: 'attendance_change_approved', newValue: request.requestedStatus });
  } else {
    await audit.log({ entityType: 'meeting', entityId: request.meetingId, projectId, userId: actorId, action: 'attendance_change_rejected', newValue: request.requestedStatus });
  }

  await pool.request().input('id', sql.Int, requestId).input('status', sql.NVarChar(20), newStatus)
    .input('decidedBy', sql.UniqueIdentifier, actorId).input('note', sql.NVarChar(500), note?.trim() || null)
    .query(`UPDATE pm_attendance_change_requests SET status=@status, decided_by=@decidedBy, decided_at=SYSDATETIMEOFFSET(), decision_note=@note WHERE request_id=@id`);

  return getMeetingDetail(request.meetingId, projectId, actorId, 'Manager');
}

// Requester withdraws their own still-pending request.
async function cancelChangeRequest(requestId, projectId, actorId) {
  const request = await getChangeRequestById(requestId);
  if (!request || String(request.projectId) !== String(projectId)) { const e = new Error('Request not found.'); e.statusCode = 404; throw e; }
  if (String(request.userId) !== String(actorId)) { const e = new Error('Only the requester can cancel this.'); e.statusCode = 403; throw e; }
  if (request.status !== 'pending') { const e = new Error('This request has already been decided.'); e.statusCode = 409; throw e; }
  const pool = await getPool();
  await pool.request().input('id', sql.Int, requestId).query(`DELETE FROM pm_attendance_change_requests WHERE request_id=@id`);
  return { cancelled: true };
}

module.exports = {
  STATUSES, listMeetings, createMeeting, getMeetingDetail, updateMeeting, updateMeetingMembers, cancelMeeting,
  markAttendance, createChangeRequest, decideChangeRequest, cancelChangeRequest,
};
