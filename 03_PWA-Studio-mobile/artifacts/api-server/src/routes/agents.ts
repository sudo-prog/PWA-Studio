import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  agentStatusTable,
  activityEventsTable,
  projectsTable,
  canvasSnapshotsTable,
  appSettingsTable,
  kanbanColumnsTable,
  kanbanTasksTable,
} from "@workspace/db";
import {
  ListAgentsParams,
  UpdateAgentStatusParams,
  UpdateAgentStatusBody,
  UpdateAgentStatusResponse,
  GetActivityFeedParams,
  CreateActivityParams,
  CreateActivityBody,
} from "@workspace/api-zod";
import { emitProjectEvent } from "../lib/eventBus";

const router: IRouter = Router();

// ── GitHub helper (local to this file) ───────────────────────────────────────
const GH_API = "https://api.github.com";
async function ghFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

// ── Agent Status ──────────────────────────────────────────────────────────────
router.get("/projects/:projectId/agents", async (req, res): Promise<void> => {
  const params = ListAgentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const agents = await db.select().from(agentStatusTable).where(eq(agentStatusTable.projectId, params.data.projectId));
  res.json(agents);
});

router.patch("/projects/:projectId/agents/:agentRole", async (req, res): Promise<void> => {
  const params = UpdateAgentStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAgentStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [agent] = await db.update(agentStatusTable).set(parsed.data)
    .where(and(eq(agentStatusTable.projectId, params.data.projectId), eq(agentStatusTable.role, params.data.agentRole)))
    .returning();
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  emitProjectEvent(params.data.projectId, "agents_updated", { role: params.data.agentRole, status: parsed.data.status });
  res.json(UpdateAgentStatusResponse.parse(agent));
});

// ── Activity Feed ─────────────────────────────────────────────────────────────
router.get("/projects/:projectId/activity", async (req, res): Promise<void> => {
  const params = GetActivityFeedParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const events = await db.select().from(activityEventsTable)
    .where(eq(activityEventsTable.projectId, params.data.projectId))
    .orderBy(desc(activityEventsTable.createdAt)).limit(50);
  res.json(events);
});

router.post("/projects/:projectId/activity", async (req, res): Promise<void> => {
  const params = CreateActivityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [event] = await db.insert(activityEventsTable).values({ ...parsed.data, projectId: params.data.projectId }).returning();
  emitProjectEvent(params.data.projectId, "activity_added", { eventType: event.type, message: event.message, activityId: event.id });
  res.status(201).json(event);
});

// ── LLM caller (OpenAI-compatible + Anthropic) ───────────────────────────────
async function callLLM(
  settings: { openaiKey?: string | null; anthropicKey?: string | null; customEndpoint?: string | null; defaultModel?: string | null },
  system: string,
  user: string,
): Promise<string> {
  const hasOpenAI = !!settings.openaiKey;
  const hasAnthropic = !!settings.anthropicKey;
  const hasCustom = !!settings.customEndpoint;

  if (hasAnthropic && !hasOpenAI && !hasCustom) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.defaultModel || "claude-3-haiku-20240307",
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const d = (await r.json()) as any;
    if (!r.ok) throw new Error(d?.error?.message ?? `Anthropic error ${r.status}`);
    return d.content?.[0]?.text ?? "{}";
  }

  const baseUrl = hasCustom
    ? settings.customEndpoint!.replace(/\/+$/, "")
    : "https://api.openai.com/v1";
  const apiKey = settings.openaiKey ?? "ollama";
  const model = settings.defaultModel ?? (hasCustom ? "llama3.2" : "gpt-4o-mini");

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error(d?.error?.message ?? `LLM error ${r.status}`);
  return d.choices?.[0]?.message?.content ?? "{}";
}

function parseJSON(raw: string): any {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { return {}; }
}

// ── AI Agent Runner ───────────────────────────────────────────────────────────
router.post("/projects/:projectId/run-agent", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const [[project], [canvas], [settings]] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.id, projectId)),
    db.select().from(canvasSnapshotsTable).where(eq(canvasSnapshotsTable.projectId, projectId)),
    db.select().from(appSettingsTable).limit(1),
  ]);

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  if (!settings?.openaiKey && !settings?.anthropicKey && !settings?.customEndpoint) {
    res.status(400).json({ error: "No LLM configured. Add an API key or Ollama endpoint (http://localhost:11434/v1) in Settings." });
    return;
  }

  // ── Step 1: mark director running ────────────────────────────────────────
  await Promise.all([
    db.update(agentStatusTable)
      .set({ status: "running", currentTask: "Reading canvas and project context…", progress: 15 })
      .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
    db.insert(activityEventsTable).values({
      projectId, agentRole: "director", type: "progress",
      message: "Agent started — analysing canvas and project brief",
    }),
  ]);
  emitProjectEvent(projectId, "agents_updated", { role: "director", status: "running" });

  // Build canvas context
  const elements = (canvas?.elements as any[] | null | undefined) ?? [];
  const elementSummary = elements.length
    ? elements.map((el: any) =>
        `- ${el.type ?? "element"}${el.label ? `: "${el.label}"` : ""}${el.annotation ? ` (note: ${el.annotation})` : ""}`
      ).join("\n")
    : "Canvas is empty — no wireframe elements yet.";

  try {
    // ── Step 2: LLM call 1 — generate plan ──────────────────────────────────
    await db.update(agentStatusTable)
      .set({ currentTask: "Generating development plan…", progress: 30 })
      .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director")));
    emitProjectEvent(projectId, "agent_step", { step: "planning", message: "Sending canvas to LLM…", percent: 30 });

    const planRaw = await callLLM(
      settings!,
      `You are a senior software architect and product manager.
Analyse PWA project wireframes and produce concise, actionable development plans.
Respond ONLY with valid JSON — no markdown fences, no prose outside the JSON.`,
      `Project: ${project.name}
Description: ${project.description ?? "No description"}
Framework: ${project.framework ?? "react-vite-pwa"}

Canvas wireframe:
${elementSummary}

Respond with exactly this JSON:
{
  "summary": "One sentence describing what this app does",
  "components": ["ComponentA", "ComponentB"],
  "tasks": [
    { "title": "Task title", "description": "What to build", "priority": "high|medium|low" }
  ],
  "technicalNotes": "Key technical decisions or warnings"
}`,
    );

    const plan = parseJSON(planRaw);
    emitProjectEvent(projectId, "agent_step", { step: "planning", message: plan.summary ?? "Plan generated", percent: 50, done: true });

    // ── Step 3: create activity events ──────────────────────────────────────
    const activityEvents: any[] = [];
    if (plan.summary) {
      activityEvents.push({ projectId, agentRole: "director", type: "success", message: plan.summary });
    }
    if (plan.components?.length) {
      activityEvents.push({
        projectId, agentRole: "design", type: "info",
        message: "UI components identified",
        detail: (plan.components as string[]).join(", "),
      });
    }
    for (const task of (plan.tasks ?? []) as any[]) {
      activityEvents.push({
        projectId, agentRole: "builder", type: "info",
        message: `[${String(task.priority ?? "medium").toUpperCase()}] ${task.title ?? "Task"}`,
        detail: task.description ?? "",
      });
    }
    if (plan.technicalNotes) {
      activityEvents.push({
        projectId, agentRole: "director", type: "info",
        message: "Technical notes", detail: plan.technicalNotes,
      });
    }
    if (activityEvents.length) await db.insert(activityEventsTable).values(activityEvents);

    // ── Step 4: push tasks to Kanban Backlog ────────────────────────────────
    emitProjectEvent(projectId, "agent_step", { step: "kanban", message: "Writing tasks to Backlog…", percent: 58 });
    let kanbanCount = 0;
    const taskList = (plan.tasks ?? []) as Array<{ title: string; description?: string; priority?: string }>;
    if (taskList.length > 0) {
      const [backlogCol] = await db
        .select()
        .from(kanbanColumnsTable)
        .where(and(eq(kanbanColumnsTable.projectId, projectId), eq(kanbanColumnsTable.name, "Backlog")));

      if (backlogCol) {
        await db.insert(kanbanTasksTable).values(
          taskList.map((task, i) => ({
            projectId,
            columnId: backlogCol.id,
            title: task.title,
            description: task.description ?? "",
            priority: (["high", "medium", "low", "critical"] as const).includes(task.priority as any)
              ? (task.priority as "high" | "medium" | "low" | "critical")
              : "medium",
            order: 1000 + i,
            agentRole: "director",
          })),
        );
        kanbanCount = taskList.length;
        await db.insert(activityEventsTable).values({
          projectId, agentRole: "director", type: "success",
          message: `${kanbanCount} task${kanbanCount > 1 ? "s" : ""} added to Kanban Backlog`,
        });
        emitProjectEvent(projectId, "kanban_updated", { count: kanbanCount });
        emitProjectEvent(projectId, "agent_step", { step: "kanban", message: `${kanbanCount} task${kanbanCount > 1 ? "s" : ""} added to Backlog`, percent: 65, done: true });
      }
    }
    if (kanbanCount === 0) {
      emitProjectEvent(projectId, "agent_step", { step: "kanban", message: "No tasks generated", percent: 65, done: true });
    }

    await db.update(agentStatusTable)
      .set({ currentTask: "Plan complete, starting code generation…", progress: 55 })
      .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director")));

    // ── Step 5: code generation + GitHub push (Feature 1) ───────────────────
    let filesCount = 0;
    const hasGitHub = !!(project.githubRepo && settings?.githubToken);

    if (hasGitHub && plan.components?.length) {
      try {
        // Mark builder running
        await db.update(agentStatusTable)
          .set({ status: "running", currentTask: "Generating component code…", progress: 65 })
          .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "builder")));
        emitProjectEvent(projectId, "agents_updated", { role: "builder", status: "running" });
        emitProjectEvent(projectId, "agent_step", { step: "codegen", message: `Generating ${(plan.components as string[]).slice(0, 5).join(", ")}…`, percent: 70 });

        const fw = project.framework ?? "react-vite-pwa";
        const frameworkHint: Record<string, string> = {
          "react-vite-pwa": "React 18 with TypeScript (.tsx), functional components, Tailwind CSS classes",
          "pwa-starter":    "Lit 3 with TypeScript (.ts), @customElement decorators, shadow DOM + CSS template literals",
          "vue-vite-pwa":   "Vue 3 with TypeScript, <script setup lang=\"ts\">, .vue SFC, Tailwind CSS classes",
          "svelte-vite-pwa":"Svelte 5 with TypeScript, <script lang=\"ts\">, .svelte files, Tailwind CSS classes",
        };
        const appFile: Record<string, string> = {
          "react-vite-pwa": "src/App.tsx",
          "pwa-starter":    "src/app-index.ts",
          "vue-vite-pwa":   "src/App.vue",
          "svelte-vite-pwa":"src/App.svelte",
        };
        const fileExt: Record<string, string> = {
          "react-vite-pwa": "tsx",
          "pwa-starter":    "ts",
          "vue-vite-pwa":   "vue",
          "svelte-vite-pwa":"svelte",
        };

        const components = (plan.components as string[]).slice(0, 5); // cap at 5

        const codeRaw = await callLLM(
          settings!,
          `You are an expert ${frameworkHint[fw] ?? frameworkHint["react-vite-pwa"]} developer.
Respond ONLY with valid JSON — no markdown, no explanation outside the JSON.`,
          `Generate source files for this PWA.

Project: ${project.name}
Summary: ${plan.summary ?? ""}
Components: ${components.join(", ")}

Write each component and an updated ${appFile[fw] ?? "src/App.tsx"} that renders all of them.
Respond with exactly:
{
  "files": [
    { "path": "src/components/Foo.${fileExt[fw] ?? "tsx"}", "content": "full file content" },
    { "path": "${appFile[fw] ?? "src/App.tsx"}", "content": "updated app file importing all components" }
  ]
}
Rules: TypeScript everywhere · Tailwind classes for styling · 20-60 lines per component · no lorem ipsum.`,
        );

        const codeResult = parseJSON(codeRaw);
        const files: Array<{ path: string; content: string }> = Array.isArray(codeResult.files)
          ? codeResult.files.filter((f: any) => f?.path && f?.content)
          : [];

        if (files.length > 0) {
          emitProjectEvent(projectId, "agent_step", { step: "codegen", message: `${files.length} files ready`, percent: 83, done: true });
          await db.update(agentStatusTable)
            .set({ currentTask: "Pushing code to GitHub…", progress: 85 })
            .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "builder")));
          emitProjectEvent(projectId, "agent_step", { step: "pushing", message: `Committing to ${project.githubRepo}…`, percent: 88 });

          // Get current main branch commit + tree
          const [owner, repo] = project.githubRepo!.split("/");
          const branchRes = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/main`, settings!.githubToken!);
          const branchData = (await branchRes.json()) as any;
          const currentCommitSha: string = branchData?.object?.sha;

          if (currentCommitSha) {
            const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits/${currentCommitSha}`, settings!.githubToken!);
            const commitData = (await commitRes.json()) as any;
            const currentTreeSha: string = commitData?.tree?.sha;

            // Create blobs
            const blobs = await Promise.all(
              files.map(async (f) => {
                const r = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, settings!.githubToken!, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content: Buffer.from(f.content).toString("base64"), encoding: "base64" }),
                });
                const b = (await r.json()) as any;
                return { path: f.path, sha: b.sha as string };
              }),
            );

            // Create tree on top of existing
            const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, settings!.githubToken!, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                base_tree: currentTreeSha,
                tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
              }),
            });
            const treeData = (await treeRes.json()) as any;

            // Create commit
            const newCommitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, settings!.githubToken!, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: `feat: AI-generated components (${components.join(", ")}) — APP Studio`,
                tree: treeData.sha,
                parents: [currentCommitSha],
              }),
            });
            const newCommit = (await newCommitRes.json()) as any;

            // Update branch ref
            await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/main`, settings!.githubToken!, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sha: newCommit.sha }),
            });

            filesCount = files.length;

            await db.insert(activityEventsTable).values({
              projectId, agentRole: "builder", type: "success",
              message: `${filesCount} file${filesCount > 1 ? "s" : ""} pushed to ${project.githubRepo}`,
              detail: files.map((f) => f.path).join("\n"),
            });
            emitProjectEvent(projectId, "agent_step", { step: "pushing", message: `${filesCount} file${filesCount > 1 ? "s" : ""} pushed to ${project.githubRepo}`, percent: 100, done: true });
          }
        }

        await db.update(agentStatusTable)
          .set({ status: "complete", currentTask: `${filesCount} files generated & pushed`, progress: 100 })
          .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "builder")));
        emitProjectEvent(projectId, "agents_updated", { role: "builder", status: "complete" });

      } catch (codeErr) {
        // Code gen failure is non-fatal — plan + kanban still succeeded
        const msg = codeErr instanceof Error ? codeErr.message : "Code generation failed";
        await db.update(agentStatusTable)
          .set({ status: "error", currentTask: msg.slice(0, 200) })
          .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "builder")));
        await db.insert(activityEventsTable).values({
          projectId, agentRole: "builder", type: "error",
          message: "Code generation failed", detail: msg,
        });
        emitProjectEvent(projectId, "agents_updated", { role: "builder", status: "error" });
        emitProjectEvent(projectId, "agent_step", { step: "codegen", message: msg.slice(0, 80), percent: 70, error: true });
      }
    }

    // ── Step 6: finalise ────────────────────────────────────────────────────
    await Promise.all([
      db.update(agentStatusTable)
        .set({ status: "complete", currentTask: plan.summary ?? "Analysis complete", progress: 100 })
        .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
      db.update(projectsTable)
        .set({ status: "active" })
        .where(eq(projectsTable.id, projectId)),
    ]);

    emitProjectEvent(projectId, "agents_updated", { role: "director", status: "complete" });
    emitProjectEvent(projectId, "activity_added", { message: "Agent run complete" });

    res.json({ success: true, plan, eventCount: activityEvents.length, kanbanCount, filesCount });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await Promise.all([
      db.update(agentStatusTable)
        .set({ status: "error", currentTask: msg.slice(0, 200), progress: 0 })
        .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
      db.insert(activityEventsTable).values({
        projectId, agentRole: "director", type: "error",
        message: "Agent failed", detail: msg,
      }),
    ]);
    emitProjectEvent(projectId, "agents_updated", { role: "director", status: "error" });
    res.status(500).json({ error: msg });
  }
});

export default router;
