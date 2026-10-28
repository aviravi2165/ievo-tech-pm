/* ============================================================================
   Migration: AI Tech posts + the AI Feed (likes and comments).

   ai_tech_posts       — "new technology / AI model / tool we could use" shared through
                         an OPEN form (no Specula login). Like AI stories they start
                         'pending'; an admin approves them before they show in the feed.
   ai_tech_post_files  — optional screenshots / documents attached to a tech post.
   ai_feed_likes       — a like on a feed item (an AI story or a tech post). Identity is
                         just the person's email (no login): one like per email per item.
   ai_feed_comments    — a comment on a feed item, with the author's name + email.
                         Only the name is ever shown publicly.

   Requires migrate_ai_stories.sql (dept_master + ai_stories).
   Idempotent — safe to run more than once.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID('dbo.ai_tech_posts', 'U') IS NULL
CREATE TABLE dbo.ai_tech_posts (
    post_id          int IDENTITY(1,1) NOT NULL,
    submitter_name   nvarchar(100) NOT NULL,
    submitter_email  nvarchar(150) NOT NULL,
    dept_id          int NOT NULL,
    title            nvarchar(200) NOT NULL,
    tech_type        nvarchar(30)  NOT NULL,
    tech_type_other  nvarchar(50)  NULL,
    summary          nvarchar(max) NOT NULL,
    link_url         nvarchar(500) NULL,
    use_case         nvarchar(max) NOT NULL,
    expected_benefit nvarchar(max) NULL,
    status           nvarchar(10)  NOT NULL CONSTRAINT DF_ai_tech_posts_status DEFAULT 'pending',
    review_note      nvarchar(500) NULL,
    reviewed_by      uniqueidentifier NULL,
    reviewed_at      datetimeoffset NULL,
    is_deleted       bit NOT NULL CONSTRAINT DF_ai_tech_posts_deleted DEFAULT 0,
    created_at       datetimeoffset NOT NULL CONSTRAINT DF_ai_tech_posts_created DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_ai_tech_posts PRIMARY KEY (post_id),
    CONSTRAINT CK_ai_tech_posts_status CHECK (status IN ('pending','approved','rejected')),
    CONSTRAINT CK_ai_tech_posts_type   CHECK (tech_type IN ('AI model','AI tool','New technology','Software / platform','Other')),
    CONSTRAINT FK_ai_tech_posts_dept     FOREIGN KEY (dept_id)     REFERENCES dbo.dept_master(dept_id),
    CONSTRAINT FK_ai_tech_posts_reviewer FOREIGN KEY (reviewed_by) REFERENCES dbo.auth_users(user_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_tech_posts_status')
CREATE INDEX IX_ai_tech_posts_status ON dbo.ai_tech_posts (status, created_at DESC);
GO

IF OBJECT_ID('dbo.ai_tech_post_files', 'U') IS NULL
CREATE TABLE dbo.ai_tech_post_files (
    file_id       int IDENTITY(1,1) NOT NULL,
    post_id       int NOT NULL,
    original_name nvarchar(260) NOT NULL,
    stored_name   nvarchar(100) NOT NULL,
    storage_path  nvarchar(500) NOT NULL,
    mime_type     nvarchar(150) NULL,
    file_size     bigint NULL,
    uploaded_at   datetimeoffset NOT NULL CONSTRAINT DF_ai_tech_post_files_up DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_ai_tech_post_files PRIMARY KEY (file_id),
    CONSTRAINT FK_ai_tech_post_files_post FOREIGN KEY (post_id) REFERENCES dbo.ai_tech_posts(post_id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_tech_post_files_post')
CREATE INDEX IX_ai_tech_post_files_post ON dbo.ai_tech_post_files (post_id);
GO

IF OBJECT_ID('dbo.ai_feed_likes', 'U') IS NULL
CREATE TABLE dbo.ai_feed_likes (
    like_id     int IDENTITY(1,1) NOT NULL,
    item_type   nvarchar(10)  NOT NULL,
    item_id     int           NOT NULL,
    liker_email nvarchar(150) NOT NULL,
    liker_name  nvarchar(100) NOT NULL,
    created_at  datetimeoffset NOT NULL CONSTRAINT DF_ai_feed_likes_created DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_ai_feed_likes PRIMARY KEY (like_id),
    CONSTRAINT CK_ai_feed_likes_type CHECK (item_type IN ('story','tech')),
    CONSTRAINT UQ_ai_feed_likes_one_per_email UNIQUE (item_type, item_id, liker_email)
);
GO

IF OBJECT_ID('dbo.ai_feed_comments', 'U') IS NULL
CREATE TABLE dbo.ai_feed_comments (
    comment_id   int IDENTITY(1,1) NOT NULL,
    item_type    nvarchar(10)  NOT NULL,
    item_id      int           NOT NULL,
    author_name  nvarchar(100) NOT NULL,
    author_email nvarchar(150) NOT NULL,
    body         nvarchar(1000) NOT NULL,
    is_deleted   bit NOT NULL CONSTRAINT DF_ai_feed_comments_deleted DEFAULT 0,
    created_at   datetimeoffset NOT NULL CONSTRAINT DF_ai_feed_comments_created DEFAULT sysdatetimeoffset(),
    CONSTRAINT PK_ai_feed_comments PRIMARY KEY (comment_id),
    CONSTRAINT CK_ai_feed_comments_type CHECK (item_type IN ('story','tech'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ai_feed_comments_item')
CREATE INDEX IX_ai_feed_comments_item ON dbo.ai_feed_comments (item_type, item_id, created_at);
GO

-- Verify
SELECT
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'ai_tech_posts')      AS ai_tech_posts_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'ai_tech_post_files') AS ai_tech_post_files_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'ai_feed_likes')      AS ai_feed_likes_present,
  (SELECT COUNT(*) FROM sys.tables WHERE name = 'ai_feed_comments')   AS ai_feed_comments_present;
