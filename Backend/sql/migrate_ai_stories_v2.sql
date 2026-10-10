/* ============================================================================
   Migration: "Your AI Story" — form refinement.

   Adds the new optional fields to ai_stories:
     daily_activities      — day-to-day activities handed to AI
     deliverables          — specific deliverables produced with AI
     improved_productivity — impact checkbox
     improved_accuracy     — impact checkbox (both can be ticked)
     impact_description    — optional free-text impact note

   hours_saved_per_week is no longer collected by the form; the column stays
   so older stories keep their data.

   Requires migrate_ai_stories.sql to have run first.
   Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF COL_LENGTH('dbo.ai_stories', 'daily_activities') IS NULL
  ALTER TABLE dbo.ai_stories ADD daily_activities nvarchar(2000) NULL;
GO

IF COL_LENGTH('dbo.ai_stories', 'deliverables') IS NULL
  ALTER TABLE dbo.ai_stories ADD deliverables nvarchar(2000) NULL;
GO

IF COL_LENGTH('dbo.ai_stories', 'improved_productivity') IS NULL
  ALTER TABLE dbo.ai_stories ADD improved_productivity bit NOT NULL
    CONSTRAINT DF_ai_stories_improved_productivity DEFAULT 0;
GO

IF COL_LENGTH('dbo.ai_stories', 'improved_accuracy') IS NULL
  ALTER TABLE dbo.ai_stories ADD improved_accuracy bit NOT NULL
    CONSTRAINT DF_ai_stories_improved_accuracy DEFAULT 0;
GO

IF COL_LENGTH('dbo.ai_stories', 'impact_description') IS NULL
  ALTER TABLE dbo.ai_stories ADD impact_description nvarchar(1000) NULL;
GO

-- Verify
SELECT
  COL_LENGTH('dbo.ai_stories', 'daily_activities')      AS daily_activities_len,
  COL_LENGTH('dbo.ai_stories', 'deliverables')          AS deliverables_len,
  COL_LENGTH('dbo.ai_stories', 'improved_productivity') AS improved_productivity_len,
  COL_LENGTH('dbo.ai_stories', 'improved_accuracy')     AS improved_accuracy_len,
  COL_LENGTH('dbo.ai_stories', 'impact_description')    AS impact_description_len;
