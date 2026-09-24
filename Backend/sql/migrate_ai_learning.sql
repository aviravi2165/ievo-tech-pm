/* ============================================================================
   Migration: AI Learning module.

   Each employee has ONE AI Learning thread — built on the existing messaging
   system exactly like the project Report feature (pm_project_reports): a
   comm_groups group_thread + comm_conversations row, bridged here by
   employee_id. Participants = the employee + their current manager
   (auth_users.mgr_user_id) + every active admin — kept in sync on each
   access (see aiLearningService.syncThreadParticipants), so admins can
   always read/reply (the messaging module's existing super-admin bypass
   deliberately withholds message content from non-participant admins).

   Only ADDS a new table — no existing table/column touched. Safe to re-run
   (idempotent).
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_learning_threads')
BEGIN
  CREATE TABLE dbo.ai_learning_threads (
    employee_id     UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    conversation_id INT NOT NULL UNIQUE,
    created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_ail_created DEFAULT (SYSDATETIMEOFFSET()),
    CONSTRAINT FK_ail_employee FOREIGN KEY (employee_id)     REFERENCES dbo.auth_users(user_id) ON DELETE CASCADE,
    CONSTRAINT FK_ail_conv     FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id)
  );
END

COMMIT TRAN;

SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_learning_threads')
            THEN 1 ELSE 0 END AS ai_learning_threads_present;
