import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  appSettingsTable,
  projectsTable,
  kanbanColumnsTable,
  kanbanTasksTable,
  canvasSnapshotsTable,
} from "@workspace/db";
import { buildTemplate } from "./github-templates";

const router = Router();

const GH_API = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      ...ghHeaders(token),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

async function getSettings() {
  const rows = await db.select().from(appSettingsTable);
  if (rows.length === 0) {
    const [created] = await db.insert(appSettingsTable).values({}).returning();
    return created;
  }
  return rows[0];
}

// GET /github/me — verify PAT and return GitHub user info
router.get("/github/me", async (_req, res) => {
  const settings = await getSettings();
  if (!settings.githubToken) {
    res.status(401).json({ error: "No GitHub token configured" });
    return;
  }

  const ghRes = await ghFetch("/user", settings.githubToken);
  if (!ghRes.ok) {
    res.status(ghRes.status).json({ error: "GitHub authentication failed. Check your token." });
    return;
  }

  const user = (await ghRes.json()) as {
    login: string;
    name: string | null;
    avatar_url: string;
  };
  res.json({ login: user.login, name: user.name, avatarUrl: user.avatar_url });
});

// GET /github/repos — list repos the token has access to
router.get("/github/repos", async (_req, res) => {
  const settings = await getSettings();
  if (!settings.githubToken) {
    res.status(401).json({ error: "No GitHub token configured" });
    return;
  }

  const ghRes = await ghFetch(
    "/user/repos?per_page=100&sort=updated&type=owner",
    settings.githubToken,
  );
  if (!ghRes.ok) {
    res.status(ghRes.status).json({ error: "Failed to fetch repositories" });
    return;
  }

  const repos = (await ghRes.json()) as Array<{
    id: number;
    full_name: string;
    name: string;
    private: boolean;
    html_url: string;
  }>;

  res.json(
    repos.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      name: r.name,
      private: r.private,
      url: r.html_url,
    })),
  );
});

// POST /github/backup/:projectId — push project snapshot JSON to the repo
router.post("/github/backup/:projectId", async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const settings = await getSettings();
  if (!settings.githubToken) {
    res.status(401).json({ error: "No GitHub token configured" });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const repoFullName = project.githubRepo ?? settings.githubDefaultRepo;
  if (!repoFullName || !repoFullName.includes("/")) {
    res
      .status(400)
      .json({
        error:
          "No GitHub repo set for this project. Add one in project settings or set a default repo in Settings.",
      });
    return;
  }

  const [columns, tasks, canvasRows] = await Promise.all([
    db
      .select()
      .from(kanbanColumnsTable)
      .where(eq(kanbanColumnsTable.projectId, projectId)),
    db
      .select()
      .from(kanbanTasksTable)
      .where(eq(kanbanTasksTable.projectId, projectId)),
    db
      .select()
      .from(canvasSnapshotsTable)
      .where(eq(canvasSnapshotsTable.projectId, projectId)),
  ]);

  const backup = {
    _version: 1,
    _exportedAt: new Date().toISOString(),
    project,
    kanban: { columns, tasks },
    canvas: canvasRows[0] ?? null,
  };

  const content = Buffer.from(JSON.stringify(backup, null, 2)).toString(
    "base64",
  );
  const filePath = ".appstudio/backup.json";
  const [owner, repo] = repoFullName.split("/");

  // Fetch existing SHA so we can update rather than create
  const existingRes = await ghFetch(
    `/repos/${owner}/${repo}/contents/${filePath}`,
    settings.githubToken,
  );
  const existing = existingRes.ok
    ? ((await existingRes.json()) as { sha: string })
    : null;

  const pushRes = await ghFetch(
    `/repos/${owner}/${repo}/contents/${filePath}`,
    settings.githubToken,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore: APP Studio backup — ${project.name} [${new Date().toISOString().split("T")[0]}]`,
        content,
        ...(existing ? { sha: existing.sha } : {}),
      }),
    },
  );

  if (!pushRes.ok) {
    const err = (await pushRes.json()) as { message?: string };
    res
      .status(pushRes.status)
      .json({ error: err.message ?? "Failed to push backup to GitHub" });
    return;
  }

  const result = (await pushRes.json()) as {
    content: { html_url: string };
  };
  res.json({ url: result.content.html_url, repo: repoFullName });
});

// POST /github/publish/:projectId — build a GH Pages project showcase page
router.post("/github/publish/:projectId", async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const settings = await getSettings();
  if (!settings.githubToken) {
    res.status(401).json({ error: "No GitHub token configured" });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const repoFullName = project.githubRepo ?? settings.githubDefaultRepo;
  if (!repoFullName || !repoFullName.includes("/")) {
    res
      .status(400)
      .json({ error: "No GitHub repo set for this project." });
    return;
  }

  const [owner, repo] = repoFullName.split("/");

  const canvasRows = await db
    .select()
    .from(canvasSnapshotsTable)
    .where(eq(canvasSnapshotsTable.projectId, projectId));
  const canvas = canvasRows[0] ?? null;

  const previewLink = project.previewUrl
    ? `<a href="${project.previewUrl}" target="_blank" rel="noopener" class="btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open Live Preview
      </a>`
    : "";

  const thumbnailHtml =
    canvas?.thumbnail
      ? `<img src="${canvas.thumbnail}" alt="Wireframe preview" class="wireframe" />`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${project.name} — APP Studio</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f2f8;
      color: #1a1a2e;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      gap: 1.5rem;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 2.5rem;
      max-width: 680px;
      width: 100%;
      box-shadow: 0 8px 40px rgba(0,0,0,.07);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: .45rem;
      background: #eff0ff;
      color: #4444e0;
      font-size: 12px;
      font-weight: 600;
      padding: .3rem .8rem;
      border-radius: 99px;
      margin-bottom: 1.25rem;
      letter-spacing: .02em;
    }
    h1 { font-size: 2rem; font-weight: 800; letter-spacing: -.04em; margin-bottom: .5rem; }
    .desc { color: #64748b; margin-bottom: 1.75rem; line-height: 1.65; font-size: 15px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      background: #4444e0;
      color: #fff;
      text-decoration: none;
      padding: .7rem 1.4rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      transition: background .15s;
    }
    .btn:hover { background: #3333c4; }
    .wireframe {
      width: 100%;
      border-radius: 12px;
      margin-top: 1.75rem;
      border: 1px solid #e8eaf2;
    }
    .meta {
      margin-top: 1.75rem;
      padding-top: 1.25rem;
      border-top: 1px solid #f0f0f7;
      font-size: 13px;
      color: #94a3b8;
      display: flex;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .meta span { display: flex; align-items: center; gap: .3rem; }
    footer { font-size: 12px; color: #94a3b8; }
    footer a { color: #4444e0; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      APP Studio Project
    </div>
    <h1>${project.name}</h1>
    ${project.description ? `<p class="desc">${project.description}</p>` : ""}
    ${previewLink}
    ${thumbnailHtml}
    <div class="meta">
      ${project.framework ? `<span>🧩 ${project.framework}</span>` : ""}
      <span>📋 ${project.status}</span>
      <span>🗓 ${new Date(project.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
    </div>
  </div>
  <footer>Built with <a href="https://github.com" target="_blank">APP Studio</a></footer>
</body>
</html>`;

  const htmlContent = Buffer.from(html).toString("base64");

  // Check if gh-pages branch exists
  const branchRes = await ghFetch(
    `/repos/${owner}/${repo}/git/ref/heads/gh-pages`,
    settings.githubToken,
  );

  let parentSha: string | undefined;
  let baseTreeSha: string;

  if (branchRes.ok) {
    const branch = (await branchRes.json()) as { object: { sha: string } };
    parentSha = branch.object.sha;
    const commitRes = await ghFetch(
      `/repos/${owner}/${repo}/git/commits/${parentSha}`,
      settings.githubToken,
    );
    const commit = (await commitRes.json()) as { tree: { sha: string } };
    baseTreeSha = commit.tree.sha;
  } else {
    // Fall back to default branch
    const repoInfoRes = await ghFetch(
      `/repos/${owner}/${repo}`,
      settings.githubToken,
    );
    const repoInfo = (await repoInfoRes.json()) as { default_branch: string };
    const defBranchRes = await ghFetch(
      `/repos/${owner}/${repo}/git/ref/heads/${repoInfo.default_branch}`,
      settings.githubToken,
    );
    const defBranch = (await defBranchRes.json()) as {
      object: { sha: string };
    };
    parentSha = defBranch.object.sha;
    const commitRes = await ghFetch(
      `/repos/${owner}/${repo}/git/commits/${parentSha}`,
      settings.githubToken,
    );
    const commit = (await commitRes.json()) as { tree: { sha: string } };
    baseTreeSha = commit.tree.sha;
  }

  // Create blob
  const blobRes = await ghFetch(
    `/repos/${owner}/${repo}/git/blobs`,
    settings.githubToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: htmlContent, encoding: "base64" }),
    },
  );
  const blob = (await blobRes.json()) as { sha: string };

  // Create tree with index.html
  const treeRes = await ghFetch(
    `/repos/${owner}/${repo}/git/trees`,
    settings.githubToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          { path: "index.html", mode: "100644", type: "blob", sha: blob.sha },
        ],
      }),
    },
  );
  const tree = (await treeRes.json()) as { sha: string };

  // Create commit
  const commitRes = await ghFetch(
    `/repos/${owner}/${repo}/git/commits`,
    settings.githubToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `publish: APP Studio — ${project.name} [${new Date().toISOString().split("T")[0]}]`,
        tree: tree.sha,
        ...(parentSha ? { parents: [parentSha] } : {}),
      }),
    },
  );
  const newCommit = (await commitRes.json()) as { sha: string };

  // Create or update gh-pages ref
  if (branchRes.ok) {
    await ghFetch(
      `/repos/${owner}/${repo}/git/refs/heads/gh-pages`,
      settings.githubToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: newCommit.sha, force: true }),
      },
    );
  } else {
    await ghFetch(
      `/repos/${owner}/${repo}/git/refs`,
      settings.githubToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: "refs/heads/gh-pages",
          sha: newCommit.sha,
        }),
      },
    );
  }

  // Best-effort: enable GitHub Pages (may 422 if already on)
  await ghFetch(`/repos/${owner}/${repo}/pages`, settings.githubToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: { branch: "gh-pages", path: "/" } }),
  }).catch(() => {});

  const pagesUrl = `https://${owner}.github.io/${repo}/`;

  // Persist the live preview URL on the project
  await db
    .update(projectsTable)
    .set({ previewUrl: pagesUrl })
    .where(eq(projectsTable.id, projectId));

  res.json({ url: pagesUrl, repo: repoFullName });
});

// POST /github/init-repo/:projectId — create GitHub repo + scaffold PWA template
router.post("/github/init-repo/:projectId", async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const settings = await getSettings();
  if (!settings.githubToken) {
    res.status(401).json({ error: "No GitHub token configured" });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Get authenticated GitHub user
  const userRes = await ghFetch("/user", settings.githubToken);
  if (!userRes.ok) {
    res.status(401).json({ error: "GitHub authentication failed" });
    return;
  }
  const ghUser = (await userRes.json()) as { login: string };

  // Slugify project name → valid GitHub repo name
  const slug =
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || `project-${projectId}`;

  // Create the GitHub repo (no auto_init so it starts truly empty)
  const createRes = await ghFetch("/user/repos", settings.githubToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: slug,
      description:
        project.description ||
        `PWA project: ${project.name} — scaffolded by APP Studio`,
      private: false,
      auto_init: false,
    }),
  });

  if (!createRes.ok) {
    const err = (await createRes.json()) as { message?: string };
    res
      .status(createRes.status)
      .json({ error: err.message ?? "Failed to create GitHub repository" });
    return;
  }

  const ghRepo = (await createRes.json()) as {
    full_name: string;
    html_url: string;
  };

  // Build template files for the chosen framework
  const framework = project.framework ?? "react-vite-pwa";
  const files = buildTemplate(framework, {
    name: project.name,
    slug,
    description: project.description || `PWA project: ${project.name}`,
  });

  const owner = ghUser.login;

  // Upload all blobs in parallel
  const blobEntries = await Promise.all(
    files.map(async (f) => {
      const r = await ghFetch(
        `/repos/${owner}/${slug}/git/blobs`,
        settings.githubToken!,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: Buffer.from(f.content).toString("base64"),
            encoding: "base64",
          }),
        },
      );
      const blob = (await r.json()) as { sha: string };
      return { path: f.path, sha: blob.sha };
    }),
  );

  // Create a single tree with all files (no base_tree — empty repo)
  const treeRes = await ghFetch(
    `/repos/${owner}/${slug}/git/trees`,
    settings.githubToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tree: blobEntries.map((b) => ({
          path: b.path,
          mode: "100644",
          type: "blob",
          sha: b.sha,
        })),
      }),
    },
  );
  const tree = (await treeRes.json()) as { sha: string };

  // Initial commit (no parents)
  const commitRes = await ghFetch(
    `/repos/${owner}/${slug}/git/commits`,
    settings.githubToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `feat: initial PWA scaffold (${framework}) — scaffolded by APP Studio`,
        tree: tree.sha,
      }),
    },
  );
  const commit = (await commitRes.json()) as { sha: string };

  // Create the main branch ref
  await ghFetch(`/repos/${owner}/${slug}/git/refs`, settings.githubToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha }),
  });

  // Persist the repo on the project record
  await db
    .update(projectsTable)
    .set({ githubRepo: ghRepo.full_name })
    .where(eq(projectsTable.id, projectId));

  res.json({
    repo: ghRepo.full_name,
    url: ghRepo.html_url,
    framework,
    filesCount: files.length,
  });
});

export default router;
