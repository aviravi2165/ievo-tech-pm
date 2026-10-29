/* ============================================================================
   Migration: AI Stories — "I use multiple AI tools".

   ai_stories.ai_models — JSON array of the tools a person used, e.g. ["Claude","ChatGPT"].
                          NULL for a single-tool story, so every existing row stays exactly
                          as it was. For a multi-tool story ai_model holds the fixed text
                          'Multiple tools' (the column is NOT NULL) and this column holds
                          the list. A tool typed under "Other" is stored here by its name.

   Requires migrate_ai_stories.sql. Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF COL_LENGTH('dbo.ai_stories', 'ai_models') IS NULL
    ALTER TABLE dbo.ai_stories ADD ai_models nvarchar(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ai_stories_ai_models_json')
    ALTER TABLE dbo.ai_stories ADD CONSTRAINT CK_ai_stories_ai_models_json
        CHECK (ai_models IS NULL OR ISJSON(ai_models) = 1);
GO

-- Verify
SELECT
  (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ai_stories') AND name = 'ai_models') AS ai_models_present,
  (SELECT COUNT(*) FROM dbo.ai_stories WHERE ai_models IS NOT NULL) AS multi_tool_rows;
