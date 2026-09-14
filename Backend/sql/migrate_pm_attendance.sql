/* ============================================================================
   Migration: project Attendance.

   One row per (project, member, date). Members can check themselves in as
   'Present' for TODAY only; a project Manager/Owner or admin can set any
   member's status for any date (Present/Absent/Half Day/Leave), with an
   optional note. Only ADDS a new table — no existing table/column touched.
   Safe to re-run (idempotent).
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_attendance')
BEGIN
  CREATE TABLE dbo.pm_attendance (
    attendance_id   INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT NOT NULL,
    user_id         UNIQUEIDENTIFIER NOT NULL,
    attendance_date DATE NOT NULL,
    status          NVARCHAR(20) NOT NULL,
    note            NVARCHAR(300) NULL,
    marked_by       UNIQUEIDENTIFIER NOT NULL,
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_att_created DEFAULT (SYSDATETIMEOFFSET()),
    updated_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_att_updated DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT UQ_pm_attendance   UNIQUE (project_id, user_id, attendance_date),
    CONSTRAINT FK_pm_att_project  FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_att_user     FOREIGN KEY (user_id)    REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_pm_att_markedby FOREIGN KEY (marked_by)  REFERENCES dbo.auth_users(user_id),
    CONSTRAINT CK_pm_att_status   CHECK (status IN ('Present','Absent','Half Day','Leave'))
  );
  CREATE INDEX IX_pm_att_project_date ON dbo.pm_attendance(project_id, attendance_date);
  CREATE INDEX IX_pm_att_user        ON dbo.pm_attendance(user_id, attendance_date);
END

COMMIT TRAN;

SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_attendance')
            THEN 1 ELSE 0 END AS pm_attendance_present;
