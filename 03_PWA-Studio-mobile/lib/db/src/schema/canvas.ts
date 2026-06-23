import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const canvasSnapshotsTable = pgTable("canvas_snapshots", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }).unique(),
  elements: jsonb("elements").notNull().default([]),
  thumbnail: text("thumbnail"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCanvasSnapshotSchema = createInsertSchema(canvasSnapshotsTable).omit({ id: true });
export type InsertCanvasSnapshot = z.infer<typeof insertCanvasSnapshotSchema>;
export type CanvasSnapshot = typeof canvasSnapshotsTable.$inferSelect;
