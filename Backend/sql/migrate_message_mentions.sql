/* ============================================================================
   Migration: @mentions in chat messages.

   Records who was @mentioned in a message (comm_messages), for a persisted
   "you were mentioned" history and to drive the live MENTIONED socket
   notification. Only ADDS a new table — no existing table/column touched.
   Safe to re-run (idempotent).
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'comm_message_mentions')
BEGIN
  CREATE TABLE dbo.comm_message_mentions (
    message_id        INT NOT NULL,
    mentioned_user_id  UNIQUEIDENTIFIER NOT NULL,
    conversation_id    INT NOT NULL,
    created_at          DATETIMEOFFSET NOT NULL CONSTRAINT DF_cmm_created DEFAULT (SYSDATETIMEOFFSET()),
    is_read            BIT NOT NULL CONSTRAINT DF_cmm_read DEFAULT (0),
    read_at            DATETIMEOFFSET NULL,
    CONSTRAINT PK_comm_message_mentions PRIMARY KEY (message_id, mentioned_user_id),
    CONSTRAINT FK_cmm_message FOREIGN KEY (message_id)      REFERENCES dbo.comm_messages(message_id) ON DELETE CASCADE,
    CONSTRAINT FK_cmm_user    FOREIGN KEY (mentioned_user_id) REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_cmm_conv    FOREIGN KEY (conversation_id)  REFERENCES dbo.comm_conversations(conversation_id) ON DELETE CASCADE
  );
  CREATE INDEX IX_cmm_user ON dbo.comm_message_mentions(mentioned_user_id, is_read);
  CREATE INDEX IX_cmm_conv ON dbo.comm_message_mentions(conversation_id);
END

COMMIT TRAN;

SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'comm_message_mentions')
            THEN 1 ELSE 0 END AS comm_message_mentions_present;
