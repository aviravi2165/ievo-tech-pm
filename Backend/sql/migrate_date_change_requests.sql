/* ============================================================================
   Migration: Date-change approval requests.

   New rule: once a Project/Phase/Activity/Task has a planned date set, it
   can no longer be edited directly (non-admins) — changing it requires
   submitting an approval request (with a reason) to a chosen project member
   or admin. Approving the request applies the date change; rejecting it
   leaves the date untouched. Admins still bypass the lock (as everywhere
   else in this module).

   This migration only ADDS a new table — it does not touch any existing
   table or column. Safe to re-run (idempotent).
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_date_change_requests')
BEGIN
  CREATE TABLE dbo.pm_date_change_requests (
    request_id     INT IDENTITY(1,1) PRIMARY KEY,
    project_id     INT NOT NULL,
    entity_type    NVARCHAR(20) NOT NULL,
    entity_id      INT NOT NULL,
    field_changed  NVARCHAR(20) NOT NULL,
    old_value      DATE NULL,
    new_value      DATE NOT NULL,
    reason         NVARCHAR(500) NOT NULL,
    requested_by   UNIQUEIDENTIFIER NOT NULL,
    approver_id    UNIQUEIDENTIFIER NOT NULL,
    status         NVARCHAR(20) NOT NULL CONSTRAINT DF_pm_dcr_status DEFAULT ('pending'),
    decision_note  NVARCHAR(500) NULL,
    decided_by     UNIQUEIDENTIFIER NULL,
    decided_at     DATETIMEOFFSET NULL,
    created_at     DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_dcr_created DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT FK_pm_dcr_project  FOREIGN KEY (project_id)   REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_dcr_reqby    FOREIGN KEY (requested_by) REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_pm_dcr_apprvr   FOREIGN KEY (approver_id)  REFERENCES dbo.auth_users(user_id),
    CONSTRAINT CK_pm_dcr_entity   CHECK (entity_type   IN ('project','phase','activity','task')),
    CONSTRAINT CK_pm_dcr_field    CHECK (field_changed IN ('plannedStart','plannedEnd','startDate','dueDate')),
    CONSTRAINT CK_pm_dcr_status   CHECK (status IN ('pending','approved','rejected','cancelled'))
  );
  CREATE INDEX IX_pm_dcr_project  ON dbo.pm_date_change_requests(project_id, status);
  CREATE INDEX IX_pm_dcr_approver ON dbo.pm_date_change_requests(approver_id, status);
  CREATE INDEX IX_pm_dcr_entity   ON dbo.pm_date_change_requests(entity_type, entity_id);
END

COMMIT TRAN;

-- Verify
SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_date_change_requests')
            THEN 1 ELSE 0 END AS pm_date_change_requests_present;
