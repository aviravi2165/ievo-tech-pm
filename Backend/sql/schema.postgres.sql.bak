
-- I.EVO ERP — Complete PostgreSQL Schema  v2.0
-- Fresh install: psql -d ievo_erp -f schema.postgres.sql
-- Database must exist first: CREATE DATABASE ievo_erp;
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════
-- 1. DEPARTMENT MASTER
--    Must be created before auth_users (FK dependency)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dept_master (
  dept_id    SERIAL        PRIMARY KEY,
  dept_name  VARCHAR(100)  NOT NULL UNIQUE,
  dept_code  VARCHAR(20)   UNIQUE,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed departments — extend to match your CSV dept values exactly
INSERT INTO dept_master (dept_name, dept_code) VALUES
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
ON CONFLICT (dept_name) DO NOTHING;
-- select * from dept_master;
-- TRUNCATE TABLE dept_master CASCADE;
-- ALTER SEQUENCE dept_master_dept_id_seq RESTART WITH 1;

-- ════════════════════════════════════════════════════════════
-- 2. USERS
--    username  = login key (from CSV: username column)
--    mgr_user_id = self-reference — resolved via mgrEmail after
--                  all users are inserted (see migration guide)
--    must_change_password = TRUE for all migrated users so they
--                  are forced to set a new password on first login
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auth_users (
  user_id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  username                    VARCHAR(50)   NOT NULL UNIQUE,
  password_hash               TEXT          NOT NULL,
  first_name                  VARCHAR(100),
  last_name                   VARCHAR(100),
  email                       VARCHAR(150)  UNIQUE,
  phone_number                VARCHAR(20),
  profile_picture             TEXT,
  dept_id                     INT           REFERENCES dept_master(dept_id),
  level                       INT,                          -- seniority level (optional)
  mgr_user_id                 UUID          REFERENCES auth_users(user_id),
  user_type                   VARCHAR(30)   NOT NULL DEFAULT 'employee',
                                            -- 'admin' | 'employee' | 'viewer'
  employee_code               VARCHAR(50),
  is_active                   BOOLEAN       NOT NULL DEFAULT TRUE,
  allow_login                 BOOLEAN       NOT NULL DEFAULT TRUE,
  must_change_password        BOOLEAN       NOT NULL DEFAULT FALSE,
  required_email_notification BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  modified_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

select * from auth_users;
-- ── Test / seed users (password = "password") ────────────────
-- Hash: $2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
INSERT INTO auth_users (username, password_hash, first_name, last_name, email, user_type, is_active, allow_login, must_change_password)
VALUES
  ('admin',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin',  'User', 'admin@ievo.in',   'admin',    TRUE, TRUE, FALSE),
  ('testuser', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test',   'User', 'test@ievo.in',    'employee', TRUE, TRUE, FALSE),
  ('md',       '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Senior', 'MD',   'md@ievo.in',      'viewer',   TRUE, TRUE, FALSE)
ON CONFLICT (username) DO NOTHING;
select* from auth_users;
-- ════════════════════════════════════════════════════════════
-- 3. COMMUNICATION MODULE  (prefix: comm_)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comm_groups (
  group_id    SERIAL        PRIMARY KEY,
  group_name  VARCHAR(150)  NOT NULL,
  description TEXT,
  created_by  UUID          NOT NULL REFERENCES auth_users(user_id),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES auth_users(user_id)
  
);

CREATE TABLE IF NOT EXISTS comm_group_hidden (
  group_id  INT         NOT NULL REFERENCES comm_groups(group_id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth_users(user_id)   ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);



CREATE TABLE IF NOT EXISTS comm_group_members (
  group_id    INT           NOT NULL REFERENCES comm_groups(group_id)  ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES auth_users(user_id)    ON DELETE CASCADE,
  added_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id),
  is_co_admin BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS comm_conversations (
  conversation_id SERIAL        PRIMARY KEY,
  subject         VARCHAR(300)  NOT NULL,
  allow_reply     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      UUID          NOT NULL REFERENCES auth_users(user_id),
  group_id        INT           REFERENCES comm_groups(group_id),
  is_deleted      BOOLEAN       NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  conv_type VARCHAR(20) NOT NULL DEFAULT 'bcc' CHECK (conv_type IN ('bcc','cc','group_thread')),
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES auth_users(user_id);
);



CREATE TABLE IF NOT EXISTS comm_participants (
  participant_id   SERIAL        PRIMARY KEY,
  conversation_id  INT           NOT NULL REFERENCES comm_conversations(conversation_id),
  user_id          UUID          NOT NULL REFERENCES auth_users(user_id),
  participant_type VARCHAR(10)   NOT NULL DEFAULT 'to'
                   CHECK (participant_type IN ('to','cc','bcc')),
  is_archived      BOOLEAN       NOT NULL DEFAULT FALSE,
  is_deleted       BOOLEAN       NOT NULL DEFAULT FALSE,
  joined_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id),
  archived_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ
);

 -- ════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════



CREATE TABLE IF NOT EXISTS comm_messages (
  message_id        SERIAL        PRIMARY KEY,
  conversation_id   INT           NOT NULL REFERENCES comm_conversations(conversation_id),
  sender_id         UUID          NOT NULL REFERENCES auth_users(user_id),
  parent_message_id INT           REFERENCES comm_messages(message_id),
  body_html         TEXT          NOT NULL,
  is_deleted        BOOLEAN       NOT NULL DEFAULT FALSE,
  sent_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_attachments (
  attachment_id SERIAL        PRIMARY KEY,
  message_id    INT           REFERENCES comm_messages(message_id),
  uploaded_by   UUID          NOT NULL REFERENCES auth_users(user_id),
  original_name VARCHAR(500)  NOT NULL,
  stored_name   VARCHAR(500)  NOT NULL,
  storage_path  VARCHAR(500)  NOT NULL,
  mime_type     VARCHAR(100)  NOT NULL,
  file_size     BIGINT        NOT NULL,
  is_deleted    BOOLEAN       NOT NULL DEFAULT FALSE,
  uploaded_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_read_receipts (
  message_id INT          NOT NULL REFERENCES comm_messages(message_id),
  user_id    UUID         NOT NULL REFERENCES auth_users(user_id),
  read_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);


CREATE TABLE IF NOT EXISTS comm_conversation_hidden (
  conversation_id INT         NOT NULL REFERENCES comm_conversations(conversation_id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth_users(user_id)   ON DELETE CASCADE,
  hidden_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);


-- Auth
CREATE INDEX IF NOT EXISTS idx_auth_users_username   ON auth_users(username);
CREATE INDEX IF NOT EXISTS idx_auth_users_email      ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_auth_users_dept       ON auth_users(dept_id);
CREATE INDEX IF NOT EXISTS idx_auth_users_mgr        ON auth_users(mgr_user_id);

-- Dept
CREATE INDEX IF NOT EXISTS idx_dept_master_name      ON dept_master(dept_name);

-- Communication
CREATE INDEX IF NOT EXISTS idx_comm_participants_user ON comm_participants(user_id, is_archived, is_deleted);
CREATE INDEX IF NOT EXISTS idx_comm_messages_conv ON comm_messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_comm_read_user ON comm_read_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_conv_hidden_user ON comm_conversation_hidden(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_conv_hidden_conv ON comm_conversation_hidden(conversation_id);