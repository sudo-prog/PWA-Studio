import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const layoutsTable = pgTable("layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Untitled Layout"),
  gridLayout: jsonb("grid_layout").notNull().default([]),
  flowGraph: jsonb("flow_graph").notNull().default({ nodes: [], edges: [] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLayoutSchema = createInsertSchema(layoutsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectLayoutSchema = createSelectSchema(layoutsTable);

export type InsertLayout = z.infer<typeof insertLayoutSchema>;
export type Layout = typeof layoutsTable.$inferSelect;
