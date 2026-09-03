/* ============================================================================
   Migration: project enhancements (weightage + status vocabulary + grouping)
   Run this ONCE against the server database before deploying the new code.

   It is fully idempotent — every step is guarded, so it is safe to run even
   if some parts were already applied on an earlier deploy (e.g. the weightage
   columns). Running it twice does nothing the second time.

   HOW TO RUN
     - Back up the database first.
     - Open this file in SSMS connected to the server, or run:
         sqlcmd -S <server> -d ievo-tech-pm -i migrate_project_enhancements.sql
     - The GO separators matter (they let a new column be referenced by the
       next statement) — run the whole file, don't strip the GOs.
   ============================================================================ */

USE [ievo-tech-pm];
GO
-- Required for UPDATEs on tables that carry filtered indexes; harmless otherwise.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ===== 1. Weightage columns (Activity / Phase / Task) =======================
   No-op if a previous deploy already added these. */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_activities') AND name = 'weightage')
    ALTER TABLE dbo.pm_activities ADD weightage decimal(5,2) NULL;
GO
UPDATE dbo.pm_activities SET weightage = NULL WHERE weightage = 0;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_activities_weightage')
    ALTER TABLE dbo.pm_activities DROP CONSTRAINT CK_pm_activities_weightage;
ALTER TABLE dbo.pm_activities WITH CHECK ADD CONSTRAINT CK_pm_activities_weightage
    CHECK (weightage IS NULL OR (weightage >= 1 AND weightage <= 100));
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_phases') AND name = 'weightage')
    ALTER TABLE dbo.pm_phases ADD weightage decimal(5,2) NULL;
GO
UPDATE dbo.pm_phases SET weightage = NULL WHERE weightage = 0;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_phases_weightage')
    ALTER TABLE dbo.pm_phases DROP CONSTRAINT CK_pm_phases_weightage;
ALTER TABLE dbo.pm_phases WITH CHECK ADD CONSTRAINT CK_pm_phases_weightage
    CHECK (weightage IS NULL OR (weightage >= 1 AND weightage <= 100));
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_tasks') AND name = 'weightage')
    ALTER TABLE dbo.pm_tasks ADD weightage decimal(5,2) NULL;
GO
UPDATE dbo.pm_tasks SET weightage = NULL WHERE weightage = 0;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_tasks_weightage')
    ALTER TABLE dbo.pm_tasks DROP CONSTRAINT CK_pm_tasks_weightage;
ALTER TABLE dbo.pm_tasks WITH CHECK ADD CONSTRAINT CK_pm_tasks_weightage
    CHECK (weightage IS NULL OR (weightage >= 1 AND weightage <= 100));
GO

/* ===== 2. Project status vocabulary =========================================
   Planning -> Active, On Hold -> Hold, Cancelled -> Closed (Active/Completed
   unchanged), then swap the allowed-values constraint. */

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_projects_status')
    ALTER TABLE dbo.pm_projects DROP CONSTRAINT CK_pm_projects_status;
GO
UPDATE dbo.pm_projects SET status = 'Active' WHERE status = 'Planning';
UPDATE dbo.pm_projects SET status = 'Hold'   WHERE status = 'On Hold';
UPDATE dbo.pm_projects SET status = 'Closed' WHERE status = 'Cancelled';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_projects_status')
    ALTER TABLE dbo.pm_projects WITH CHECK ADD CONSTRAINT CK_pm_projects_status
        CHECK (status IN ('Active','Hold','Completed','Closed'));
GO

/* ===== 3. Project grouping ==================================================
   Shared group catalogue + a single group_id column on pm_projects
   (folder-style: a project belongs to at most one group). */

IF OBJECT_ID('dbo.pm_project_groups', 'U') IS NULL
CREATE TABLE dbo.pm_project_groups (
    group_id   int IDENTITY(1,1) NOT NULL,
    name       nvarchar(120) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    created_by uniqueidentifier NULL,
    created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_project_groups PRIMARY KEY (group_id),
    CONSTRAINT FK_pm_project_groups_creator FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_projects') AND name = 'group_id')
    ALTER TABLE dbo.pm_projects ADD group_id int NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_pm_projects_group')
    ALTER TABLE dbo.pm_projects ADD CONSTRAINT FK_pm_projects_group
        FOREIGN KEY (group_id) REFERENCES dbo.pm_project_groups(group_id);
GO

/* ===== 4. Verify (optional) ================================================ */
SELECT 'pm_activities.weightage' AS check_item, COUNT(*) AS present FROM sys.columns WHERE object_id=OBJECT_ID('dbo.pm_activities') AND name='weightage'
UNION ALL SELECT 'pm_phases.weightage', COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.pm_phases') AND name='weightage'
UNION ALL SELECT 'pm_tasks.weightage', COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.pm_tasks') AND name='weightage'
UNION ALL SELECT 'pm_projects.group_id', COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.pm_projects') AND name='group_id'
UNION ALL SELECT 'pm_project_groups table', COUNT(*) FROM sys.tables WHERE name='pm_project_groups'
UNION ALL SELECT 'CK_pm_projects_status', COUNT(*) FROM sys.check_constraints WHERE name='CK_pm_projects_status';
-- Every row should show present = 1.
SELECT DISTINCT status FROM dbo.pm_projects;  -- should only be Active/Hold/Completed/Closed
GO
