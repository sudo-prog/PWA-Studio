import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  openaiKey: text("openai_key"),
  anthropicKey: text("anthropic_key"),
  geminiKey: text("gemini_key"),
  customEndpoint: text("custom_endpoint"),
  defaultModel: text("default_model").notNull().default("gpt-4o"),
  theme: text("theme").notNull().default("system"),
  githubToken: text("github_token"),
  githubDefaultRepo: text("github_default_repo"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAppSettingsSchema = createInsertSchema(appSettingsTable).omit({ id: true });
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettingsTable.$inferSelect;
