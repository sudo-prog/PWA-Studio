import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const kanbanColumnsTable = pgTable("kanban_columns", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#6366f1"),
});

export const insertKanbanColumnSchema = createInsertSchema(kanbanColumnsTable).omit({ id: true });
export type InsertKanbanColumn = z.infer<typeof insertKanbanColumnSchema>;
export type KanbanColumn = typeof kanbanColumnsTable.$inferSelect;

export const kanbanTasksTable = pgTable("kanban_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  columnId: integer("column_id").notNull().references(() => kanbanColumnsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  agentRole: text("agent_role").notNull().default("director"),
  priority: text("priority").notNull().default("medium"),
  order: integer("order").notNull().default(0),
  branch: text("branch"),
  previewUrl: text("preview_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertKanbanTaskSchema = createInsertSchema(kanbanTasksTable).omit({ id: true, createdAt: true });
export type InsertKanbanTask = z.infer<typeof insertKanbanTaskSchema>;
export type KanbanTask = typeof kanbanTasksTable.$inferSelect;
