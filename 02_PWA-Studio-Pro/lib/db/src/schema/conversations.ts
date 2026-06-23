import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const aiConversationsTable = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  model: text("model").notNull().default(""),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(aiConversationsTable).omit({
  id: true,
  createdAt: true,
});

export const selectConversationSchema = createSelectSchema(aiConversationsTable);

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type AiConversation = typeof aiConversationsTable.$inferSelect;
