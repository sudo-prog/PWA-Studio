import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, projectsTable, kanbanColumnsTable, kanbanTasksTable, agentStatusTable } from "@workspace/db";
import {
  CreateProjectBody,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  UpdateProjectResponse,
  DeleteProjectParams,
  ListProjectsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const AGENT_ROLES = ["director", "design", "image", "builder", "tester", "deployer", "reviewer"] as const;
const DEFAULT_COLUMNS = [
  { name: "Backlog", order: 0, color: "#64748b" },
  { name: "In Progress", order: 1, color: "#6366f1" },
  { name: "In Review", order: 2, color: "#f59e0b" },
  { name: "Done", order: 3, color: "#10b981" },
];

router.get("/projects", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  let query = db.select().from(projectsTable).orderBy(desc(projectsTable.updatedAt));
  const rows = await query;
  const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);
  res.json(ListProjectsResponse.parse(filtered));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db.insert(projectsTable).values(parsed.data).returning();

  // Create default kanban columns
  await db.insert(kanbanColumnsTable).values(
    DEFAULT_COLUMNS.map((col) => ({ ...col, projectId: project.id }))
  );

  // Initialize agent statuses
  await db.insert(agentStatusTable).values(
    AGENT_ROLES.map((role) => ({ projectId: project.id, role, status: "idle" }))
  );

  res.status(201).json(GetProjectResponse.parse(project));
});

router.get("/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(GetProjectResponse.parse(project));
});

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set(parsed.data)
    .where(eq(projectsTable.id, params.data.projectId))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(UpdateProjectResponse.parse(project));
});

router.delete("/projects/:projectId", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
