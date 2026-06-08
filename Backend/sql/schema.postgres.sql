-- ============================================================
--  I.EVO ERP — Full PostgreSQL Schema
--  Run: psql -U postgres -d ievo_erp -f schema.postgres.sql
--  Database must already exist: CREATE DATABASE ievo_erp;
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── AUTH ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_users (
  user_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username          VARCHAR(50)  NOT NULL UNIQUE,
  password_hash     TEXT         NOT NULL,
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  email             VARCHAR(150) UNIQUE,
  phone_number      VARCHAR(20),
  profile_picture   TEXT,
  dept_id           INT,
  level             INT,
  mgr_user_id       UUID         REFERENCES auth_users(user_id),
  user_type         VARCHAR(30),                 -- admin / employee / viewer
  employee_code     VARCHAR(50),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  allow_login       BOOLEAN      NOT NULL DEFAULT TRUE,
  required_email_notification BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  modified_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── SEED: manually insert test users here ─────────────────────
-- Password "password" → bcrypt hash (10 rounds)
-- To generate your own: node -e "const b=require('bcrypt');b.hash('yourpass',10).then(console.log)"
INSERT INTO auth_users (
  username, password_hash, first_name, last_name, email, user_type, allow_login, is_active
) VALUES
  ('admin',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin',  'User',  'admin@ievo.in',     'admin',    TRUE, TRUE),
  ('testuser','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test',   'User',  'test@ievo.in',      'employee', TRUE, TRUE),
  ('md',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Senior', 'MD',    'md@ievo.in',        'viewer',   TRUE, TRUE)
ON CONFLICT (username) DO NOTHING;

-- ── COMMUNICATION MODULE ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_groups (
  group_id    SERIAL       PRIMARY KEY,
  group_name  VARCHAR(150) NOT NULL,
  description TEXT,
  created_by  UUID         NOT NULL REFERENCES auth_users(user_id),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_group_members (
  group_id    INT  NOT NULL REFERENCES comm_groups(group_id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth_users(user_id)    ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS comm_conversations (
  conversation_id SERIAL       PRIMARY KEY,
  subject         VARCHAR(300) NOT NULL,
  allow_reply     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by      UUID         NOT NULL REFERENCES auth_users(user_id),
  group_id        INT          REFERENCES comm_groups(group_id),
  is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_participants (
  participant_id  SERIAL  PRIMARY KEY,
  conversation_id INT     NOT NULL REFERENCES comm_conversations(conversation_id),
  user_id         UUID    NOT NULL REFERENCES auth_users(user_id),
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS comm_messages (
  message_id        SERIAL  PRIMARY KEY,
  conversation_id   INT     NOT NULL REFERENCES comm_conversations(conversation_id),
  sender_id         UUID    NOT NULL REFERENCES auth_users(user_id),
  parent_message_id INT     REFERENCES comm_messages(message_id),
  body_html         TEXT    NOT NULL,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_attachments (
  attachment_id SERIAL       PRIMARY KEY,
  message_id    INT          REFERENCES comm_messages(message_id),
  uploaded_by   UUID         NOT NULL REFERENCES auth_users(user_id),
  original_name VARCHAR(500) NOT NULL,
  stored_name   VARCHAR(500) NOT NULL,
  storage_path  VARCHAR(500) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     BIGINT       NOT NULL,
  is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comm_read_receipts (
  message_id INT  NOT NULL REFERENCES comm_messages(message_id),
  user_id    UUID NOT NULL REFERENCES auth_users(user_id),
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- -- ── PROJECT MANAGEMENT MODULE ─────────────────────────────────

-- CREATE TABLE IF NOT EXISTS pm_projects (
--   project_id    SERIAL       PRIMARY KEY,
--   name          VARCHAR(200) NOT NULL,
--   description   TEXT,
--   planned_start DATE,
--   planned_end   DATE,
--   status        VARCHAR(30)  NOT NULL DEFAULT 'Planning',
--   owner_id      UUID         NOT NULL REFERENCES auth_users(user_id),
--   dept_id       INT,
--   is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
--   created_by    UUID         NOT NULL REFERENCES auth_users(user_id),
--   created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
--   modified_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS pm_project_members (
--   id          SERIAL      PRIMARY KEY,
--   project_id  INT         NOT NULL REFERENCES pm_projects(project_id),
--   user_id     UUID        NOT NULL REFERENCES auth_users(user_id),
--   role        VARCHAR(20) NOT NULL DEFAULT 'Member',
--   added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   UNIQUE (project_id, user_id)
-- );

-- CREATE TABLE IF NOT EXISTS pm_phases (
--   phase_id        SERIAL       PRIMARY KEY,
--   project_id      INT          NOT NULL REFERENCES pm_projects(project_id),
--   name            VARCHAR(200) NOT NULL,
--   description     TEXT,
--   display_order   INT          NOT NULL DEFAULT 0,
--   planned_start   DATE,
--   planned_end     DATE,
--   status          VARCHAR(30)  NOT NULL DEFAULT 'To Do',
--   status_override BOOLEAN      NOT NULL DEFAULT FALSE,
--   is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
--   created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS pm_phase_dependencies (
--   phase_id         INT NOT NULL REFERENCES pm_phases(phase_id),
--   depends_on_phase INT NOT NULL REFERENCES pm_phases(phase_id),
--   created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   PRIMARY KEY (phase_id, depends_on_phase)
-- );

-- CREATE TABLE IF NOT EXISTS pm_activities (
--   activity_id     SERIAL       PRIMARY KEY,
--   phase_id        INT          NOT NULL REFERENCES pm_phases(phase_id),
--   name            VARCHAR(200) NOT NULL,
--   description     TEXT,
--   display_order   INT          NOT NULL DEFAULT 0,
--   planned_start   DATE,
--   planned_end     DATE,
--   owner_id        UUID         REFERENCES auth_users(user_id),
--   status          VARCHAR(30)  NOT NULL DEFAULT 'To Do',
--   status_override BOOLEAN      NOT NULL DEFAULT FALSE,
--   is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
--   created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS pm_activity_dependencies (
--   activity_id         INT NOT NULL REFERENCES pm_activities(activity_id),
--   depends_on_activity INT NOT NULL REFERENCES pm_activities(activity_id),
--   created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   PRIMARY KEY (activity_id, depends_on_activity)
-- );

-- CREATE TABLE IF NOT EXISTS pm_tasks (
--   task_id         SERIAL       PRIMARY KEY,
--   activity_id     INT          NOT NULL REFERENCES pm_activities(activity_id),
--   parent_task_id  INT          REFERENCES pm_tasks(task_id),
--   name            VARCHAR(300) NOT NULL,
--   description     TEXT,
--   priority        VARCHAR(20)  NOT NULL DEFAULT 'Medium',
--   status          VARCHAR(30)  NOT NULL DEFAULT 'To Do',
--   due_date        DATE,
--   estimated_hours DECIMAL(5,1),
--   is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
--   created_by      UUID         NOT NULL REFERENCES auth_users(user_id),
--   created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
-- );

-- CREATE TABLE IF NOT EXISTS pm_task_assignees (
--   task_id     INT  NOT NULL REFERENCES pm_tasks(task_id),
--   user_id     UUID NOT NULL REFERENCES auth_users(user_id),
--   assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   PRIMARY KEY (task_id, user_id)
-- );

-- CREATE TABLE IF NOT EXISTS pm_task_dependencies (
--   task_id         INT NOT NULL REFERENCES pm_tasks(task_id),
--   depends_on_task INT NOT NULL REFERENCES pm_tasks(task_id),
--   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   PRIMARY KEY (task_id, depends_on_task)
-- );

-- CREATE TABLE IF NOT EXISTS pm_audit_log (
--   id            SERIAL      PRIMARY KEY,
--   entity_type   VARCHAR(30) NOT NULL,
--   entity_id     INT         NOT NULL,
--   project_id    INT         NOT NULL REFERENCES pm_projects(project_id),
--   user_id       UUID        NOT NULL REFERENCES auth_users(user_id),
--   action        VARCHAR(50) NOT NULL,
--   field_changed VARCHAR(100),
--   old_value     TEXT,
--   new_value     TEXT,
--   changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- ── INDEXES ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_auth_users_username  ON auth_users(username);
CREATE INDEX IF NOT EXISTS idx_auth_users_email     ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_comm_participants_user
  ON comm_participants(user_id, is_archived, is_deleted);
CREATE INDEX IF NOT EXISTS idx_comm_messages_conv
  ON comm_messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_comm_read_user
  ON comm_read_receipts(user_id);
-- CREATE INDEX IF NOT EXISTS idx_pm_phases_project
--   ON pm_phases(project_id, display_order);
-- CREATE INDEX IF NOT EXISTS idx_pm_tasks_activity
--   ON pm_tasks(activity_id);
-- CREATE INDEX IF NOT EXISTS idx_pm_audit_project
--   ON pm_audit_log(project_id, changed_at DESC);



-- DO $$ 
-- DECLARE
--     r RECORD;
-- BEGIN
--     -- Loop through all tables in the current schema (usually 'public')
--     FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
--         EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
--     END LOOP;
-- END $$;






-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: file storage enhancements
-- Run this script once against your existing database.
-- It is safe to run multiple times (uses IF NOT EXISTS / IF NOT COLUMN).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add storage_mode column to comm_attachments so we know whether
--    the file bytes live on disk or in Postgres.
--    Existing rows default to 'disk' (the original behaviour).
ALTER TABLE comm_attachments
  ADD COLUMN IF NOT EXISTS storage_mode VARCHAR(10) NOT NULL DEFAULT 'disk';

-- 2. Blob table for FILE_STORAGE=postgres mode.
--    Stores file bytes as BYTEA inside Postgres.
--    Suitable for files up to ~1 GB; for larger files consider pg Large Objects
--    or an S3-compatible object store.
CREATE TABLE IF NOT EXISTS comm_attachment_blobs (
  attachment_id INT     PRIMARY KEY
                        REFERENCES comm_attachments(attachment_id)
                        ON DELETE CASCADE,
  blob          BYTEA   NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- How to enable postgres storage:
--   In Backend/.env set:
--     FILE_STORAGE=postgres
--
--   To use disk storage (default — existing behaviour):
--     FILE_STORAGE=disk
--   or leave the variable unset.
-- ─────────────────────────────────────────────────────────────────────────────
select * from comm_groups;
select * from comm_attachments;






-- ============================================================
-- I.EVO ERP — Project Management Module Schema  v1.0
-- PostgreSQL — run once: psql -d ievo_erp -f schema.sql
-- All tables prefixed pm_ to avoid collisions
-- ============================================================

CREATE TABLE IF NOT EXISTS pm_projects (
  project_id      SERIAL PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  planned_start   DATE,
  planned_end     DATE,
  status          VARCHAR(30) NOT NULL DEFAULT 'Planning'
    CHECK (status IN ('Planning','Active','On Hold','Completed','Cancelled')),
  owner_id        UUID NOT NULL REFERENCES auth_users(user_id),
  dept_id         INT,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID NOT NULL REFERENCES auth_users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_members (
  project_id  INT  NOT NULL REFERENCES pm_projects(project_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth_users(user_id),
  role        VARCHAR(20) NOT NULL DEFAULT 'Member'
    CHECK (role IN ('Manager','Member','Viewer')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS pm_phases (
  phase_id        SERIAL PRIMARY KEY,
  project_id      INT NOT NULL REFERENCES pm_projects(project_id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  planned_start   DATE,
  planned_end     DATE,
  status          VARCHAR(30) NOT NULL DEFAULT 'To Do'
    CHECK (status IN ('Blocked','To Do','In Progress','Completed')),
  status_override BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_phase_deps (
  phase_id            INT NOT NULL REFERENCES pm_phases(phase_id) ON DELETE CASCADE,
  depends_on_phase_id INT NOT NULL REFERENCES pm_phases(phase_id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phase_id, depends_on_phase_id)
);

CREATE TABLE IF NOT EXISTS pm_activities (
  activity_id     SERIAL PRIMARY KEY,
  phase_id        INT NOT NULL REFERENCES pm_phases(phase_id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  planned_start   DATE,
  planned_end     DATE,
  owner_id        UUID REFERENCES auth_users(user_id),
  status          VARCHAR(30) NOT NULL DEFAULT 'To Do'
    CHECK (status IN ('Blocked','To Do','In Progress','Completed')),
  status_override BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_activity_deps (
  activity_id            INT NOT NULL REFERENCES pm_activities(activity_id) ON DELETE CASCADE,
  depends_on_activity_id INT NOT NULL REFERENCES pm_activities(activity_id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (activity_id, depends_on_activity_id)
);

CREATE TABLE IF NOT EXISTS pm_tasks (
  task_id         SERIAL PRIMARY KEY,
  activity_id     INT NOT NULL REFERENCES pm_activities(activity_id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  priority        VARCHAR(20) NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Low','Medium','High','Critical')),
  status          VARCHAR(30) NOT NULL DEFAULT 'To Do'
    CHECK (status IN ('To Do','In Progress','In Review','Done','Blocked')),
  due_date        DATE,
  estimated_hours DECIMAL(5,1),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth_users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_task_assignees (
  task_id     INT  NOT NULL REFERENCES pm_tasks(task_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth_users(user_id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS pm_task_deps (
  task_id            INT NOT NULL REFERENCES pm_tasks(task_id) ON DELETE CASCADE,
  depends_on_task_id INT NOT NULL REFERENCES pm_tasks(task_id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS pm_audit_log (
  id            SERIAL PRIMARY KEY,
  entity_type   VARCHAR(20) NOT NULL CHECK (entity_type IN ('project','phase','activity','task')),
  entity_id     INT NOT NULL,
  project_id    INT REFERENCES pm_projects(project_id),
  user_id       UUID REFERENCES auth_users(user_id),
  action        VARCHAR(60) NOT NULL,
  field_changed VARCHAR(100),
  old_value     TEXT,
  new_value     TEXT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_members_user      ON pm_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pm_phases_project    ON pm_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_activities_phase  ON pm_activities(phase_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_activity    ON pm_tasks(activity_id);
CREATE INDEX IF NOT EXISTS idx_pm_audit_project     ON pm_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_audit_entity      ON pm_audit_log(entity_type, entity_id);

