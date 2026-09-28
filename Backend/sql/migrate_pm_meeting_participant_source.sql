/* ============================================================================
   Migration: Meeting-only participants (Project Participant vs Guest).

   Adds one column — pm_meeting_members.source — distinguishing:
     'project' — a current project member added to this meeting (the
                  existing Add/Edit Meeting roster picker's only source).
     'guest'   — any other active, non-admin system user added to THIS
                  meeting only, via the new "+ Add Guest Participant"
                  control. Never touches pm_members (project membership).

   Existing rows all backfill to 'project' automatically (they were all
   added via the project-members-only picker before this migration).
   Additive only — no existing table/column removed. Safe to re-run.
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_meeting_members') AND name = 'source')
BEGIN
  ALTER TABLE dbo.pm_meeting_members ADD source NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_mm_source DEFAULT ('project');
END
GO

-- Separate batch (GO) — the CHECK constraint references `source`, which the
-- batch above only just added; without a batch break SQL Server compiles
-- both statements together and fails with "Invalid column name 'source'"
-- since the column doesn't exist yet at compile time for this statement.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_mm_source')
BEGIN
  ALTER TABLE dbo.pm_meeting_members WITH CHECK ADD CONSTRAINT CK_pm_mm_source CHECK (source IN ('project','guest'));
END

COMMIT TRAN;
GO

-- Verify
SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_meeting_members') AND name = 'source')
            THEN 1 ELSE 0 END AS pm_meeting_members_source_present;
