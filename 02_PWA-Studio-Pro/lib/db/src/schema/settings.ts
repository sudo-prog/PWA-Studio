import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userSettingsTable = pgTable("user_settings", {
  id: integer("id").primaryKey().default(1),
  theme: text("theme", { enum: ["light", "dark", "system"] }).notNull().default("system"),
  activeModel: text("active_model").notNull().default("gpt-4o"),
  apiOverrides: jsonb("api_overrides").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettingsTable);
export const selectUserSettingsSchema = createSelectSchema(userSettingsTable);

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettingsTable.$inferSelect;
