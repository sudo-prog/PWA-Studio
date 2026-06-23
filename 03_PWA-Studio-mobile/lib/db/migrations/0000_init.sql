-- PWA Studio Mobile - Initial Migration
-- Generated from Drizzle schema definitions

-- Projects table
CREATE TABLE IF NOT EXISTS "projects" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "framework" text,
  "github_repo" text,
  "preview_url" text,
  "task_count" integer DEFAULT 0 NOT NULL,
  "completed_task_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Kanban Columns table
CREATE TABLE IF NOT EXISTS "kanban_columns" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "color" text DEFAULT '#6366f1' NOT NULL
);

-- Kanban Tasks table
CREATE TABLE IF NOT EXISTS "kanban_tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "column_id" integer NOT NULL REFERENCES "kanban_columns"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "agent_role" text DEFAULT 'director' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "branch" text,
  "preview_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

-- Agent Status table
CREATE TABLE IF NOT EXISTS "agent_status" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "status" text DEFAULT 'idle' NOT NULL,
  "current_task" text,
  "progress" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Activity Events table
CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "agent_role" text NOT NULL,
  "type" text DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "detail" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Canvas Snapshots table
CREATE TABLE IF NOT EXISTS "canvas_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE UNIQUE,
  "elements" jsonb DEFAULT '[]' NOT NULL,
  "thumbnail" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- App Settings table
CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "openai_key" text,
  "anthropic_key" text,
  "gemini_key" text,
  "custom_endpoint" text,
  "default_model" text DEFAULT 'gpt-4o' NOT NULL,
  "theme" text DEFAULT 'system' NOT NULL,
  "github_token" text,
  "github_default_repo" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "kanban_columns_project_id_idx" ON "kanban_columns" ("project_id");
CREATE INDEX IF NOT EXISTS "kanban_tasks_project_id_idx" ON "kanban_tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "kanban_tasks_column_id_idx" ON "kanban_tasks" ("column_id");
CREATE INDEX IF NOT EXISTS "agent_status_project_id_idx" ON "agent_status" ("project_id");
CREATE INDEX IF NOT EXISTS "activity_events_project_id_idx" ON "activity_events" ("project_id");
