/*
  Communication Module — reference schema for MSSQL.
  Run against CommModuleDB before starting the API.
*/

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    userId                   INT           NOT NULL PRIMARY KEY,
    email                    NVARCHAR(256) NULL,
    firstName                NVARCHAR(100) NULL,
    lastName                 NVARCHAR(100) NULL,
    requiredEmailNotification BIT          NOT NULL DEFAULT 0,
    isActive                 BIT           NOT NULL DEFAULT 1
  );
END;

IF OBJECT_ID('dbo.groups', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.groups (
    groupId         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    groupName       NVARCHAR(200)     NOT NULL,
    createdByUserId INT               NOT NULL,
    isActive        BIT               NOT NULL DEFAULT 1,
    createdAt       DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.group_members', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.group_members (
    groupMemberId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    groupId       INT               NOT NULL,
    userId        INT               NOT NULL,
    isActive      BIT               NOT NULL DEFAULT 1,
    joinedAt      DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_group_members UNIQUE (groupId, userId)
  );
END;

IF OBJECT_ID('dbo.conversations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.conversations (
    conversationId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    subject          NVARCHAR(500)     NOT NULL,
    createdByUserId  INT               NOT NULL,
    allowReply       BIT               NOT NULL DEFAULT 1,
    isDeleted        BIT               NOT NULL DEFAULT 0,
    createdAt        DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    lastMessageAt    DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.participants', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.participants (
    participantId    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    conversationId   INT               NOT NULL,
    userId           INT               NOT NULL,
    isArchived       BIT               NOT NULL DEFAULT 0,
    isActive         BIT               NOT NULL DEFAULT 1,
    joinedAt         DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_participants UNIQUE (conversationId, userId)
  );
END;

IF OBJECT_ID('dbo.messages', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.messages (
    messageId        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    conversationId   INT               NOT NULL,
    senderUserId     INT               NOT NULL,
    parentMessageId  INT               NULL,
    bodyHtml         NVARCHAR(MAX)     NOT NULL,
    isDeleted        BIT               NOT NULL DEFAULT 0,
    sentAt           DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.attachments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.attachments (
    attachmentId     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    messageId          INT               NULL,
    uploadedByUserId   INT               NOT NULL,
    storedFileName     NVARCHAR(260)     NOT NULL,
    originalName       NVARCHAR(500)     NOT NULL,
    mimeType           NVARCHAR(127)     NOT NULL,
    fileSize           BIGINT            NOT NULL,
    isDeleted          BIT               NOT NULL DEFAULT 0,
    createdAt          DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.read_receipts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.read_receipts (
    receiptId   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    messageId   INT               NOT NULL,
    userId      INT               NOT NULL,
    readAt      DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_read_receipts UNIQUE (messageId, userId)
  );
END;
