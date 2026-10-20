/* ============================================================================
   Migration: AI Stories v3.

   1. Rich text — the story's text boxes now store (sanitised) HTML, which is
      longer than the visible text, so the six text columns become
      nvarchar(max). The character limits are enforced in the app on the
      VISIBLE text.
   2. Adds the "CTO OFFICE" department so it shows in the form's dropdown (and
      everywhere else departments are used).

   Requires migrate_ai_stories.sql and migrate_ai_stories_v2.sql.
   Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

ALTER TABLE dbo.ai_stories ALTER COLUMN description        nvarchar(max) NOT NULL;
ALTER TABLE dbo.ai_stories ALTER COLUMN input_details      nvarchar(max) NOT NULL;
ALTER TABLE dbo.ai_stories ALTER COLUMN output_details     nvarchar(max) NOT NULL;
ALTER TABLE dbo.ai_stories ALTER COLUMN daily_activities   nvarchar(max) NULL;
ALTER TABLE dbo.ai_stories ALTER COLUMN deliverables       nvarchar(max) NULL;
ALTER TABLE dbo.ai_stories ALTER COLUMN impact_description nvarchar(max) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dept_master WHERE dept_name = 'CTO OFFICE')
   AND NOT EXISTS (SELECT 1 FROM dbo.dept_master WHERE dept_code = 'CTO')
  INSERT INTO dbo.dept_master (dept_name, dept_code) VALUES ('CTO OFFICE', 'CTO');
GO

-- Verify
SELECT dept_id, dept_name, dept_code, is_active FROM dbo.dept_master WHERE dept_name = 'CTO OFFICE';
SELECT c.name AS column_name, TYPE_NAME(c.user_type_id) AS type, c.max_length
FROM sys.columns c
WHERE c.object_id = OBJECT_ID('dbo.ai_stories')
  AND c.name IN ('description','input_details','output_details','daily_activities','deliverables','impact_description');
