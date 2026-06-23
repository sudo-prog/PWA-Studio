import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  agentStatusTable,
  activityEventsTable,
  projectsTable,
  canvasSnapshotsTable,
  appSettingsTable,
} from "@workspace/db";
import { emitProjectEvent } from "../lib/eventBus";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
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

async function getFileContent(owner: string, repo: string, path: string, token: string): Promise<string> {
  const r = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, token);
  if (!r.ok) return "";
  const d = (await r.json()) as any;
  if (d.content && d.encoding === "base64") {
    return Buffer.from(d.content.replace(/\n/g, ""), "base64").toString("utf-8");
  }
  return "";
}

async function pushFilesToGitHub(
  owner: string, repo: string, token: string,
  files: Array<{ path: string; content: string }>,
  commitMsg: string,
): Promise<string | null> {
  try {
    const branchRes = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/main`, token);
    const branchData = (await branchRes.json()) as any;
    const currentCommitSha: string = branchData?.object?.sha;
    if (!currentCommitSha) return null;

    const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits/${currentCommitSha}`, token);
    const commitData = (await commitRes.json()) as any;
    const currentTreeSha: string = commitData?.tree?.sha;

    const blobs = await Promise.all(
      files.map(async (f) => {
        const r = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: Buffer.from(f.content).toString("base64"), encoding: "base64" }),
        });
        const b = (await r.json()) as any;
        return { path: f.path, sha: b.sha as string };
      }),
    );

    const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: currentTreeSha,
        tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      }),
    });
    const treeData = (await treeRes.json()) as any;

    const newCommitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMsg, tree: treeData.sha, parents: [currentCommitSha] }),
    });
    const newCommit = (await newCommitRes.json()) as any;

    await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/main`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha }),
    });

    return newCommit.sha as string;
  } catch {
    return null;
  }
}

async function callLLM(
  settings: { openaiKey?: string | null; anthropicKey?: string | null; customEndpoint?: string | null; defaultModel?: string | null },
  system: string,
  user: string,
  maxTokens = 3000,
): Promise<string> {
  const hasAnthropic = !!settings.anthropicKey;
  const hasCustom = !!settings.customEndpoint;
  const hasOpenAI = !!settings.openaiKey;

  if (hasAnthropic && !hasOpenAI && !hasCustom) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": settings.anthropicKey!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: settings.defaultModel || "claude-3-haiku-20240307", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    const d = (await r.json()) as any;
    if (!r.ok) throw new Error(d?.error?.message ?? `Anthropic error ${r.status}`);
    return d.content?.[0]?.text ?? "";
  }

  const baseUrl = hasCustom ? settings.customEndpoint!.replace(/\/+$/, "") : "https://api.openai.com/v1";
  const apiKey = settings.openaiKey ?? "ollama";
  const model = settings.defaultModel ?? (hasCustom ? "llama3.2" : "gpt-4o-mini");

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_tokens: maxTokens }),
  });
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error(d?.error?.message ?? `LLM error ${r.status}`);
  return d.choices?.[0]?.message?.content ?? "";
}

function parseJSON(raw: string): any {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { return {}; }
}

// ── POST /projects/:projectId/director-chat ───────────────────────────────────
router.post("/projects/:projectId/director-chat", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const { instruction, mode = "direct-edit" } = req.body as { instruction?: string; mode?: string };
  if (!instruction?.trim()) { res.status(400).json({ error: "instruction is required" }); return; }

  const [[project], [canvas], [settings]] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.id, projectId)),
    db.select().from(canvasSnapshotsTable).where(eq(canvasSnapshotsTable.projectId, projectId)),
    db.select().from(appSettingsTable).limit(1),
  ]);

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!settings?.openaiKey && !settings?.anthropicKey && !settings?.customEndpoint) {
    res.status(400).json({ error: "No LLM configured in Settings." }); return;
  }

  const hasGitHub = !!(project.githubRepo && settings.githubToken);
  const [owner, repo] = hasGitHub ? project.githubRepo!.split("/") : ["", ""];

  // Mark director running
  await Promise.all([
    db.update(agentStatusTable)
      .set({ status: "running", currentTask: mode === "vscode-plan" ? "Generating VS Code plan…" : "Analysing instruction…", progress: 10 })
      .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
    db.insert(activityEventsTable).values({
      projectId, agentRole: "director", type: "info",
      message: `Director received: "${instruction.slice(0, 80)}${instruction.length > 80 ? "…" : ""}"`,
    }),
  ]);
  emitProjectEvent(projectId, "agents_updated", { role: "director", status: "running" });

  try {
    // ── MODE: vscode-plan ──────────────────────────────────────────────────
    if (mode === "vscode-plan") {
      emitProjectEvent(projectId, "agent_step", { step: "planning", message: "Writing comprehensive VS Code plan…", percent: 20 });

      // Get file tree if repo exists
      let fileTree = "";
      if (hasGitHub) {
        const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees/main?recursive=1`, settings.githubToken!);
        const treeData = (await treeRes.json()) as any;
        const files = (treeData.tree ?? [])
          .filter((f: any) => f.type === "blob" && /\.(tsx?|jsx?|vue|svelte|css|html|json)$/.test(f.path))
          .map((f: any) => f.path)
          .slice(0, 60);
        fileTree = files.join("\n");
      }

      const elements = (canvas?.elements as any[] | null | undefined) ?? [];
      const canvasSummary = elements.length
        ? elements.map((el: any) => `- ${el.type ?? "element"}${el.label ? `: "${el.label}"` : ""}`).join("\n")
        : "No canvas elements.";

      const now = new Date().toISOString().split("T")[0];

      emitProjectEvent(projectId, "agent_step", { step: "planning", message: "LLM generating detailed plan…", percent: 45 });

      const planMarkdown = await callLLM(
        settings,
        `You are a senior software architect. Generate detailed, actionable plans that AI coding agents (GitHub Copilot, VS Code agents) can execute without further clarification.`,
        `Project: ${project.name}
Framework: ${project.framework ?? "react-vite-pwa"}
Date: ${now}

Task requested: ${instruction}

Current file tree:
${fileTree || "(no repo linked yet)"}

Canvas wireframe elements:
${canvasSummary}

Generate a COMPREHENSIVE markdown plan with:
1. Executive summary (2-3 sentences)
2. Exact files to create or modify (with file paths)
3. For each file: complete implementation code or precise diff instructions
4. Step-by-step implementation order
5. A ready-to-paste GitHub Copilot Chat command

Format as clean markdown. Be extremely specific — the agent reading this must need zero additional clarification.`,
        4000,
      );

      emitProjectEvent(projectId, "agent_step", { step: "planning", message: "Plan ready", percent: 70, done: true });

      const copilotPrompt = `@workspace Please implement the task described in AGENT_INSTRUCTIONS.md at the root of this project. Read it first, then implement each change step by step, verifying the build compiles after each file change.`;

      const agentInstructionsContent = `# Agent Instructions — ${project.name}
> Generated by APP Studio Director AI on ${now}
> Task: ${instruction}

${planMarkdown}

---
## VS Code Copilot Chat Command
Paste this into GitHub Copilot Chat in VS Code:

\`\`\`
${copilotPrompt}
\`\`\`
`;

      const copilotInstructionsContent = `# GitHub Copilot Instructions — ${project.name}

This is a ${project.framework ?? "React"} PWA project built with APP Studio.

## Current task
${instruction}

## Implementation plan
${planMarkdown}
`;

      let githubUrl: string | null = null;
      let filesWritten = 0;

      if (hasGitHub) {
        emitProjectEvent(projectId, "agent_step", { step: "pushing", message: "Writing plan to GitHub…", percent: 80 });

        const commitSha = await pushFilesToGitHub(owner, repo, settings.githubToken!, [
          { path: "AGENT_INSTRUCTIONS.md", content: agentInstructionsContent },
          { path: ".github/copilot-instructions.md", content: copilotInstructionsContent },
        ], `docs: VS Code agent plan — ${instruction.slice(0, 60)}`);

        if (commitSha) {
          filesWritten = 2;
          githubUrl = `https://github.com/${owner}/${repo}/blob/main/AGENT_INSTRUCTIONS.md`;
          emitProjectEvent(projectId, "agent_step", { step: "pushing", message: "Plan written to repo", percent: 100, done: true });
        }
      }

      await Promise.all([
        db.update(agentStatusTable)
          .set({ status: "complete", currentTask: "VS Code plan ready", progress: 100 })
          .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
        db.insert(activityEventsTable).values({
          projectId, agentRole: "director", type: "success",
          message: hasGitHub
            ? `VS Code plan written to AGENT_INSTRUCTIONS.md in ${project.githubRepo}`
            : "VS Code plan generated (no repo linked — plan not pushed)",
          detail: copilotPrompt,
        }),
      ]);
      emitProjectEvent(projectId, "agents_updated", { role: "director", status: "complete" });
      emitProjectEvent(projectId, "activity_added", {});

      res.json({
        success: true,
        mode: "vscode-plan",
        summary: `VS Code plan generated for: "${instruction.slice(0, 80)}"`,
        filesWritten,
        githubUrl,
        copilotPrompt,
        planMarkdown,
      });
      return;
    }

    // ── MODE: direct-edit ──────────────────────────────────────────────────
    if (!hasGitHub) {
      res.status(400).json({ error: "Direct Edit requires a linked GitHub repo. Create a repo first from the project page." });
      return;
    }

    // Step 1: get file tree
    emitProjectEvent(projectId, "agent_step", { step: "planning", message: "Reading project file tree…", percent: 15 });
    const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees/main?recursive=1`, settings.githubToken!);
    const treeData = (await treeRes.json()) as any;
    const allSrcFiles = (treeData.tree ?? [])
      .filter((f: any) => f.type === "blob" && /^src\/.*\.(tsx?|jsx?|vue|svelte|css)$/.test(f.path))
      .map((f: any) => f.path);

    // Step 2: LLM selects which files to read
    emitProjectEvent(projectId, "agent_step", { step: "planning", message: "Identifying relevant files…", percent: 30 });
    const selectorRaw = await callLLM(
      settings,
      `You are a code navigator. Given an instruction and a file tree, identify which files need to be read to fulfil the instruction. Return ONLY valid JSON.`,
      `Instruction: ${instruction}

File tree (src/ only):
${allSrcFiles.join("\n")}

Return JSON: { "files": ["src/App.tsx", "src/components/Navbar.tsx"] }
Pick at most 5 files. Pick the most likely files to need editing.`,
      512,
    );
    const selected: string[] = (parseJSON(selectorRaw).files ?? allSrcFiles.slice(0, 3)).slice(0, 5);

    // Step 3: fetch file contents
    emitProjectEvent(projectId, "agent_step", { step: "planning", message: `Reading ${selected.length} files…`, percent: 45, done: true });
    emitProjectEvent(projectId, "agent_step", { step: "codegen", message: "Fetching file contents…", percent: 50 });
    const fileContents = await Promise.all(
      selected.map(async (path) => {
        const content = await getFileContent(owner, repo, path, settings.githubToken!);
        return { path, content };
      }),
    );

    // Step 4: LLM generates edits
    emitProjectEvent(projectId, "agent_step", { step: "codegen", message: "Generating code edits…", percent: 65 });
    const fw = project.framework ?? "react-vite-pwa";
    const fileBlock = fileContents
      .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
      .join("\n\n");

    const editsRaw = await callLLM(
      settings,
      `You are an expert ${fw} developer. You receive existing source files and an instruction. You output the COMPLETE new content of each file that needs changing. Return ONLY valid JSON.`,
      `Project: ${project.name}
Framework: ${fw}
Instruction: ${instruction}

Current files:
${fileBlock}

Return JSON with the complete new content for ONLY the files that need changes:
{
  "files": [
    { "path": "src/App.tsx", "content": "...full file content..." }
  ],
  "summary": "One sentence describing what was changed"
}

Rules:
- Return COMPLETE file content (not diffs or partial snippets)
- Only include files that actually need changing
- Keep the same code style as the existing files
- TypeScript + Tailwind CSS only`,
      4000,
    );

    const editsResult = parseJSON(editsRaw);
    const editedFiles: Array<{ path: string; content: string }> = Array.isArray(editsResult.files)
      ? editsResult.files.filter((f: any) => f?.path && f?.content)
      : [];

    if (editedFiles.length === 0) {
      await db.update(agentStatusTable)
        .set({ status: "complete", currentTask: "No changes needed", progress: 100 })
        .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director")));
      emitProjectEvent(projectId, "agents_updated", { role: "director", status: "complete" });
      res.json({ success: true, mode: "direct-edit", summary: "No file changes were needed.", filesChanged: 0 });
      return;
    }

    // Step 5: push to GitHub
    emitProjectEvent(projectId, "agent_step", { step: "codegen", message: `${editedFiles.length} file${editedFiles.length > 1 ? "s" : ""} ready`, percent: 80, done: true });
    emitProjectEvent(projectId, "agent_step", { step: "pushing", message: `Pushing changes to ${project.githubRepo}…`, percent: 85 });

    const commitSha = await pushFilesToGitHub(
      owner, repo, settings.githubToken!, editedFiles,
      `fix: ${instruction.slice(0, 60)} — APP Studio Director`,
    );

    const summary = editsResult.summary ?? `${editedFiles.length} file${editedFiles.length > 1 ? "s" : ""} updated`;
    const githubUrl = commitSha ? `https://github.com/${owner}/${repo}/commit/${commitSha}` : null;

    await Promise.all([
      db.update(agentStatusTable)
        .set({ status: "complete", currentTask: summary.slice(0, 200), progress: 100 })
        .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
      db.insert(activityEventsTable).values({
        projectId, agentRole: "director", type: "success",
        message: summary,
        detail: editedFiles.map((f) => f.path).join("\n"),
      }),
    ]);
    emitProjectEvent(projectId, "agents_updated", { role: "director", status: "complete" });
    emitProjectEvent(projectId, "activity_added", {});
    emitProjectEvent(projectId, "agent_step", { step: "pushing", message: `${editedFiles.length} file${editedFiles.length > 1 ? "s" : ""} pushed`, percent: 100, done: true });

    res.json({
      success: true,
      mode: "direct-edit",
      summary,
      filesChanged: editedFiles.length,
      files: editedFiles.map((f) => f.path),
      githubUrl,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Director failed";
    await Promise.all([
      db.update(agentStatusTable)
        .set({ status: "error", currentTask: msg.slice(0, 200), progress: 0 })
        .where(and(eq(agentStatusTable.projectId, projectId), eq(agentStatusTable.role, "director"))),
      db.insert(activityEventsTable).values({
        projectId, agentRole: "director", type: "error",
        message: "Director failed", detail: msg,
      }),
    ]);
    emitProjectEvent(projectId, "agents_updated", { role: "director", status: "error" });
    res.status(500).json({ error: msg });
  }
});

export default router;
