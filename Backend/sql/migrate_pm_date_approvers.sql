/* ============================================================================
   Migration: curated Date-Change Approvers.

   New rule: a date-change request's approver must be an admin OR a user an
   admin has explicitly designated an approver (this table) — no longer any
   arbitrary project member. Managed from a new admin-only "Manage
   Approvers" screen. Only ADDS a new table — no existing table/column
   touched. Safe to re-run (idempotent).
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_date_approvers')
BEGIN
  CREATE TABLE dbo.pm_date_approvers (
    user_id    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    added_by   UNIQUEIDENTIFIER NOT NULL,
    added_at   DATETIMEOFFSET NOT NULL CONSTRAINT DF_pm_dapp_added DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT FK_pm_dapp_user  FOREIGN KEY (user_id)  REFERENCES dbo.auth_users(user_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_dapp_added FOREIGN KEY (added_by) REFERENCES dbo.auth_users(user_id)
  );
END

COMMIT TRAN;

SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pm_date_approvers')
            THEN 1 ELSE 0 END AS pm_date_approvers_present;
