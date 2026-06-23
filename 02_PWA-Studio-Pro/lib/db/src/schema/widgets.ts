import { pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const widgetsTable = pgTable("widgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  widgetType: text("widget_type").notNull(),
  config: jsonb("config").notNull().default({}),
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const widgetRegistryTable = pgTable("widget_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull().default("1.0.0"),
  description: text("description").notNull().default(""),
  schema: jsonb("schema").notNull().default({}),
  tags: text("tags").array().notNull().default([]),
  isBuiltin: text("is_builtin").notNull().default("false"),
});

export const insertWidgetSchema = createInsertSchema(widgetsTable).omit({
  id: true,
  createdAt: true,
});

export const insertWidgetRegistrySchema = createInsertSchema(widgetRegistryTable).omit({
  id: true,
});

export const selectWidgetSchema = createSelectSchema(widgetsTable);
export const selectWidgetRegistrySchema = createSelectSchema(widgetRegistryTable);

export type InsertWidget = z.infer<typeof insertWidgetSchema>;
export type Widget = typeof widgetsTable.$inferSelect;
export type InsertWidgetRegistry = z.infer<typeof insertWidgetRegistrySchema>;
export type WidgetRegistry = typeof widgetRegistryTable.$inferSelect;
