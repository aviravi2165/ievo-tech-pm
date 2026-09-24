/* ============================================================================
   Migration: Meeting/Session-based Attendance.

   Replaces the date-first pm_attendance model (still present, untouched —
   see migrate_pm_attendance.sql) with a meeting-based one: every attendance
   record now belongs to a specific pm_meetings row (title + date), not just
   a bare date, so multiple meetings can exist on the same day and each has
   its own roster and KPI summary.

   4 new tables, additive only — no existing table/column touched, and the
   old pm_attendance table/data is left completely intact for history.
   Safe to re-run (idempotent).
   ============================================================================ */
SET NOCOUNT ON;
-- Required by SQL Server for the filtered index below (UQ_pm_acr_one_pending).
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;

-- ── Meetings ────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_meetings')
BEGIN
  CREATE TABLE dbo.pm_meetings (
    meeting_id    INT IDENTITY(1,1) PRIMARY KEY,
    project_id    INT NOT NULL,
    title         NVARCHAR(200) NOT NULL,
    meeting_date  DATE NOT NULL,
    description   NVARCHAR(1000) NULL,
    created_by    UNIQUEIDENTIFIER NOT NULL,
    is_cancelled  BIT NOT NULL CONSTRAINT DF_pm_meet_cancelled DEFAULT (0),
    cancelled_by  UNIQUEIDENTIFIER NULL,
    cancelled_at  DATETIMEOFFSET NULL,
    created_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_meet_created DEFAULT (SYSDATETIMEOFFSET()),
    updated_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_meet_updated DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT FK_pm_meet_project  FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_meet_creator  FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id)
  );
  CREATE INDEX IX_pm_meet_project_date ON dbo.pm_meetings(project_id, meeting_date DESC);
END

-- ── Meeting roster — who's expected at THIS meeting (Manager can add/remove) ──
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_meeting_members')
BEGIN
  CREATE TABLE dbo.pm_meeting_members (
    meeting_id  INT NOT NULL,
    user_id     UNIQUEIDENTIFIER NOT NULL,
    added_at    DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_mm_added DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT PK_pm_meeting_members PRIMARY KEY (meeting_id, user_id),
    CONSTRAINT FK_pm_mm_meeting FOREIGN KEY (meeting_id) REFERENCES dbo.pm_meetings(meeting_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_mm_user    FOREIGN KEY (user_id)    REFERENCES dbo.auth_users(user_id)
  );
END

-- ── Official attendance — one row per (meeting, member); no row = Not Marked ──
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_meeting_attendance')
BEGIN
  CREATE TABLE dbo.pm_meeting_attendance (
    attendance_id  INT IDENTITY(1,1) PRIMARY KEY,
    meeting_id     INT NOT NULL,
    user_id        UNIQUEIDENTIFIER NOT NULL,
    status         NVARCHAR(20) NOT NULL,
    remarks        NVARCHAR(500) NULL,
    marked_by      UNIQUEIDENTIFIER NOT NULL,
    created_at     DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_ma_created DEFAULT (SYSDATETIMEOFFSET()),
    updated_at     DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_ma_updated DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT UQ_pm_meeting_attendance UNIQUE (meeting_id, user_id),
    CONSTRAINT FK_pm_ma_member   FOREIGN KEY (meeting_id, user_id) REFERENCES dbo.pm_meeting_members(meeting_id, user_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_ma_markedby FOREIGN KEY (marked_by) REFERENCES dbo.auth_users(user_id),
    CONSTRAINT CK_pm_ma_status   CHECK (status IN ('Present','Absent','Half Day'))
  );
  CREATE INDEX IX_pm_ma_meeting ON dbo.pm_meeting_attendance(meeting_id);
  CREATE INDEX IX_pm_ma_user    ON dbo.pm_meeting_attendance(user_id);
END

-- ── Self attendance change requests — routed to the project's Manager(s) ──────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_attendance_change_requests')
BEGIN
  CREATE TABLE dbo.pm_attendance_change_requests (
    request_id        INT IDENTITY(1,1) PRIMARY KEY,
    meeting_id         INT NOT NULL,
    project_id         INT NOT NULL,
    user_id             UNIQUEIDENTIFIER NOT NULL,
    requested_status    NVARCHAR(20) NOT NULL,
    reason              NVARCHAR(500) NOT NULL,
    status              NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_acr_status DEFAULT ('pending'),
    decision_note       NVARCHAR(500) NULL,
    decided_by          UNIQUEIDENTIFIER NULL,
    decided_at          DATETIMEOFFSET NULL,
    created_at          DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_acr_created DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT FK_pm_acr_member    FOREIGN KEY (meeting_id, user_id) REFERENCES dbo.pm_meeting_members(meeting_id, user_id) ON DELETE CASCADE,
    -- No ON DELETE CASCADE here (SQL Server rejects it — "multiple cascade
    -- paths" — since project_id is already reachable via meeting_id →
    -- pm_meeting_members → pm_meetings → pm_projects). That path already
    -- cleans these rows up when a project is deleted; this FK is just for
    -- referential integrity.
    CONSTRAINT FK_pm_acr_project   FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id),
    CONSTRAINT FK_pm_acr_decidedby FOREIGN KEY (decided_by) REFERENCES dbo.auth_users(user_id),
    CONSTRAINT CK_pm_acr_status    CHECK (status IN ('pending','approved','rejected')),
    CONSTRAINT CK_pm_acr_reqstatus CHECK (requested_status IN ('Present','Absent','Half Day'))
  );
  CREATE INDEX IX_pm_acr_meeting ON dbo.pm_attendance_change_requests(meeting_id, status);
  CREATE INDEX IX_pm_acr_project ON dbo.pm_attendance_change_requests(project_id, status);
  -- Only one PENDING request per (meeting, user) at a time — a resolved
  -- (approved/rejected) one doesn't block a fresh request.
  CREATE UNIQUE INDEX UQ_pm_acr_one_pending ON dbo.pm_attendance_change_requests(meeting_id, user_id)
    WHERE status = 'pending';
END

-- ── Widen pm_audit_log's entity_type CHECK to also allow 'meeting' ──────────
-- The audit trail for meeting/attendance actions (meeting_created,
-- attendance_marked, attendance_change_requested/approved/rejected, etc.)
-- reuses the existing pm_audit_log table/auditService.log rather than a new
-- one — but its CHECK constraint only allowed task/activity/phase/project.
-- Guarded so re-running this migration after the constraint is already
-- widened is a no-op.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_audit_log_entity_type')
BEGIN
  DECLARE @ck_def NVARCHAR(MAX) = (SELECT definition FROM sys.check_constraints WHERE name = 'CK_pm_audit_log_entity_type');
  IF @ck_def NOT LIKE '%''meeting''%'
  BEGIN
    ALTER TABLE dbo.pm_audit_log DROP CONSTRAINT CK_pm_audit_log_entity_type;
    ALTER TABLE dbo.pm_audit_log WITH CHECK ADD CONSTRAINT CK_pm_audit_log_entity_type
      CHECK (entity_type IN ('task','activity','phase','project','meeting'));
  END
END

COMMIT TRAN;

-- Verify
SELECT
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name='pm_meetings') THEN 1 ELSE 0 END)                     AS pm_meetings_present,
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name='pm_meeting_members') THEN 1 ELSE 0 END)              AS pm_meeting_members_present,
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name='pm_meeting_attendance') THEN 1 ELSE 0 END)           AS pm_meeting_attendance_present,
  (SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name='pm_attendance_change_requests') THEN 1 ELSE 0 END)   AS pm_attendance_change_requests_present;
