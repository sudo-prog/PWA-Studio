import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const agentStatusTable = pgTable("agent_status", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("idle"),
  currentTask: text("current_task"),
  progress: integer("progress"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentStatusSchema = createInsertSchema(agentStatusTable).omit({ id: true });
export type InsertAgentStatus = z.infer<typeof insertAgentStatusSchema>;
export type AgentStatus = typeof agentStatusTable.$inferSelect;

export const activityEventsTable = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  agentRole: text("agent_role").notNull(),
  type: text("type").notNull().default("info"),
  message: text("message").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivityEventSchema = createInsertSchema(activityEventsTable).omit({ id: true, createdAt: true });
export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;
export type ActivityEvent = typeof activityEventsTable.$inferSelect;
