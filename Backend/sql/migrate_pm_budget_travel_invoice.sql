/* ============================================================================
   Migration: Budget — travel details + invoice files on expenses.

   pm_project_expenses.travel_mode / travel_from / travel_to
       Travel expenses record the mode (Car / Train / Flight) and the From / To
       places. All three are NULL for every non-Travel expense.

   pm_project_expense_files
       Invoice files (PDF or image) attached to an expense. Every new expense
       must have at least one. Physical file lives under FILE_STORAGE_ROOT;
       storage_path is RELATIVE to FILE_STORAGE_ROOT.

   Requires migrate_pm_minutes_budget.sql to have run first.
   Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF COL_LENGTH('dbo.pm_project_expenses', 'travel_mode') IS NULL
  ALTER TABLE dbo.pm_project_expenses ADD travel_mode nvarchar(10) NULL;
GO

IF COL_LENGTH('dbo.pm_project_expenses', 'travel_from') IS NULL
  ALTER TABLE dbo.pm_project_expenses ADD travel_from nvarchar(100) NULL;
GO

IF COL_LENGTH('dbo.pm_project_expenses', 'travel_to') IS NULL
  ALTER TABLE dbo.pm_project_expenses ADD travel_to nvarchar(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_project_expenses_travel_mode')
  ALTER TABLE dbo.pm_project_expenses ADD CONSTRAINT CK_pm_project_expenses_travel_mode
    CHECK (travel_mode IS NULL OR travel_mode IN ('Car','Train','Flight'));
GO

IF OBJECT_ID('dbo.pm_project_expense_files', 'U') IS NULL
CREATE TABLE dbo.pm_project_expense_files (
    file_id       int IDENTITY(1,1) NOT NULL,
    expense_id    int NOT NULL,
    original_name nvarchar(260) NOT NULL,
    stored_name   nvarchar(100) NOT NULL,
    storage_path  nvarchar(500) NOT NULL,
    mime_type     nvarchar(150) NULL,
    file_size     bigint NULL,
    uploaded_by   uniqueidentifier NOT NULL,
    uploaded_at   datetimeoffset NOT NULL CONSTRAINT DF_pm_project_expense_files_up DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_pm_project_expense_files PRIMARY KEY (file_id),
    CONSTRAINT FK_pm_project_expense_files_expense FOREIGN KEY (expense_id) REFERENCES dbo.pm_project_expenses(expense_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_project_expense_files_user    FOREIGN KEY (uploaded_by) REFERENCES dbo.auth_users(user_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_project_expense_files_expense')
CREATE INDEX IX_pm_project_expense_files_expense ON dbo.pm_project_expense_files (expense_id);
GO

-- Verify
SELECT
  COL_LENGTH('dbo.pm_project_expenses', 'travel_mode') AS travel_mode_len,
  COL_LENGTH('dbo.pm_project_expenses', 'travel_from') AS travel_from_len,
  COL_LENGTH('dbo.pm_project_expenses', 'travel_to')   AS travel_to_len,
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'pm_project_expense_files') AS expense_files_present;
