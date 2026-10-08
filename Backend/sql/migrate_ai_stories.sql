/* ============================================================================
   Migration: AI Stories — employees share AI use cases through an OPEN form
   (no Specula login needed). Stories start 'pending'; an admin approves
   them before they appear in AI Learning → AI Stories.

   ai_stories       — one row per submission. Submitter name/email/department
                      are plain form values, NOT linked to auth_users (people
                      submitting don't need a Specula account).
   ai_story_files   — optional "before" / "after" deliverables. Physical file
                      lives under FILE_STORAGE_ROOT/attachments/ai-stories;
                      storage_path is RELATIVE to FILE_STORAGE_ROOT.

   Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.ai_stories', 'U') IS NULL
CREATE TABLE dbo.ai_stories (
    story_id             int IDENTITY(1,1) NOT NULL,
    submitter_name       nvarchar(100) NOT NULL,
    submitter_email      nvarchar(150) NOT NULL,
    dept_id              int NOT NULL,
    title                nvarchar(200) NOT NULL,
    description          nvarchar(4000) NOT NULL,
    ai_model             nvarchar(50)  NOT NULL,
    ai_model_other       nvarchar(50)  NULL,
    input_details        nvarchar(4000) NOT NULL,
    output_details       nvarchar(4000) NOT NULL,
    hours_saved_per_week decimal(6,2)  NULL,
    status               nvarchar(10)  NOT NULL CONSTRAINT DF_ai_stories_status DEFAULT 'pending',
    review_note          nvarchar(500) NULL,
    reviewed_by          uniqueidentifier NULL,
    reviewed_at          datetimeoffset NULL,
    is_deleted           bit NOT NULL CONSTRAINT DF_ai_stories_deleted DEFAULT 0,
    created_at           datetimeoffset NOT NULL CONSTRAINT DF_ai_stories_created DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_ai_stories PRIMARY KEY (story_id),
    CONSTRAINT CK_ai_stories_status CHECK (status IN ('pending','approved','rejected')),
    CONSTRAINT CK_ai_stories_hours  CHECK (hours_saved_per_week IS NULL OR hours_saved_per_week >= 0),
    CONSTRAINT FK_ai_stories_dept     FOREIGN KEY (dept_id)     REFERENCES dbo.dept_master(dept_id),
    CONSTRAINT FK_ai_stories_reviewer FOREIGN KEY (reviewed_by) REFERENCES dbo.auth_users(user_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_stories_status')
CREATE INDEX IX_ai_stories_status ON dbo.ai_stories (status, created_at DESC);
GO

IF OBJECT_ID('dbo.ai_story_files', 'U') IS NULL
CREATE TABLE dbo.ai_story_files (
    file_id       int IDENTITY(1,1) NOT NULL,
    story_id      int NOT NULL,
    kind          nvarchar(10) NOT NULL,
    original_name nvarchar(260) NOT NULL,
    stored_name   nvarchar(100) NOT NULL,
    storage_path  nvarchar(500) NOT NULL,
    mime_type     nvarchar(150) NULL,
    file_size     bigint NULL,
    uploaded_at   datetimeoffset NOT NULL CONSTRAINT DF_ai_story_files_up DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_ai_story_files PRIMARY KEY (file_id),
    CONSTRAINT CK_ai_story_files_kind CHECK (kind IN ('before','after')),
    CONSTRAINT FK_ai_story_files_story FOREIGN KEY (story_id) REFERENCES dbo.ai_stories(story_id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_story_files_story')
CREATE INDEX IX_ai_story_files_story ON dbo.ai_story_files (story_id);
GO

-- Verify
SELECT
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'ai_stories')     AS ai_stories_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'ai_story_files') AS ai_story_files_present;
