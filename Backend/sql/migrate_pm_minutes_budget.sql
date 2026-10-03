/* ============================================================================
   Migration: Minutes of Meeting (per meeting) + Project Budget / expenses.

   pm_meeting_minutes       — chat-like log of notes for a meeting. Written by
                              any meeting participant or a project Manager.
   pm_meeting_minute_files  — files attached to a minutes entry. Physical file
                              lives under FILE_STORAGE_ROOT (same multer storage
                              the chat attachments use); storage_path is
                              RELATIVE to FILE_STORAGE_ROOT.
   pm_project_expenses      — money spent on a project: category, date, amount,
                              and whether it was paid by the Company or out of
                              the person's Own pocket (then tracked until the
                              Manager marks it Reimbursed).

   Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.pm_meeting_minutes', 'U') IS NULL
CREATE TABLE dbo.pm_meeting_minutes (
    minute_id   int IDENTITY(1,1) NOT NULL,
    meeting_id  int NOT NULL,
    author_id   uniqueidentifier NOT NULL,
    body        nvarchar(max) NULL,
    is_deleted  bit NOT NULL CONSTRAINT DF_pm_meeting_minutes_deleted DEFAULT 0,
    created_at  datetimeoffset NOT NULL CONSTRAINT DF_pm_meeting_minutes_created DEFAULT sysdatetimeoffset(),
    updated_at  datetimeoffset NULL,
    CONSTRAINT PK_pm_meeting_minutes PRIMARY KEY (minute_id),
    CONSTRAINT FK_pm_meeting_minutes_meeting FOREIGN KEY (meeting_id) REFERENCES dbo.pm_meetings(meeting_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_meeting_minutes_author  FOREIGN KEY (author_id)  REFERENCES dbo.auth_users(user_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_meeting_minutes_meeting')
CREATE INDEX IX_pm_meeting_minutes_meeting ON dbo.pm_meeting_minutes (meeting_id, created_at);
GO

IF OBJECT_ID('dbo.pm_meeting_minute_files', 'U') IS NULL
CREATE TABLE dbo.pm_meeting_minute_files (
    file_id       int IDENTITY(1,1) NOT NULL,
    minute_id     int NOT NULL,
    original_name nvarchar(260) NOT NULL,
    stored_name   nvarchar(100) NOT NULL,
    storage_path  nvarchar(500) NOT NULL,
    mime_type     nvarchar(150) NULL,
    file_size     bigint NULL,
    uploaded_at   datetimeoffset NOT NULL CONSTRAINT DF_pm_meeting_minute_files_up DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_pm_meeting_minute_files PRIMARY KEY (file_id),
    CONSTRAINT FK_pm_meeting_minute_files_minute FOREIGN KEY (minute_id) REFERENCES dbo.pm_meeting_minutes(minute_id) ON DELETE CASCADE
);
GO

IF OBJECT_ID('dbo.pm_project_expenses', 'U') IS NULL
CREATE TABLE dbo.pm_project_expenses (
    expense_id     int IDENTITY(1,1) NOT NULL,
    project_id     int NOT NULL,
    category       nvarchar(50)  NOT NULL,
    category_other nvarchar(100) NULL,
    description    nvarchar(500) NULL,
    expense_date   date NOT NULL,
    amount         decimal(14,2) NOT NULL,
    paid_by        nvarchar(10) NOT NULL,
    is_reimbursed  bit NOT NULL CONSTRAINT DF_pm_project_expenses_reimb DEFAULT 0,
    reimbursed_by  uniqueidentifier NULL,
    reimbursed_at  datetimeoffset NULL,
    created_by     uniqueidentifier NOT NULL,
    created_at     datetimeoffset NOT NULL CONSTRAINT DF_pm_project_expenses_created DEFAULT sysdatetimeoffset(),
    updated_at     datetimeoffset NULL,
    is_deleted     bit NOT NULL CONSTRAINT DF_pm_project_expenses_deleted DEFAULT 0,
    CONSTRAINT PK_pm_project_expenses PRIMARY KEY (expense_id),
    CONSTRAINT CK_pm_project_expenses_amount  CHECK (amount > 0),
    CONSTRAINT CK_pm_project_expenses_paid_by CHECK (paid_by IN ('Company','Own')),
    CONSTRAINT FK_pm_project_expenses_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_project_expenses_creator FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_project_expenses_project')
CREATE INDEX IX_pm_project_expenses_project ON dbo.pm_project_expenses (project_id, expense_date);
GO

-- Per-entity audit lookups (task completion time, shown on every task row).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_audit_log_entity')
CREATE INDEX IX_pm_audit_log_entity ON dbo.pm_audit_log (entity_type, entity_id, action, changed_at DESC) INCLUDE (field_changed, user_id);
GO

-- Verify
SELECT
  (SELECT COUNT(*) FROM sys.tables WHERE name='pm_meeting_minutes')      AS pm_meeting_minutes_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name='pm_meeting_minute_files') AS pm_meeting_minute_files_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name='pm_project_expenses')     AS pm_project_expenses_present;
