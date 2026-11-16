/* ============================================================================
   Migration: Task proof of completion.

   pm_task_proofs — optional files (screenshot, PDF, Excel...) that a task's
   assignee attaches to show "this task is done, here is the proof", with an
   optional short note. Attaching proof is never required and never changes the
   task's status. The physical file lives under FILE_STORAGE_ROOT/attachments/
   task-proofs; storage_path is RELATIVE to FILE_STORAGE_ROOT.

   Requires pm_tasks and auth_users. Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.pm_task_proofs', 'U') IS NULL
CREATE TABLE dbo.pm_task_proofs (
    proof_id      int IDENTITY(1,1) NOT NULL,
    task_id       int NOT NULL,
    original_name nvarchar(260) NOT NULL,
    stored_name   nvarchar(100) NOT NULL,
    storage_path  nvarchar(500) NOT NULL,
    mime_type     nvarchar(150) NULL,
    file_size     bigint NULL,
    note          nvarchar(500) NULL,
    uploaded_by   uniqueidentifier NOT NULL,
    uploaded_at   datetimeoffset NOT NULL CONSTRAINT DF_pm_task_proofs_up DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_pm_task_proofs PRIMARY KEY (proof_id),
    CONSTRAINT FK_pm_task_proofs_task FOREIGN KEY (task_id) REFERENCES dbo.pm_tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_task_proofs_user FOREIGN KEY (uploaded_by) REFERENCES dbo.auth_users(user_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_task_proofs_task')
CREATE INDEX IX_pm_task_proofs_task ON dbo.pm_task_proofs (task_id);
GO

-- Verify
SELECT (SELECT COUNT(*) FROM sys.tables WHERE name = 'pm_task_proofs') AS pm_task_proofs_present;
