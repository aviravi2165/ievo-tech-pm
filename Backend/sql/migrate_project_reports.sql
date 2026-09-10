/* ============================================================================
   Migration: project "Report" chat + DPR.

   A project's Report is a reused messaging conversation (comm_conversations,
   via a comm_groups group_thread) — same bridge pattern as pm_activity_threads,
   so it gets messages + file attachments + live sockets for free. Membership is
   an EXPLICIT admin-managed list (pm_report_members), NOT every project member.

   Idempotent — guarded so it's safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;

-- One report conversation per project (project_id -> comm_conversations).
IF OBJECT_ID('dbo.pm_project_reports', 'U') IS NULL
CREATE TABLE dbo.pm_project_reports (
    project_id      int NOT NULL,
    conversation_id int NOT NULL,
    created_at      datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_project_reports PRIMARY KEY (project_id),
    CONSTRAINT UQ_pm_project_reports_conv UNIQUE (conversation_id),
    CONSTRAINT FK_pm_project_reports_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_project_reports_conv    FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id)
);

-- Explicit, admin-managed member list for each project's report. Access to a
-- report = admin OR a row here. (Not tied to pm_members — reports are a
-- separately-curated audience.)
IF OBJECT_ID('dbo.pm_report_members', 'U') IS NULL
CREATE TABLE dbo.pm_report_members (
    project_id int NOT NULL,
    user_id    uniqueidentifier NOT NULL,
    added_by   uniqueidentifier NULL,
    added_at   datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_report_members PRIMARY KEY (project_id, user_id),
    CONSTRAINT FK_pm_report_members_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_report_members_user    FOREIGN KEY (user_id)    REFERENCES dbo.auth_users(user_id)
);

-- Verify
SELECT
  (SELECT COUNT(*) FROM sys.tables WHERE name='pm_project_reports') AS pm_project_reports_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name='pm_report_members')  AS pm_report_members_present;
