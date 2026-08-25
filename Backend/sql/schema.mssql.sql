-- SET QUOTED_IDENTIFIER/ANSI_NULLS ON — required at the session level for
-- the filtered indexes further down (e.g. "CREATE INDEX ... WHERE
-- is_deleted = 0"); without this, a fresh sqlcmd/ODBC session whose default
-- differs fails those CREATE INDEX statements with error 1934.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- dbo.dept_master definition

-- Drop table

-- DROP TABLE dbo.dept_master;

CREATE TABLE dbo.dept_master (
	dept_id int IDENTITY(1,1) NOT NULL,
	dept_name varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	dept_code varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	is_active bit DEFAULT 1 NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__dept_mas__DCA65974548BFDAE PRIMARY KEY (dept_id),
	CONSTRAINT UQ__dept_mas__799C94D56442B8CD UNIQUE (dept_code),
	CONSTRAINT UQ__dept_mas__C7D39AE12A6E577B UNIQUE (dept_name)
);


-- dbo.auth_users definition

-- Drop table

-- DROP TABLE dbo.auth_users;

CREATE TABLE dbo.auth_users (
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
	required_email_notification bit DEFAULT 1 NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	modified_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__auth_use__B9BE370F707337F1 PRIMARY KEY (user_id),
	CONSTRAINT UQ__auth_use__AB6E6164B4F4B9A3 UNIQUE (email),
	CONSTRAINT UQ__auth_use__F3DBC57266FA8CA0 UNIQUE (username),
	CONSTRAINT FK_auth_users_dept FOREIGN KEY (dept_id) REFERENCES dbo.dept_master(dept_id),
	CONSTRAINT FK_auth_users_manager FOREIGN KEY (mgr_user_id) REFERENCES dbo.auth_users(user_id)
);


-- dbo.comm_groups definition

-- Drop table

-- DROP TABLE dbo.comm_groups;

CREATE TABLE dbo.comm_groups (
	group_id int IDENTITY(1,1) NOT NULL,
	group_name nvarchar(150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	description nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	created_by uniqueidentifier NOT NULL,
	is_active bit DEFAULT 1 NOT NULL,
	created_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	is_disabled bit DEFAULT 0 NOT NULL,
	disabled_at datetimeoffset NULL,
	disabled_by uniqueidentifier NULL,
	CONSTRAINT PK__comm_gro__D57795A043EF4D2B PRIMARY KEY (group_id),
	CONSTRAINT FK_comm_groups_createdby FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id),
	CONSTRAINT FK_comm_groups_disabledby FOREIGN KEY (disabled_by) REFERENCES dbo.auth_users(user_id)
);


-- dbo.comm_conversations definition

-- Drop table

-- DROP TABLE dbo.comm_conversations;

CREATE TABLE dbo.comm_conversations (
	conversation_id int IDENTITY(1,1) NOT NULL,
	subject nvarchar(300) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
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
	CONSTRAINT FK_comm_conv_createdby FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id),
	CONSTRAINT FK_comm_conv_disabledby FOREIGN KEY (disabled_by) REFERENCES dbo.auth_users(user_id),
	CONSTRAINT FK_comm_conv_group FOREIGN KEY (group_id) REFERENCES dbo.comm_groups(group_id)
);
ALTER TABLE dbo.comm_conversations WITH NOCHECK ADD CONSTRAINT CK__comm_conv__conv___72C60C4A CHECK (([conv_type]='group_thread' OR [conv_type]='cc' OR [conv_type]='bcc'));


-- dbo.comm_group_hidden definition

-- Drop table

-- DROP TABLE dbo.comm_group_hidden;

CREATE TABLE dbo.comm_group_hidden (
	group_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	hidden_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK_comm_group_hidden PRIMARY KEY (group_id,user_id),
	CONSTRAINT FK_comm_group_hidden_group FOREIGN KEY (group_id) REFERENCES dbo.comm_groups(group_id) ON DELETE CASCADE,
	CONSTRAINT FK_comm_group_hidden_user FOREIGN KEY (user_id) REFERENCES dbo.auth_users(user_id) ON DELETE CASCADE
);


-- dbo.comm_group_members definition

-- Drop table

-- DROP TABLE dbo.comm_group_members;

CREATE TABLE dbo.comm_group_members (
	group_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	added_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	is_co_admin bit DEFAULT 0 NOT NULL,
	CONSTRAINT PK_comm_group_members PRIMARY KEY (group_id,user_id),
	CONSTRAINT FK_comm_group_members_group FOREIGN KEY (group_id) REFERENCES dbo.comm_groups(group_id) ON DELETE CASCADE,
	CONSTRAINT FK_comm_group_members_user FOREIGN KEY (user_id) REFERENCES dbo.auth_users(user_id) ON DELETE CASCADE
);


-- dbo.comm_messages definition

-- Drop table

-- DROP TABLE dbo.comm_messages;

CREATE TABLE dbo.comm_messages (
	message_id int IDENTITY(1,1) NOT NULL,
	conversation_id int NOT NULL,
	-- sender_id is nullable — a system message (e.g. the Activity Insights
	-- cron post; see activityController's hasUnreadChat query, which checks
	-- sender_id IS NULL) has no human sender.
	sender_id uniqueidentifier NULL,
	parent_message_id int NULL,
	body_html nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	sent_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	is_edited BIT NOT NULL DEFAULT 0,
	edited_at datetimeoffset NULL,
	is_system BIT NOT NULL DEFAULT 0,
	CONSTRAINT PK__comm_mes__0BBF6EE68D1986E9 PRIMARY KEY (message_id),
	CONSTRAINT FK__comm_mess__conve__04E4BC85 FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id),
	CONSTRAINT FK__comm_mess__paren__06CD04F7 FOREIGN KEY (parent_message_id) REFERENCES dbo.comm_messages(message_id),
	CONSTRAINT FK__comm_mess__sende__05D8E0BE FOREIGN KEY (sender_id) REFERENCES dbo.auth_users(user_id)
);

 

-- dbo.comm_participants definition

-- Drop table

-- DROP TABLE dbo.comm_participants;

CREATE TABLE dbo.comm_participants (
	participant_id int IDENTITY(1,1) NOT NULL,
	conversation_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	participant_type varchar(10) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'to' NOT NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	joined_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	left_at DATETIMEOFFSET NULL,
	rejoined_at DATETIMEOFFSET NULL,
	CONSTRAINT PK__comm_par__4E0378061F7A913F PRIMARY KEY (participant_id),
	CONSTRAINT UQ_comm_participants UNIQUE (conversation_id,user_id),
	CONSTRAINT FK_comm_participants_conv FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id),
	CONSTRAINT FK_comm_participants_user FOREIGN KEY (user_id) REFERENCES dbo.auth_users(user_id)
);
ALTER TABLE dbo.comm_participants WITH NOCHECK ADD CONSTRAINT CK__comm_part__parti__7B5B524B CHECK (([participant_type]='bcc' OR [participant_type]='cc' OR [participant_type]='to'));


-- dbo.comm_read_receipts definition

-- Drop table

-- DROP TABLE dbo.comm_read_receipts;

CREATE TABLE dbo.comm_read_receipts (
	message_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	read_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_rea__E0248D96CF84064F PRIMARY KEY (message_id,user_id),
	CONSTRAINT FK__comm_read__messa__10566F31 FOREIGN KEY (message_id) REFERENCES dbo.comm_messages(message_id),
	CONSTRAINT FK__comm_read__user___114A936A FOREIGN KEY (user_id) REFERENCES dbo.auth_users(user_id)
);


-- dbo.comm_attachments definition

-- Drop table

-- DROP TABLE dbo.comm_attachments;

CREATE TABLE dbo.comm_attachments (
	attachment_id int IDENTITY(1,1) NOT NULL,
	message_id int NULL,
	uploaded_by uniqueidentifier NOT NULL,
	original_name nvarchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	stored_name varchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	storage_path varchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	mime_type varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	file_size bigint NOT NULL,
	is_deleted bit DEFAULT 0 NOT NULL,
	uploaded_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_att__B74DF4E21DF3B6D0 PRIMARY KEY (attachment_id),
	CONSTRAINT FK__comm_atta__messa__0B91BA14 FOREIGN KEY (message_id) REFERENCES dbo.comm_messages(message_id),
	CONSTRAINT FK__comm_atta__uploa__0C85DE4D FOREIGN KEY (uploaded_by) REFERENCES dbo.auth_users(user_id)
);


-- dbo.comm_conversation_hidden definition

-- Drop table

-- DROP TABLE dbo.comm_conversation_hidden;

CREATE TABLE dbo.comm_conversation_hidden (
	conversation_id int NOT NULL,
	user_id uniqueidentifier NOT NULL,
	hidden_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
	CONSTRAINT PK__comm_con__DA859DEAA3E9F52E PRIMARY KEY (conversation_id,user_id),
	CONSTRAINT FK__comm_conv__conve__151B244E FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id) ON DELETE CASCADE,
	CONSTRAINT FK__comm_conv__user___160F4887 FOREIGN KEY (user_id) REFERENCES dbo.auth_users(user_id) ON DELETE CASCADE
);


-- Seed departments
INSERT INTO dbo.dept_master (dept_name, dept_code)
SELECT v.dept_name, v.dept_code
FROM (
    VALUES 
    ('ADMINISTRATION', 'ADMN'),
    ('BDC', 'BDC'),
    ('BOX PLANT', 'BOX'),
    ('CIVIL', 'CIV'),
    ('CNC', 'CNC'),
    ('CONSULTANT', 'CONS'),
    ('COST & ESTIMATION', 'C&E'),
    ('DESIGN', 'DES'),
    ('DISPATCH', 'DIS'),
    ('ERP', 'ERP'),
    ('F&B', 'F&B'),
    ('FACILITY_L', 'FACL'),
    ('FINANCE', 'FNC'),
    ('FIRE & SAFETY', 'F&S'),
    ('Founders Office', 'FND'),
    ('GLASS', 'GLS'),
    ('HABUFA', 'HAB'),
    ('HOUSEKEEPING', 'HSKP'),
    ('IN HOUSE MAINTENANCE', 'IHM'),
    ('INSTALLATION', 'INST'),
    ('IT', 'IT'),
    ('LED', 'LED'),
    ('MAINTENANCE', 'MNT'),
    ('MAINTENANCE_HVAC', 'HVAC'),
    ('MANAGEMENT', 'MGT'),
    ('METAL', 'MET'),
    ('MMT', 'MMT'),
    ('OEM', 'OEM'),
    ('OUTDOOR FURNITURE', 'ODF'),
    ('OUTDOOR PROTO TYPE', 'ODPT'),
    ('PACKAGING', 'PKG'),
    ('PANEL WORKS', 'PW'),
    ('PANEL WORKS ASSEMBLY', 'PWA'),
    ('PANEL WORKS SURFACE FINISH', 'PWSF'),
    ('PCD', 'PCD'),
    ('PEOPLE OPERATIONS', 'POPS'),
    ('PMC', 'PMC'),
    ('PRINTING', 'PRT'),
    ('PROCESS IMPROVEMENT & DEVELOPMENT', 'PID'),
    ('PRODUCTION', 'PROD'),
    ('PROTO-TYPE', 'PT'),
    ('QC', 'QC'),
    ('SKILL DEVELOPMENT', 'SKILL'),
    ('SMC', 'SMC'),
    ('SOLID WOOD ASSEMBLY', 'SWA'),
    ('SOLID WOOD MACHINING', 'SWM'),
    ('SOLID WOOD SURFACE FINISH', 'SWSF'),
    ('STONE', 'STN'),
    ('SU', 'SU'),
    ('SUNDAY WAREHOUSE', 'SWH'),
    ('UPHOLSTERY', 'UPH')
) AS v(dept_name, dept_code)
WHERE NOT EXISTS (
    SELECT 1 
    FROM dbo.dept_master d 
    WHERE d.dept_name = v.dept_name
);

SELECT * FROM dbo.dept_master;

-- Test / seed users
-- NOTE: allow_login previously appeared in these INSERT column lists but
-- was never a real column on dbo.auth_users (not in the CREATE TABLE above,
-- not referenced anywhere in the backend) — a leftover from wherever this
-- seed data was originally exported from. Dropped from the column list AND
-- each VALUES tuple below so a fresh run of this script doesn't 500 on
-- "Invalid column name 'allow_login'".
INSERT INTO dbo.auth_users
(username, password_hash, first_name, last_name, email, user_type, is_active, must_change_password)
SELECT
    v.username, v.password_hash, v.first_name, v.last_name, v.email, v.user_type, v.is_active, v.must_change_password
FROM (
    VALUES
    ('admin',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin',  'User', 'admin@ievo.in', 'admin',    1, 0),
    ('testuser', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test',   'User', 'test@ievo.in',  'employee', 1, 0),
    ('md',       '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Senior', 'MD',   'md@ievo.in',    'viewer',   1, 0)
) AS v(username, password_hash, first_name, last_name, email, user_type, is_active, must_change_password)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.auth_users u
    WHERE u.username = v.username
);
SELECT * FROM dbo.auth_users;




INSERT INTO dbo.auth_users
(username, password_hash, first_name, last_name, email, user_type, is_active, must_change_password)
SELECT
    v.username, v.password_hash, v.first_name, v.last_name, v.email, v.user_type, v.is_active, v.must_change_password
FROM (
    VALUES
    ('Yash_Suthar', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Yash', 'Suthar', 'yash.suthar@ievo.co.in', 'employee', 1, 0),
    ('Ali_Atif', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Ali', 'Atif', 'ali.atif@ievo.co.in', 'employee', 1, 0),
    ('Jatin_K', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Jatin', 'K', 'jatin.kumawat105204@gmail.com', 'employee', 1, 0),
    ('Ravi_Asari', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Ravi', 'Asari', 'ravi.asari@ievo.co.in', 'employee', 1, 1)
) AS v(username, password_hash, first_name, last_name, email, user_type, is_active, must_change_password)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.auth_users u
    WHERE u.username = v.username
);

INSERT INTO dbo.auth_users
(username, password_hash, first_name, last_name, email, user_type, is_active, must_change_password)
SELECT
    v.username, v.password_hash, v.first_name, v.last_name, v.email, v.user_type, v.is_active, v.must_change_password
FROM (
    VALUES
    ('Testuser2', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test', 'User2', 'testuser2@gmail.com', 'employee', 1, 1)
) AS v(username, password_hash, first_name, last_name, email, user_type, is_active, must_change_password)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.auth_users u
    WHERE u.username = v.username
);


-- Scratch query removed here — it referenced an unfilled <that_id>
-- placeholder and isn't valid SQL; leaving it in broke every fresh run of
-- this script (a syntax error anywhere in a batch aborts the whole batch,
-- so nothing above it executed either). Original, for reference:
--   SELECT p.user_id, u.username, p.participant_type, p.is_deleted
--   FROM comm_participants p
--   INNER JOIN auth_users u ON u.user_id = p.user_id
--   WHERE p.conversation_id = <some conversation id>


-- ============================================================
-- I.EVO ERP — Project Management Module — MSSQL Schema Additions
-- Run this AFTER your existing schema.mssql.sql (dept_master,
-- auth_users, comm_* tables must already exist).
--
-- This script ONLY adds the new pm_* tables — nothing here
-- touches dept_master / auth_users / comm_* tables.
--
-- Usage: run against your existing ievo_erp database, e.g.
--   sqlcmd -S localhost -d ievo_erp -i schema.pm.mssql.sql
-- (Adjust the database name if yours differs — no database-
-- qualified names are used below so this runs in whatever
-- database context you connect with.)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- pm_projects
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_projects', 'U') IS NULL
CREATE TABLE dbo.pm_projects (
    project_id    int IDENTITY(1,1) NOT NULL,
    name          nvarchar(200)  COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description   nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    planned_start date NULL,
    planned_end   date NULL,
    status        varchar(30)   COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Planning' NOT NULL,
    owner_id      uniqueidentifier NOT NULL,
    dept_id       int NULL,
    is_deleted    bit DEFAULT 0 NOT NULL,
    created_by    uniqueidentifier NOT NULL,
    created_at    datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    modified_at   datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_projects PRIMARY KEY (project_id),
    CONSTRAINT FK_pm_projects_owner   FOREIGN KEY (owner_id)   REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_pm_projects_dept    FOREIGN KEY (dept_id)    REFERENCES dbo.dept_master(dept_id),
    CONSTRAINT FK_pm_projects_created FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_projects_status')
ALTER TABLE dbo.pm_projects WITH NOCHECK ADD CONSTRAINT CK_pm_projects_status
    CHECK (status IN ('Planning','Active','On Hold','Completed','Cancelled'));

-- ────────────────────────────────────────────────────────────
-- pm_members
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_members', 'U') IS NULL
CREATE TABLE dbo.pm_members (
    project_id int NOT NULL,
    user_id    uniqueidentifier NOT NULL,
    role       varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Member' NOT NULL,
    added_at   datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_members PRIMARY KEY (project_id, user_id),
    CONSTRAINT FK_pm_members_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_members_user    FOREIGN KEY (user_id)    REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_members_role')
ALTER TABLE dbo.pm_members WITH NOCHECK ADD CONSTRAINT CK_pm_members_role
    CHECK (role IN ('Manager','Member','Viewer'));

-- ────────────────────────────────────────────────────────────
-- pm_phases
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_phases', 'U') IS NULL
CREATE TABLE dbo.pm_phases (
    phase_id        int IDENTITY(1,1) NOT NULL,
    project_id      int NOT NULL,
    name            nvarchar(200)  COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description     nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    display_order   int DEFAULT 0 NOT NULL,
    planned_start   date NULL,
    planned_end     date NULL,
    dept_id         int NULL,
    status          varchar(30) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'To Do' NOT NULL,
    status_override bit DEFAULT 0 NOT NULL,
    is_deleted      bit DEFAULT 0 NOT NULL,
    created_at      datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    -- weightage — this Phase's share (0-100) of its parent Project's
    -- progress. Same contract as pm_activities.weightage: required going
    -- forward, and a Project's progress is always the weighted sum of its
    -- Phases' own progress (see progressService.weightedProgress).
    weightage       decimal(5,2) NULL,
    CONSTRAINT PK_pm_phases PRIMARY KEY (phase_id),
    CONSTRAINT FK_pm_phases_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_phases_dept    FOREIGN KEY (dept_id)    REFERENCES dbo.dept_master(dept_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_phases_status')
ALTER TABLE dbo.pm_phases WITH NOCHECK ADD CONSTRAINT CK_pm_phases_status
    CHECK (status IN ('Blocked','To Do','In Progress','Completed'));

-- Phase-level membership (optional — inherits project role if no row exists)
IF OBJECT_ID('dbo.pm_phase_members', 'U') IS NULL
CREATE TABLE dbo.pm_phase_members (
    phase_id int NOT NULL,
    user_id  uniqueidentifier NOT NULL,
    role     varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Member' NOT NULL,
    added_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_phase_members PRIMARY KEY (phase_id, user_id),
    CONSTRAINT FK_pm_phase_members_phase FOREIGN KEY (phase_id) REFERENCES dbo.pm_phases(phase_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_phase_members_user  FOREIGN KEY (user_id)  REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_phase_members_role')
ALTER TABLE dbo.pm_phase_members WITH NOCHECK ADD CONSTRAINT CK_pm_phase_members_role
    CHECK (role IN ('Manager','Member','Viewer'));

-- ────────────────────────────────────────────────────────────
-- pm_phase_deps  (self-referencing FKs both ON DELETE CASCADE
-- would cause "multiple cascade paths" — second FK uses NO ACTION)
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_phase_deps', 'U') IS NULL
CREATE TABLE dbo.pm_phase_deps (
    phase_id            int NOT NULL,
    depends_on_phase_id int NOT NULL,
    created_at          datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_phase_deps PRIMARY KEY (phase_id, depends_on_phase_id),
    CONSTRAINT FK_pm_phase_deps_phase     FOREIGN KEY (phase_id)            REFERENCES dbo.pm_phases(phase_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_phase_deps_dependson FOREIGN KEY (depends_on_phase_id) REFERENCES dbo.pm_phases(phase_id) ON DELETE NO ACTION
);

-- ────────────────────────────────────────────────────────────
-- pm_activities
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_activities', 'U') IS NULL
CREATE TABLE dbo.pm_activities (
    activity_id     int IDENTITY(1,1) NOT NULL,
    phase_id        int NOT NULL,
    name            nvarchar(200)  COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description     nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    display_order   int DEFAULT 0 NOT NULL,
    planned_start   date NULL,
    planned_end     date NULL,
    owner_id        uniqueidentifier NULL,
    dept_id         int NULL,
    status          varchar(30) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'To Do' NOT NULL,
    status_override bit DEFAULT 0 NOT NULL,
    is_deleted      bit DEFAULT 0 NOT NULL,
    created_at      datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    -- weightage — this Activity's share (1-100) of its parent Phase's
    -- progress. New activities always require a value; NULL is retained
    -- only for legacy rows created before weightage existed.
    weightage       decimal(5,2) NULL,
    CONSTRAINT PK_pm_activities PRIMARY KEY (activity_id),
    CONSTRAINT FK_pm_activities_phase FOREIGN KEY (phase_id) REFERENCES dbo.pm_phases(phase_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_activities_owner FOREIGN KEY (owner_id) REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_pm_activities_dept  FOREIGN KEY (dept_id)  REFERENCES dbo.dept_master(dept_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_activities_status')
ALTER TABLE dbo.pm_activities WITH NOCHECK ADD CONSTRAINT CK_pm_activities_status
    CHECK (status IN ('Blocked','To Do','In Progress','Completed'));

IF OBJECT_ID('dbo.pm_activity_deps', 'U') IS NULL
CREATE TABLE dbo.pm_activity_deps (
    activity_id            int NOT NULL,
    depends_on_activity_id int NOT NULL,
    created_at             datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_activity_deps PRIMARY KEY (activity_id, depends_on_activity_id),
    CONSTRAINT FK_pm_activity_deps_activity   FOREIGN KEY (activity_id)            REFERENCES dbo.pm_activities(activity_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_activity_deps_dependson  FOREIGN KEY (depends_on_activity_id) REFERENCES dbo.pm_activities(activity_id) ON DELETE NO ACTION
);

-- ────────────────────────────────────────────────────────────
-- pm_tasks
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_tasks', 'U') IS NULL
CREATE TABLE dbo.pm_tasks (
    task_id         int IDENTITY(1,1) NOT NULL,
    activity_id     int NOT NULL,
    name            nvarchar(200)  COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description     nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    priority        varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Medium' NOT NULL,
    status          varchar(30) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'To Do' NOT NULL,
    due_date        date NULL,
    estimated_hours decimal(5,1) NULL,
    is_deleted      bit DEFAULT 0 NOT NULL,
    created_by      uniqueidentifier NULL,
    created_at      datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_tasks PRIMARY KEY (task_id),
    CONSTRAINT FK_pm_tasks_activity FOREIGN KEY (activity_id) REFERENCES dbo.pm_activities(activity_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_tasks_created  FOREIGN KEY (created_by)  REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_tasks_priority')
ALTER TABLE dbo.pm_tasks WITH NOCHECK ADD CONSTRAINT CK_pm_tasks_priority
    CHECK (priority IN ('Low','Medium','High','Critical'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_tasks_status')
ALTER TABLE dbo.pm_tasks WITH NOCHECK ADD CONSTRAINT CK_pm_tasks_status
    CHECK (status IN ('To Do','In Progress','In Review','Done','Blocked'));

IF OBJECT_ID('dbo.pm_task_assignees', 'U') IS NULL
CREATE TABLE dbo.pm_task_assignees (
    task_id     int NOT NULL,
    user_id     uniqueidentifier NOT NULL,
    assigned_at datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_task_assignees PRIMARY KEY (task_id, user_id),
    CONSTRAINT FK_pm_task_assignees_task FOREIGN KEY (task_id) REFERENCES dbo.pm_tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_task_assignees_user FOREIGN KEY (user_id) REFERENCES dbo.auth_users(user_id)
);

IF OBJECT_ID('dbo.pm_task_deps', 'U') IS NULL
CREATE TABLE dbo.pm_task_deps (
    task_id            int NOT NULL,
    depends_on_task_id int NOT NULL,
    created_at         datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_task_deps PRIMARY KEY (task_id, depends_on_task_id),
    CONSTRAINT FK_pm_task_deps_task       FOREIGN KEY (task_id)            REFERENCES dbo.pm_tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_task_deps_dependson  FOREIGN KEY (depends_on_task_id) REFERENCES dbo.pm_tasks(task_id) ON DELETE NO ACTION
);

-- ────────────────────────────────────────────────────────────
-- pm_audit_log
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_audit_log', 'U') IS NULL
CREATE TABLE dbo.pm_audit_log (
    id            int IDENTITY(1,1) NOT NULL,
    entity_type   varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    entity_id     int NOT NULL,
    project_id    int NULL,
    user_id       uniqueidentifier NULL,
    action        varchar(60) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    field_changed varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    old_value     nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    new_value     nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    changed_at    datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_audit_log PRIMARY KEY (id),
    CONSTRAINT FK_pm_audit_log_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id),
    CONSTRAINT FK_pm_audit_log_user    FOREIGN KEY (user_id)    REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_audit_log_entity_type')
ALTER TABLE dbo.pm_audit_log WITH NOCHECK ADD CONSTRAINT CK_pm_audit_log_entity_type
    CHECK (entity_type IN ('project','phase','activity','task'));

-- ────────────────────────────────────────────────────────────
-- pm_project_insights — per-project OVERRIDES to the Analytics catalog's
-- default visibility (see insightsService.js's CATALOG, each entry marked
-- `default: true/false`). A project with no rows here shows exactly the
-- catalog's own defaults (the original fixed sections — Progress by Phase,
-- Task Status, etc.) with the optional ones (Cumulative Flow, Cycle Time,
-- etc.) hidden. A row EITHER hides a default OR shows an optional — the
-- `visible` bit is what makes both directions the same mechanism, so
-- removing a "default" section and re-adding an "optional" one go through
-- identical code, and a removed default reappears in the "+ Add Insight"
-- picker exactly like any other not-currently-visible catalog entry.
-- Nothing about an insight's actual DATA lives here — every widget is
-- computed fresh on read, same "never stored" philosophy as progress/delay
-- elsewhere in this module.
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_project_insights', 'U') IS NULL
CREATE TABLE dbo.pm_project_insights (
    id            int IDENTITY(1,1) NOT NULL,
    project_id    int NOT NULL,
    insight_type  varchar(40) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    visible       bit NOT NULL,
    display_order int DEFAULT 0 NOT NULL,
    changed_by    uniqueidentifier NULL,
    changed_at    datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_project_insights PRIMARY KEY (id),
    CONSTRAINT FK_pm_project_insights_project FOREIGN KEY (project_id) REFERENCES dbo.pm_projects(project_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_project_insights_user FOREIGN KEY (changed_by) REFERENCES dbo.auth_users(user_id),
    CONSTRAINT UQ_pm_project_insights UNIQUE (project_id, insight_type)
);

-- Migration for an already-created pm_project_insights table from before
-- the `visible` bit existed (back when a row's mere presence meant "added",
-- with no way to represent "hide a default"). Existing rows under that old
-- model always meant "shown", so they backfill to visible=1. Each step is
-- guarded so this is safe to run against either the old shape, the new
-- shape, or a table that doesn't exist yet at all.
IF OBJECT_ID('dbo.pm_project_insights', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_project_insights') AND name = 'visible')
ALTER TABLE dbo.pm_project_insights ADD visible bit NOT NULL CONSTRAINT DF_pm_project_insights_visible DEFAULT 1;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_project_insights') AND name = 'added_by')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_project_insights') AND name = 'changed_by')
EXEC sp_rename 'dbo.pm_project_insights.added_by', 'changed_by', 'COLUMN';

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_project_insights') AND name = 'added_at')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_project_insights') AND name = 'changed_at')
EXEC sp_rename 'dbo.pm_project_insights.added_at', 'changed_at', 'COLUMN';


-- ────────────────────────────────────────────────────────────
-- Indexes (mirrors the PostgreSQL schema's index section)
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_phases_project')
CREATE INDEX IX_pm_phases_project ON dbo.pm_phases(project_id) WHERE is_deleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_activities_phase')
CREATE INDEX IX_pm_activities_phase ON dbo.pm_activities(phase_id) WHERE is_deleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_tasks_activity')
CREATE INDEX IX_pm_tasks_activity ON dbo.pm_tasks(activity_id) WHERE is_deleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_audit_log_project')
CREATE INDEX IX_pm_audit_log_project ON dbo.pm_audit_log(project_id, changed_at DESC);










-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: remove archived_at / is_archived from comm_participants
--            and ensure left_at / joined_at / rejoined_at exist
--
-- Compatible with SSMS, sqlcmd, mssql Node driver (.batch()), Azure Data Studio
-- No GO statements — uses EXEC for dynamic DDL, all in a single batch.
-- Safe to re-run; every step is guarded by IF EXISTS / IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: drop DEFAULT constraint on is_archived (must go before DROP COLUMN)
DECLARE @df1 SYSNAME;
SELECT @df1 = dc.name
FROM   sys.default_constraints dc
JOIN   sys.columns c
       ON dc.parent_object_id = c.object_id
      AND dc.parent_column_id = c.column_id
WHERE  c.object_id = OBJECT_ID('dbo.comm_participants')
  AND  c.name = 'is_archived';
IF @df1 IS NOT NULL
  EXEC('ALTER TABLE dbo.comm_participants DROP CONSTRAINT [' + @df1 + ']');

-- Step 2: drop is_archived column
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'is_archived'
)
  ALTER TABLE dbo.comm_participants DROP COLUMN is_archived;

-- Step 3: drop DEFAULT constraint on archived_at
DECLARE @df2 SYSNAME;
SELECT @df2 = dc.name
FROM   sys.default_constraints dc
JOIN   sys.columns c
       ON dc.parent_object_id = c.object_id
      AND dc.parent_column_id = c.column_id
WHERE  c.object_id = OBJECT_ID('dbo.comm_participants')
  AND  c.name = 'archived_at';
IF @df2 IS NOT NULL
  EXEC('ALTER TABLE dbo.comm_participants DROP CONSTRAINT [' + @df2 + ']');

-- Step 4: drop archived_at column
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'archived_at'
)
  ALTER TABLE dbo.comm_participants DROP COLUMN archived_at;

-- Step 5: add left_at
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'left_at'
)
  ALTER TABLE dbo.comm_participants ADD left_at DATETIMEOFFSET NULL;

-- Step 6: add joined_at
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'joined_at'
)
  ALTER TABLE dbo.comm_participants ADD joined_at DATETIMEOFFSET NULL;

-- Step 7: add rejoined_at
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'rejoined_at'
)
  ALTER TABLE dbo.comm_participants ADD rejoined_at DATETIMEOFFSET NULL;






-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix participant visibility columns
--
-- Run ONCE manually in SSMS or via sqlcmd before deploying the updated
-- messageService.js / groupService.js. Safe to re-run (IF NOT EXISTS guards).
-- No GO statements — compatible with mssql Node driver and sqlcmd alike.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: add left_at if missing
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'left_at'
)
  ALTER TABLE dbo.comm_participants ADD left_at DATETIMEOFFSET NULL;

-- Step 2: add joined_at if missing
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'joined_at'
)
  ALTER TABLE dbo.comm_participants ADD joined_at DATETIMEOFFSET NULL;

-- Step 3: add rejoined_at if missing
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.comm_participants') AND name = 'rejoined_at'
)
  ALTER TABLE dbo.comm_participants ADD rejoined_at DATETIMEOFFSET NULL;

-- Step 4: backfill joined_at for existing rows that have none.
-- Use the conversation's created_at as a conservative floor — this means
-- founding participants can see all messages from the start, which is correct.
UPDATE dbo.comm_participants
SET    joined_at = c.created_at
FROM   dbo.comm_participants p
INNER  JOIN dbo.comm_conversations c ON c.conversation_id = p.conversation_id
WHERE  p.joined_at IS NULL;

-- Step 5: for currently-removed participants (is_deleted = 1) who have no
-- left_at, backfill left_at using the conversation's last_message_at as a
-- best-effort timestamp. This is conservative — they'll see everything up
-- to the last known message before their row was soft-deleted.
-- In practice this only affects rows created before left_at was added.
UPDATE dbo.comm_participants
SET    left_at = c.last_message_at
FROM   dbo.comm_participants p
INNER  JOIN dbo.comm_conversations c ON c.conversation_id = p.conversation_id
WHERE  p.is_deleted = 1 AND p.left_at IS NULL;




-- ============================================================
-- I.EVO ERP — Project Management Module — Migration 002
-- Run AFTER the base schema.mssql.sql (which already created
-- pm_projects, pm_phases, pm_activities, pm_tasks, etc.)
--
-- Adds:
--   1. pm_activity_members  — per-activity roster (selected when
--      creating an activity; task assignees auto-added on accept)
--   2. pm_task_assignment_requests — assignment requests that appear
--      on the user's future Dashboard module (accept / decline)
--   3. Renames task statuses:
--        In Progress  → Ongoing
--        Done         → Complete
--      (removes In Review — three states only: To Do / Ongoing / Complete
--       plus system-managed Blocked)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. pm_activity_members
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_activity_members', 'U') IS NULL
CREATE TABLE dbo.pm_activity_members (
    activity_id int              NOT NULL,
    user_id     uniqueidentifier NOT NULL,
    added_at    datetimeoffset   DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_activity_members   PRIMARY KEY (activity_id, user_id),
    CONSTRAINT FK_pm_act_mem_activity   FOREIGN KEY (activity_id) REFERENCES dbo.pm_activities(activity_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_act_mem_user       FOREIGN KEY (user_id)     REFERENCES dbo.auth_users(user_id)
);

-- ────────────────────────────────────────────────────────────
-- 2. pm_task_assignment_requests
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_task_assignment_requests', 'U') IS NULL
CREATE TABLE dbo.pm_task_assignment_requests (
    request_id    int IDENTITY(1,1) NOT NULL,
    task_id       int              NOT NULL,
    assignee_id   uniqueidentifier NOT NULL,   -- user being requested
    requested_by  uniqueidentifier NOT NULL,   -- project manager who assigned
    status        varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Pending' NOT NULL,
    responded_at  datetimeoffset NULL,
    created_at    datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_task_req       PRIMARY KEY (request_id),
    CONSTRAINT UQ_pm_task_req       UNIQUE (task_id, assignee_id),   -- one pending/accepted per task per user
    CONSTRAINT FK_pm_task_req_task  FOREIGN KEY (task_id)      REFERENCES dbo.pm_tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_task_req_user  FOREIGN KEY (assignee_id)  REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_pm_task_req_reqby FOREIGN KEY (requested_by) REFERENCES dbo.auth_users(user_id)
);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_task_req_status')
ALTER TABLE dbo.pm_task_assignment_requests WITH NOCHECK
    ADD CONSTRAINT CK_pm_task_req_status CHECK (status IN ('Pending','Accepted','Declined'));

-- ────────────────────────────────────────────────────────────
-- 3. Task status rename: In Progress→Ongoing, Done→Complete
--    Drop the old check constraint and recreate it with the new values.
--    Migrate any existing rows first so the constraint can be enabled.
-- ────────────────────────────────────────────────────────────

-- 3a. Migrate existing data
UPDATE dbo.pm_tasks SET status = 'Ongoing'   WHERE status = 'In Progress';
UPDATE dbo.pm_tasks SET status = 'Complete'  WHERE status = 'Done';
UPDATE dbo.pm_tasks SET status = 'Ongoing'   WHERE status = 'In Review';  -- reclassify

-- 3b. Drop old constraint
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_tasks_status')
    ALTER TABLE dbo.pm_tasks DROP CONSTRAINT CK_pm_tasks_status;

-- 3c. Add new constraint
ALTER TABLE dbo.pm_tasks WITH NOCHECK
    ADD CONSTRAINT CK_pm_tasks_status
    CHECK (status IN ('To Do','Ongoing','Complete','Blocked'));

-- 3d. Validate (enable CHECK)
ALTER TABLE dbo.pm_tasks WITH CHECK CHECK CONSTRAINT CK_pm_tasks_status;

-- ────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_task_req_assignee')
    CREATE INDEX IX_pm_task_req_assignee
        ON dbo.pm_task_assignment_requests(assignee_id, status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_act_members_activity')
    CREATE INDEX IX_pm_act_members_activity
        ON dbo.pm_activity_members(activity_id);













-- ============================================================
-- I.EVO ERP — Project Management — Members & Chat-Linking
-- ============================================================
-- Run this AFTER schema.mssql.sql (including the pm_* additions
-- block at the bottom of that file) has already been applied.
--
-- This version deliberately avoids GO batch separators. GO is not
-- real T-SQL — it's a convention specific tools (SSMS, sqlcmd, Azure
-- Data Studio) parse client-side and strip before sending anything
-- to the server. Not every client does that (DataGrip's console, a
-- raw JDBC/ODBC connection, this project's own migration runner if
-- it ever gets one) — sent as-is, the server sees the literal word
-- GO and throws a syntax error, which is exactly what happened here.
--
-- Instead, every statement that needs to see a column a previous
-- statement just added is wrapped in dynamic SQL (EXEC(N'...')).
-- Dynamic SQL is parsed at the moment it executes, not when the
-- whole script is compiled — so it always sees current, live
-- metadata, with zero dependence on batch boundaries. This is safe
-- to paste into any SQL client and just run top to bottom, or to
-- run statement-by-statement, or as a full script — all give the
-- same result.
--
-- This migration was written after confirming against the live
-- DB's ER diagram that pm_activity_members and
-- pm_task_assignment_requests do NOT exist yet, even though
-- activityService.js / taskService.js already query them. Those
-- two tables are created here for the first time — this is not
-- a "re-sync the schema file" script, it is a real schema change.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- pm_activity_members: create table if missing (bare — role added next)
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_activity_members', 'U') IS NULL
CREATE TABLE dbo.pm_activity_members (
    activity_id int NOT NULL,
    user_id     uniqueidentifier NOT NULL,
    added_at    datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_activity_members PRIMARY KEY (activity_id, user_id),
    CONSTRAINT FK_pm_activity_members_activity FOREIGN KEY (activity_id) REFERENCES dbo.pm_activities(activity_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_activity_members_user     FOREIGN KEY (user_id)     REFERENCES dbo.auth_users(user_id)
);

-- Add role column if missing (self-healing: covers the table already
-- existing on this server, from an earlier attempt or manually, without one)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_activity_members') AND name = 'role')
ALTER TABLE dbo.pm_activity_members ADD role varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;

-- Everything below this point references the role column above, so it
-- runs via dynamic SQL — parsed fresh at execution time, always seeing
-- the column that was just added, regardless of client batching.
--
-- Manager  = manage the activity + its member roster (CSV: "Manage Activity/Members")
-- Employee = update tasks/status inside the activity      (CSV: "Update Tasks/Status")
-- Viewer   = read only
EXEC(N'UPDATE dbo.pm_activity_members SET role = ''Employee'' WHERE role IS NULL');
EXEC(N'ALTER TABLE dbo.pm_activity_members ALTER COLUMN role varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL');

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_activity_members_role')
EXEC(N'ALTER TABLE dbo.pm_activity_members WITH NOCHECK ADD CONSTRAINT CK_pm_activity_members_role
    CHECK (role IN (''Manager'',''Employee'',''Viewer''))');

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc
               INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
               WHERE dc.parent_object_id = OBJECT_ID('dbo.pm_activity_members') AND c.name = 'role')
EXEC(N'ALTER TABLE dbo.pm_activity_members ADD CONSTRAINT DF_pm_activity_members_role DEFAULT ''Employee'' FOR role');

-- ────────────────────────────────────────────────────────────
-- pm_phase_members role vocabulary alignment.
-- pm_members (project-level) already has its own 'role' column —
-- that one is untouched by this migration. This section is about
-- pm_phase_members, a DIFFERENT table, which may exist on this
-- server without a role column at all, or with one already using
-- ('Manager','Member','Viewer'). Either way, we end up with
-- role IN ('Manager','Employee','Viewer'), matching the Phase row
-- of the CSV and pm_activity_members' vocabulary above.
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_phase_members') AND name = 'role')
ALTER TABLE dbo.pm_phase_members ADD role varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;

EXEC(N'UPDATE dbo.pm_phase_members SET role = ''Employee'' WHERE role IS NULL OR role = ''Member''');
EXEC(N'ALTER TABLE dbo.pm_phase_members ALTER COLUMN role varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL');

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_phase_members_role')
EXEC(N'ALTER TABLE dbo.pm_phase_members DROP CONSTRAINT CK_pm_phase_members_role');

EXEC(N'ALTER TABLE dbo.pm_phase_members WITH NOCHECK ADD CONSTRAINT CK_pm_phase_members_role
    CHECK (role IN (''Manager'',''Employee'',''Viewer''))');

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc
               INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
               WHERE dc.parent_object_id = OBJECT_ID('dbo.pm_phase_members') AND c.name = 'role')
EXEC(N'ALTER TABLE dbo.pm_phase_members ADD CONSTRAINT DF_pm_phase_members_role DEFAULT ''Employee'' FOR role');

-- ────────────────────────────────────────────────────────────
-- pm_task_assignment_requests
-- taskService.js already implements the full accept/decline flow
-- against this table (createTask, getMyAssignmentRequests,
-- acceptAssignmentRequest, declineAssignmentRequest,
-- sendAssignmentRequest, removeAssignmentRequest) — it is simply
-- missing from the database. Created here to match exactly what
-- that service already expects. (No column-ordering issue here —
-- it's a single CREATE TABLE with everything already on it, so no
-- dynamic SQL needed.)
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_task_assignment_requests', 'U') IS NULL
CREATE TABLE dbo.pm_task_assignment_requests (
    request_id   int IDENTITY(1,1) NOT NULL,
    task_id      int NOT NULL,
    assignee_id  uniqueidentifier NOT NULL,
    requested_by uniqueidentifier NOT NULL,
    status       varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Pending' NOT NULL,
    created_at   datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    responded_at datetimeoffset NULL,
    CONSTRAINT PK_pm_task_assignment_requests PRIMARY KEY (request_id),
    CONSTRAINT UQ_pm_task_assignment_requests UNIQUE (task_id, assignee_id),
    CONSTRAINT FK_pm_tar_task         FOREIGN KEY (task_id)      REFERENCES dbo.pm_tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_tar_assignee     FOREIGN KEY (assignee_id)  REFERENCES dbo.auth_users(user_id),
    CONSTRAINT FK_pm_tar_requestedby  FOREIGN KEY (requested_by) REFERENCES dbo.auth_users(user_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_tar_status')
ALTER TABLE dbo.pm_task_assignment_requests WITH NOCHECK ADD CONSTRAINT CK_pm_tar_status
    CHECK (status IN ('Pending','Accepted','Declined'));

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_tar_assignee_status')
CREATE INDEX IX_pm_tar_assignee_status ON dbo.pm_task_assignment_requests(assignee_id, status);

-- ────────────────────────────────────────────────────────────
-- pm_task_threads / pm_activity_threads
-- Link tables tying a Task or Activity to exactly one auto-
-- managed comm_conversations row. Kept separate from the
-- generic comm_groups concept — these threads are system-
-- managed (membership auto-syncs to assignment state), not
-- user-curated groups.
--   Task thread     → comm_conversations.conv_type = 'cc'          ("Shared")
--   Activity thread → comm_conversations.conv_type = 'group_thread' with group_id = NULL
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_task_threads', 'U') IS NULL
CREATE TABLE dbo.pm_task_threads (
    task_id         int NOT NULL,
    conversation_id int NOT NULL,
    created_at      datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_task_threads PRIMARY KEY (task_id),
    CONSTRAINT UQ_pm_task_threads_conv UNIQUE (conversation_id),
    CONSTRAINT FK_pm_task_threads_task FOREIGN KEY (task_id)         REFERENCES dbo.pm_tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_task_threads_conv FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id)
);

IF OBJECT_ID('dbo.pm_activity_threads', 'U') IS NULL
CREATE TABLE dbo.pm_activity_threads (
    activity_id     int NOT NULL,
    conversation_id int NOT NULL,
    created_at      datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_pm_activity_threads PRIMARY KEY (activity_id),
    CONSTRAINT UQ_pm_activity_threads_conv UNIQUE (conversation_id),
    CONSTRAINT FK_pm_activity_threads_activity FOREIGN KEY (activity_id)     REFERENCES dbo.pm_activities(activity_id) ON DELETE CASCADE,
    CONSTRAINT FK_pm_activity_threads_conv     FOREIGN KEY (conversation_id) REFERENCES dbo.comm_conversations(conversation_id)
);

-- ────────────────────────────────────────────────────────────
-- Backfill: seed pm_activity_members with a Manager row for every
-- activity's existing owner_id, so effective-role lookups have a
-- starting point immediately after migration. Dynamic SQL again,
-- since it depends on the role column added earlier in this script.
-- ────────────────────────────────────────────────────────────
EXEC(N'
INSERT INTO dbo.pm_activity_members (activity_id, user_id, role)
SELECT a.activity_id, a.owner_id, ''Manager''
FROM dbo.pm_activities a
WHERE a.owner_id IS NOT NULL
  AND a.is_deleted = 0
  AND NOT EXISTS (
    SELECT 1 FROM dbo.pm_activity_members m
    WHERE m.activity_id = a.activity_id AND m.user_id = a.owner_id
  )');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_activity_members_user')
CREATE INDEX IX_pm_activity_members_user ON dbo.pm_activity_members(user_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pm_phase_members_user')
CREATE INDEX IX_pm_phase_members_user ON dbo.pm_phase_members(user_id);

-- ────────────────────────────────────────────────────────────
-- is_active — soft-deactivation, distinct from is_deleted. A Project/
-- Phase/Activity/Task with children still under it gets deactivated
-- (is_active=0) instead of hard-soft-deleted, preserving its workflow
-- status underneath. Cascades to descendants at READ time (see
-- phaseService/activityService/taskService), the same technique
-- already used for cascaded 'Blocked' status.
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_projects') AND name = 'is_active')
    ALTER TABLE dbo.pm_projects ADD is_active BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_phases') AND name = 'is_active')
    ALTER TABLE dbo.pm_phases ADD is_active BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_activities') AND name = 'is_active')
    ALTER TABLE dbo.pm_activities ADD is_active BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_tasks') AND name = 'is_active')
    ALTER TABLE dbo.pm_tasks ADD is_active BIT NOT NULL DEFAULT 1;

-- ────────────────────────────────────────────────────────────
-- pm_activities.weightage — see the column comment on the CREATE TABLE
-- above (this is the same column, added here for databases that already
-- had pm_activities before this feature existed).
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_activities') AND name = 'weightage')
    ALTER TABLE dbo.pm_activities ADD weightage decimal(5,2) NULL;
-- 0% is not valid: it would allow unlimited zero-weight Activities. Convert
-- any pre-existing 0 values to legacy NULL before strengthening the check.
UPDATE dbo.pm_activities SET weightage = NULL WHERE weightage = 0;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_activities_weightage')
    ALTER TABLE dbo.pm_activities DROP CONSTRAINT CK_pm_activities_weightage;
ALTER TABLE dbo.pm_activities WITH CHECK ADD CONSTRAINT CK_pm_activities_weightage
    CHECK (weightage IS NULL OR (weightage >= 1 AND weightage <= 100));

-- ────────────────────────────────────────────────────────────
-- pm_phases.weightage — see the column comment on the CREATE TABLE above
-- (this is the same column, added here for databases that already had
-- pm_phases before this feature existed). Same contract as
-- pm_activities.weightage above, one level up: a Phase's share (1-100) of
-- its Project's progress.
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_phases') AND name = 'weightage')
    ALTER TABLE dbo.pm_phases ADD weightage decimal(5,2) NULL;
UPDATE dbo.pm_phases SET weightage = NULL WHERE weightage = 0;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_pm_phases_weightage')
    ALTER TABLE dbo.pm_phases DROP CONSTRAINT CK_pm_phases_weightage;
ALTER TABLE dbo.pm_phases WITH CHECK ADD CONSTRAINT CK_pm_phases_weightage
    CHECK (weightage IS NULL OR (weightage >= 1 AND weightage <= 100));
-- ────────────────────────────────────────────────────────────
-- pm_tasks.start_date — explicit planned start, distinct from created_at
-- (when the row was inserted) and due_date (when it's due). The Timeline
-- view previously used created_at as a task's bar-start, which made a
-- task's bar render starting on whatever day it happened to be created
-- rather than when it was actually meant to begin — this column lets a
-- user set that intentionally, same as Phase/Activity plannedStart.
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_tasks') AND name = 'start_date')
    ALTER TABLE dbo.pm_tasks ADD start_date date NULL;

-- ────────────────────────────────────────────────────────────
-- org_groups / org_group_members — admin-managed, org-wide "distribution
-- list" style groups (e.g. "Production Team"), distinct from comm_groups
-- (user-created CHAT groups with their own conversation thread). An org
-- group has no conversation of its own — it exists purely as a named,
-- reusable set of users, created/managed by admins only, visible to
-- everyone, and used as a quick way to add many recipients at once in the
-- New Message composer (selecting one immediately expands to its member
-- users as individual recipient chips — same behavior as a Gmail contact
-- group/label, not a persistent group entity in the sent message).
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.org_groups', 'U') IS NULL
CREATE TABLE dbo.org_groups (
    org_group_id  int IDENTITY(1,1) NOT NULL,
    name          nvarchar(150) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description   nvarchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    created_by    uniqueidentifier NOT NULL,
    is_active     bit DEFAULT 1 NOT NULL,
    created_at    datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_org_groups PRIMARY KEY (org_group_id),
    CONSTRAINT FK_org_groups_createdby FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id)
);

IF OBJECT_ID('dbo.org_group_members', 'U') IS NULL
CREATE TABLE dbo.org_group_members (
    org_group_id int NOT NULL,
    user_id      uniqueidentifier NOT NULL,
    added_at     datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    CONSTRAINT PK_org_group_members PRIMARY KEY (org_group_id, user_id),
    CONSTRAINT FK_org_group_members_group FOREIGN KEY (org_group_id) REFERENCES dbo.org_groups(org_group_id) ON DELETE CASCADE,
    CONSTRAINT FK_org_group_members_user  FOREIGN KEY (user_id)      REFERENCES dbo.auth_users(user_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- pm_project_templates / pm_template_phases / pm_template_activities /
-- pm_template_tasks — admin-curated reusable project skeletons (Phase →
-- Activity → Task), instantiated into a real project on demand.
--
-- No absolute dates exist yet at the template level — every phase/activity
-- stores its start as an OFFSET (in days) from its own parent's computed
-- start, plus a duration (or, for tasks, a due-offset from the activity's
-- start). templateService.instantiateTemplate resolves these to real
-- planned_start/planned_end values once a real project (with a real
-- planned_start) exists, then creates each row through the SAME
-- phaseService.createPhase / activityService.createActivity /
-- taskService.createTask functions every other code path uses — so all
-- existing validation/audit/status logic runs unchanged; these four tables
-- only ever describe the blueprint, never touch pm_phases/pm_activities/
-- pm_tasks directly.
--
-- No dependency junction tables here (unlike pm_phase_deps/pm_activity_deps/
-- pm_task_deps) — template dependencies are a plain sequential chain
-- encoded entirely by display_order (each item auto-depends on the
-- previous one in the same parent, wired via the real addPhaseDep/
-- addActivityDep functions at instantiation time). A project created from
-- a template is a completely ordinary, fully-editable project afterward —
-- arbitrary dependency graphs are edited there, same as any project today.
-- ────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.pm_project_templates', 'U') IS NULL
CREATE TABLE dbo.pm_project_templates (
    template_id  int IDENTITY(1,1) NOT NULL,
    name         nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description  nvarchar(max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    category     nvarchar(50)  COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    is_active    bit DEFAULT 1 NOT NULL,
    created_by   uniqueidentifier NOT NULL,
    created_at   datetimeoffset DEFAULT sysdatetimeoffset() NOT NULL,
    modified_at  datetimeoffset NULL,
    CONSTRAINT PK_pm_project_templates PRIMARY KEY (template_id),
    CONSTRAINT FK_pm_project_templates_createdby FOREIGN KEY (created_by) REFERENCES dbo.auth_users(user_id)
);

IF OBJECT_ID('dbo.pm_template_phases', 'U') IS NULL
CREATE TABLE dbo.pm_template_phases (
    template_phase_id   int IDENTITY(1,1) NOT NULL,
    template_id         int NOT NULL,
    name                nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description         nvarchar(max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    display_order       int NOT NULL DEFAULT 0,
    start_offset_days   int NOT NULL DEFAULT 0,
    duration_days       int NOT NULL,
    -- Whether instantiateTemplate wires this phase to depend on the
    -- previous phase in display_order (see the module comment above and
    -- templateService.js). Admin-editable per phase so a chain link can be
    -- removed without disabling auto-chaining for the whole template.
    depends_on_previous bit NOT NULL DEFAULT 1,
    CONSTRAINT PK_pm_template_phases PRIMARY KEY (template_phase_id),
    CONSTRAINT FK_pm_template_phases_template FOREIGN KEY (template_id) REFERENCES dbo.pm_project_templates(template_id) ON DELETE CASCADE
);

IF OBJECT_ID('dbo.pm_template_activities', 'U') IS NULL
CREATE TABLE dbo.pm_template_activities (
    template_activity_id int IDENTITY(1,1) NOT NULL,
    template_phase_id    int NOT NULL,
    name                  nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description           nvarchar(max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    display_order         int NOT NULL DEFAULT 0,
    start_offset_days     int NOT NULL DEFAULT 0,
    duration_days         int NOT NULL,
    -- Same per-item override as pm_template_phases.depends_on_previous, one
    -- level down (depends on the previous Activity within the same Phase).
    depends_on_previous   bit NOT NULL DEFAULT 1,
    CONSTRAINT PK_pm_template_activities PRIMARY KEY (template_activity_id),
    CONSTRAINT FK_pm_template_activities_phase FOREIGN KEY (template_phase_id) REFERENCES dbo.pm_template_phases(template_phase_id) ON DELETE CASCADE
);

IF OBJECT_ID('dbo.pm_template_tasks', 'U') IS NULL
CREATE TABLE dbo.pm_template_tasks (
    template_task_id     int IDENTITY(1,1) NOT NULL,
    template_activity_id int NOT NULL,
    name                  nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    description           nvarchar(max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    display_order         int NOT NULL DEFAULT 0,
    priority              varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'Medium' NOT NULL,
    due_offset_days       int NOT NULL,
    -- Unlike pm_template_phases/pm_template_activities.depends_on_previous
    -- below, tasks were NEVER auto-chained by instantiateTemplate — every
    -- template task has always been created independent of its siblings.
    -- Defaults to 0 (off) so this stays an OPT-IN per task rather than
    -- silently making every existing template's tasks start blocking each
    -- other the moment this column exists.
    depends_on_previous   bit NOT NULL DEFAULT 0,
    CONSTRAINT PK_pm_template_tasks PRIMARY KEY (template_task_id),
    CONSTRAINT FK_pm_template_tasks_activity FOREIGN KEY (template_activity_id) REFERENCES dbo.pm_template_activities(template_activity_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- pm_template_phases/pm_template_activities.depends_on_previous — lets an
-- admin turn OFF the auto-chain link to the previous sibling for one
-- specific phase/activity in a template, instead of it being an
-- unconditional, all-or-nothing sequential chain (see templateService.js's
-- instantiateTemplate). Defaults to 1 (existing behavior unchanged) for
-- both new installs (in the CREATE TABLE above) and pre-existing databases
-- (this migration, for installs that already had these tables).
--
-- pm_template_tasks.depends_on_previous is the mirror-image default (0/off)
-- — see the column comment above for why: it's introducing chaining that
-- never existed, not exposing an opt-out from chaining that always did.
-- ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_template_phases') AND name = 'depends_on_previous')
    ALTER TABLE dbo.pm_template_phases ADD depends_on_previous BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_template_activities') AND name = 'depends_on_previous')
    ALTER TABLE dbo.pm_template_activities ADD depends_on_previous BIT NOT NULL DEFAULT 1;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.pm_template_tasks') AND name = 'depends_on_previous')
    ALTER TABLE dbo.pm_template_tasks ADD depends_on_previous BIT NOT NULL DEFAULT 0;
 
