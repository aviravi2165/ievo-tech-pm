-- Schema is provided separately as schema.mssql.sql
-- Run the MSSQL schema script you already have against your SQL Server instance.
-- [ievo-tech-pm].dbo.dept_master definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.dept_master;

CREATE TABLE [ievo-tech-pm].dbo.dept_master (
	dept_id int IDENTITY(1,1) NOT NULL,
	dept_name varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	dept_code varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	is_active bit DEFAULT 1 NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__dept_mas__DCA65974548BFDAE PRIMARY KEY (dept_id),
	CONSTRAINT UQ__dept_mas__799C94D56442B8CD UNIQUE (dept_code),
	CONSTRAINT UQ__dept_mas__C7D39AE12A6E577B UNIQUE (dept_name)
);


-- [ievo-tech-pm].dbo.auth_users definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.auth_users;

CREATE TABLE [ievo-tech-pm].dbo.auth_users (
	user_id uniqueidentifier DEFAULT newid() NOT NULL,
	username varchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	password_hash nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	first_name varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	last_name varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	email varchar(150) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	phone_number varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	profile_picture nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	dept_id int NULL,
	[level] int NULL,
	mgr_user_id uniqueidentifier NULL,
	user_type varchar(30) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'employee' NOT NULL,
	employee_code varchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	is_active bit DEFAULT 1 NOT NULL,
	must_change_password bit DEFAULT 0 NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	modified_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__auth_use__B9BE370F707337F1 PRIMARY KEY (user_id),
	CONSTRAINT UQ__auth_use__AB6E6164B4F4B9A3 UNIQUE (email),
	CONSTRAINT UQ__auth_use__F3DBC57266FA8CA0 UNIQUE (username),
	CONSTRAINT FK_auth_users_dept FOREIGN KEY (dept_id) REFERENCES [ievo-tech-pm].dbo.dept_master(dept_id),
	CONSTRAINT FK_auth_users_manager FOREIGN KEY (mgr_user_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id)
);


-- [ievo-tech-pm].dbo.comm_groups definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_groups;

CREATE TABLE [ievo-tech-pm].dbo.comm_groups (
	group_id int IDENTITY(1,1) NOT NULL,
	group_name varchar(150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	description nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	created_by uniqueidentifier NOT NULL,
	is_active bit DEFAULT 1 NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	is_disabled bit DEFAULT 0 NOT NULL,
	disabled_at datetimeoffset NULL,
	disabled_by uniqueidentifier NULL,
	CONSTRAINT PK__comm_gro__D57795A043EF4D2B PRIMARY KEY (group_id),
	CONSTRAINT FK_comm_groups_createdby FOREIGN KEY (created_by) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id),
	CONSTRAINT FK_comm_groups_disabledby FOREIGN KEY (disabled_by) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id)
);


-- [ievo-tech-pm].dbo.comm_conversations definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_conversations;

CREATE TABLE [ievo-tech-pm].dbo.comm_conversations (
	conversation_id int IDENTITY(1,1) NOT NULL,
	subject varchar(300) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	allow_reply bit DEFAULT 1 NOT NULL,
	created_by uniqueidentifier NOT NULL,
	group_id int NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	last_message_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	conv_type varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'bcc' NOT NULL,
	is_disabled bit DEFAULT 0 NOT NULL,
	disabled_at datetimeoffset NULL,
	disabled_by uniqueidentifier NULL,
	CONSTRAINT PK__comm_con__311E7E9A3AD61852 PRIMARY KEY (conversation_id),
	CONSTRAINT FK_comm_conv_createdby FOREIGN KEY (created_by) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id),
	CONSTRAINT FK_comm_conv_disabledby FOREIGN KEY (disabled_by) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id),
	CONSTRAINT FK_comm_conv_group FOREIGN KEY (group_id) REFERENCES [ievo-tech-pm].dbo.comm_groups(group_id)
);
ALTER TABLE [ievo-tech-pm].dbo.comm_conversations WITH NOCHECK ADD CONSTRAINT CK__comm_conv__conv___72C60C4A CHECK (([conv_type]='group_thread' OR [conv_type]='cc' OR [conv_type]='bcc'));


-- [ievo-tech-pm].dbo.comm_group_hidden definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_group_hidden;

CREATE TABLE [ievo-tech-pm].dbo.comm_group_hidden (
	group_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	hidden_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK_comm_group_hidden PRIMARY KEY (group_id,user_id),
	CONSTRAINT FK_comm_group_hidden_group FOREIGN KEY (group_id) REFERENCES [ievo-tech-pm].dbo.comm_groups(group_id) ON DELETE CASCADE,
	CONSTRAINT FK_comm_group_hidden_user FOREIGN KEY (user_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id) ON DELETE CASCADE
);


-- [ievo-tech-pm].dbo.comm_group_members definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_group_members;

CREATE TABLE [ievo-tech-pm].dbo.comm_group_members (
	group_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	added_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	is_co_admin bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_comm_group_members PRIMARY KEY (group_id,user_id),
	CONSTRAINT FK_comm_group_members_group FOREIGN KEY (group_id) REFERENCES [ievo-tech-pm].dbo.comm_groups(group_id) ON DELETE CASCADE,
	CONSTRAINT FK_comm_group_members_user FOREIGN KEY (user_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id) ON DELETE CASCADE
);


-- [ievo-tech-pm].dbo.comm_messages definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_messages;

CREATE TABLE [ievo-tech-pm].dbo.comm_messages (
	message_id int IDENTITY(1,1) NOT NULL,
	conversation_id int NOT NULL,
	sender_id uniqueidentifier NOT NULL,
	parent_message_id int NULL,
	body_html nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	sent_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_mes__0BBF6EE68D1986E9 PRIMARY KEY (message_id),
	CONSTRAINT FK__comm_mess__conve__04E4BC85 FOREIGN KEY (conversation_id) REFERENCES [ievo-tech-pm].dbo.comm_conversations(conversation_id),
	CONSTRAINT FK__comm_mess__paren__06CD04F7 FOREIGN KEY (parent_message_id) REFERENCES [ievo-tech-pm].dbo.comm_messages(message_id),
	CONSTRAINT FK__comm_mess__sende__05D8E0BE FOREIGN KEY (sender_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id)
);


-- [ievo-tech-pm].dbo.comm_participants definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_participants;

CREATE TABLE [ievo-tech-pm].dbo.comm_participants (
	participant_id int IDENTITY(1,1) NOT NULL,
	conversation_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	participant_type varchar(10) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'to' NOT NULL,
	is_archived bit DEFAULT 0 NOT NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	joined_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	archived_at datetimeoffset NULL,
	left_at datetimeoffset NULL,
	CONSTRAINT PK__comm_par__4E0378061F7A913F PRIMARY KEY (participant_id),
	CONSTRAINT UQ_comm_participants UNIQUE (conversation_id,user_id),
	CONSTRAINT FK_comm_participants_conv FOREIGN KEY (conversation_id) REFERENCES [ievo-tech-pm].dbo.comm_conversations(conversation_id),
	CONSTRAINT FK_comm_participants_user FOREIGN KEY (user_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id)
);
ALTER TABLE [ievo-tech-pm].dbo.comm_participants WITH NOCHECK ADD CONSTRAINT CK__comm_part__parti__7B5B524B CHECK (([participant_type]='bcc' OR [participant_type]='cc' OR [participant_type]='to'));


-- [ievo-tech-pm].dbo.comm_read_receipts definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_read_receipts;

CREATE TABLE [ievo-tech-pm].dbo.comm_read_receipts (
	message_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	read_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_rea__E0248D96CF84064F PRIMARY KEY (message_id,user_id),
	CONSTRAINT FK__comm_read__messa__10566F31 FOREIGN KEY (message_id) REFERENCES [ievo-tech-pm].dbo.comm_messages(message_id),
	CONSTRAINT FK__comm_read__user___114A936A FOREIGN KEY (user_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id)
);


-- [ievo-tech-pm].dbo.comm_attachments definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_attachments;

CREATE TABLE [ievo-tech-pm].dbo.comm_attachments (
	attachment_id int IDENTITY(1,1) NOT NULL,
	message_id int NULL,
	uploaded_by uniqueidentifier NOT NULL,
	original_name varchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	stored_name varchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	storage_path varchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	mime_type varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	file_size bigint NOT NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	uploaded_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_att__B74DF4E21DF3B6D0 PRIMARY KEY (attachment_id),
	CONSTRAINT FK__comm_atta__messa__0B91BA14 FOREIGN KEY (message_id) REFERENCES [ievo-tech-pm].dbo.comm_messages(message_id),
	CONSTRAINT FK__comm_atta__uploa__0C85DE4D FOREIGN KEY (uploaded_by) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id)
);


-- [ievo-tech-pm].dbo.comm_conversation_hidden definition

-- Drop table

-- DROP TABLE [ievo-tech-pm].dbo.comm_conversation_hidden;

CREATE TABLE [ievo-tech-pm].dbo.comm_conversation_hidden (
	conversation_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	hidden_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_con__DA859DEAA3E9F52E PRIMARY KEY (conversation_id,user_id),
	CONSTRAINT FK__comm_conv__conve__151B244E FOREIGN KEY (conversation_id) REFERENCES [ievo-tech-pm].dbo.comm_conversations(conversation_id) ON DELETE CASCADE,
	CONSTRAINT FK__comm_conv__user___160F4887 FOREIGN KEY (user_id) REFERENCES [ievo-tech-pm].dbo.auth_users(user_id) ON DELETE CASCADE
);