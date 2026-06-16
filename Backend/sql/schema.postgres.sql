CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════
-- 1. DEPARTMENT MASTER
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dept_master (
  dept_id    SERIAL        PRIMARY KEY,
  dept_name  VARCHAR(100)  NOT NULL UNIQUE,
  dept_code  VARCHAR(20)   UNIQUE,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed departments 
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


-- ════════════════════════════════════════════════════════════
-- 2. USERS
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

-- ── Test / seed users (password = "password") ────────────────
-- Hash: $2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
INSERT INTO auth_users (username, password_hash, first_name, last_name, email, user_type, is_active, allow_login, must_change_password)
VALUES
  ('admin',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin',  'User', 'admin@ievo.in',   'admin',    TRUE, TRUE, FALSE),
  ('testuser', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test',   'User', 'test@ievo.in',    'employee', TRUE, TRUE, FALSE),
  ('md',       '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Senior', 'MD',   'md@ievo.in',      'viewer',   TRUE, TRUE, FALSE)
ON CONFLICT (username) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 3. COMMUNICATION MODULE  (prefix: comm_)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comm_groups (
  group_id    SERIAL        PRIMARY KEY,
  group_name  VARCHAR(150)  NOT NULL,
  description TEXT,
  created_by  UUID          NOT NULL REFERENCES auth_users(user_id),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_group_members (
  group_id    INT           NOT NULL REFERENCES comm_groups(group_id)  ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES auth_users(user_id)    ON DELETE CASCADE,
  added_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
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
  conv_type VARCHAR(20) NOT NULL DEFAULT 'bcc'
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
  UNIQUE (conversation_id, user_id)
);



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
  message_id INT REFERENCES comm_messages(message_id) ON DELETE CASCADE,
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
