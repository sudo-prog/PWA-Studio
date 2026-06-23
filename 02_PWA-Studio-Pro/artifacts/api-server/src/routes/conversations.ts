import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiConversationsTable, projectsTable, userSettingsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";

/**
 * Validate and return the LLM base URL from settings.
 * Returns null if not configured. Throws if the URL is invalid or uses a
 * disallowed scheme (SSRF guard — only http/https accepted).
 */
function resolveLlmBaseUrl(raw: string | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid LLM Base URL: "${url}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`LLM Base URL must use http or https (got "${parsed.protocol}")`);
  }
  return url;
}

const router: IRouter = Router();

// GET /projects/:projectId/conversations — paginated history
router.get("/projects/:projectId/conversations", async (req, res) => {
  try {
    const querySchema = z.object({
      limit: z.coerce.number().default(50),
      offset: z.coerce.number().default(0),
    });
    const { limit, offset } = querySchema.parse(req.query);

    const messages = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.projectId, req.params.projectId))
      .orderBy(asc(aiConversationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// POST /projects/:projectId/conversations/chat — call LLM, stream SSE response
router.post("/projects/:projectId/conversations/chat", async (req, res) => {
  try {
    const bodySchema = z.object({
      content: z.string().min(1, "Message content is required"),
    });
    const { content } = bodySchema.parse(req.body);

    // Verify project exists
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Read settings (singleton id=1)
    const [settings] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.id, 1));

    const apiOverrides = (settings?.apiOverrides ?? {}) as Record<string, string>;
    const model = settings?.activeModel ?? "gpt-4o";

    // Validate LLM base URL — SSRF guard: only http/https allowed, null = not configured
    let llmBaseUrl: string;
    try {
      const resolved = resolveLlmBaseUrl(apiOverrides.llmBaseUrl);
      if (!resolved) {
        // LLM not configured — stream a helpful error back rather than attempting a call
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ error: "No LLM configured. Go to Settings → Local LLM and set your Base URL (e.g. http://localhost:11434/v1 for Ollama)." })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }
      llmBaseUrl = resolved;
    } catch (urlErr) {
      res.status(400).json({ error: (urlErr as Error).message });
      return;
    }

    const llmApiKey = apiOverrides.llmApiKey?.trim() || "ollama";

    // Fetch conversation history (last 40 messages for context)
    const history = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.projectId, req.params.projectId))
      .orderBy(asc(aiConversationsTable.createdAt))
      .limit(40);

    // Save user message first so it appears immediately in history
    await db
      .insert(aiConversationsTable)
      .values({ projectId: req.params.projectId, role: "user", content, model });

    // Build messages for the LLM
    const systemMsg = {
      role: "system" as const,
      content:
        "You are a helpful PWA development assistant embedded in PWA Studio, a self-hosted visual development environment. Help users build modular Progressive Web Apps using web components, service workers, and modern browser APIs. Be concise, practical, and code-focused.",
    };

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      systemMsg,
      ...history.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      { role: "user" as const, content },
    ];

    // Create OpenAI-compatible client pointing at the user's LLM
    const openai = new OpenAI({ baseURL: llmBaseUrl, apiKey: llmApiKey });

    // Switch to SSE streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let fullResponse = "";

    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: chatMessages,
        stream: true,
        max_tokens: 2048,
      });

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          fullResponse += token;
          res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
        }
      }
    } catch (llmErr) {
      const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    // Save assistant response to DB
    if (fullResponse.trim()) {
      await db
        .insert(aiConversationsTable)
        .values({ projectId: req.params.projectId, role: "assistant", content: fullResponse, model });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors });
      } else {
        res.status(500).json({ error: "Failed to start chat" });
      }
    } else {
      res.write(`data: ${JSON.stringify({ error: "Server error", done: true })}\n\n`);
      res.end();
    }
  }
});

// POST /projects/:projectId/conversations — append a single message (used by internal tooling)
router.post("/projects/:projectId/conversations", async (req, res) => {
  try {
    const bodySchema = z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
      model: z.string().default(""),
      tokensUsed: z.number().nullable().optional(),
    });
    const body = bodySchema.parse(req.body);

    // Verify project exists
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [message] = await db
      .insert(aiConversationsTable)
      .values({ ...body, projectId: req.params.projectId })
      .returning();

    res.status(201).json(message);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
    } else {
      res.status(500).json({ error: "Failed to append message" });
    }
  }
});

// DELETE /projects/:projectId/conversations — clear
router.delete("/projects/:projectId/conversations", async (req, res) => {
  try {
    await db
      .delete(aiConversationsTable)
      .where(eq(aiConversationsTable.projectId, req.params.projectId));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to clear conversations" });
  }
});

export default router;
