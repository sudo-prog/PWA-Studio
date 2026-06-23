-- PWA Studio Pro - Initial Migration
-- Generated from Drizzle schema definitions

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "thumbnail_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Layouts table
CREATE TABLE IF NOT EXISTS "layouts" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text DEFAULT 'Untitled Layout' NOT NULL,
  "grid_layout" jsonb DEFAULT '[]' NOT NULL,
  "flow_graph" jsonb DEFAULT '{"nodes":[],"edges":[]}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Widgets table (project-specific widget instances)
CREATE TABLE IF NOT EXISTS "widgets" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "widget_type" text NOT NULL,
  "config" jsonb DEFAULT '{}' NOT NULL,
  "position_x" integer DEFAULT 0 NOT NULL,
  "position_y" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Widget Registry table (global widget definitions)
CREATE TABLE IF NOT EXISTS "widget_registry" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "version" text DEFAULT '1.0.0' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "schema" jsonb DEFAULT '{}' NOT NULL,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "is_builtin" text DEFAULT 'false' NOT NULL
);

-- AI Conversations table
CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "model" text DEFAULT '' NOT NULL,
  "tokens_used" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- User Settings table
CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "theme" text DEFAULT 'system' NOT NULL,
  "active_model" text DEFAULT 'gpt-4o' NOT NULL,
  "api_overrides" jsonb DEFAULT '{}' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create index on layouts.project_id
CREATE INDEX IF NOT EXISTS "layouts_project_id_idx" ON "layouts" ("project_id");

-- Create index on widgets.project_id
CREATE INDEX IF NOT EXISTS "widgets_project_id_idx" ON "widgets" ("project_id");

-- Create index on ai_conversations.project_id
CREATE INDEX IF NOT EXISTS "ai_conversations_project_id_idx" ON "ai_conversations" ("project_id");
