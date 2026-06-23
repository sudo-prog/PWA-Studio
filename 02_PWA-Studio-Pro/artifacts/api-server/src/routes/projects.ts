import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  projectsTable,
  layoutsTable,
  widgetsTable,
  insertProjectSchema,
} from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// GET /projects — list with layout + widget counts
router.get("/projects", async (_req, res) => {
  try {
    const projects = await db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        description: projectsTable.description,
        thumbnailUrl: projectsTable.thumbnailUrl,
        createdAt: projectsTable.createdAt,
        updatedAt: projectsTable.updatedAt,
        layoutCount: sql<number>`count(distinct ${layoutsTable.id})::int`,
        widgetCount: sql<number>`count(distinct ${widgetsTable.id})::int`,
      })
      .from(projectsTable)
      .leftJoin(layoutsTable, eq(layoutsTable.projectId, projectsTable.id))
      .leftJoin(widgetsTable, eq(widgetsTable.projectId, projectsTable.id))
      .groupBy(projectsTable.id)
      .orderBy(desc(projectsTable.updatedAt));

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// POST /projects — create
router.post("/projects", async (req, res) => {
  try {
    const body = insertProjectSchema.parse(req.body);
    const [project] = await db
      .insert(projectsTable)
      .values(body)
      .returning();
    res.status(201).json(project);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create project" });
  }
});

// GET /projects/:id — detail with layouts
router.get("/projects/:id", async (req, res) => {
  try {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.id));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const layouts = await db
      .select({
        id: layoutsTable.id,
        projectId: layoutsTable.projectId,
        name: layoutsTable.name,
        createdAt: layoutsTable.createdAt,
        updatedAt: layoutsTable.updatedAt,
      })
      .from(layoutsTable)
      .where(eq(layoutsTable.projectId, req.params.id))
      .orderBy(desc(layoutsTable.updatedAt));

    res.json({ ...project, layouts });
  } catch (err) {
    res.status(500).json({ error: "Failed to get project" });
  }
});

// PATCH /projects/:id — update
router.patch("/projects/:id", async (req, res) => {
  try {
    const updateSchema = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      thumbnailUrl: z.string().nullable().optional(),
    });
    const body = updateSchema.parse(req.body);

    const [project] = await db
      .update(projectsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(projectsTable.id, req.params.id))
      .returning();

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to update project" });
  }
});

// DELETE /projects/:id — cascade delete via FK
router.delete("/projects/:id", async (req, res) => {
  try {
    await db.delete(projectsTable).where(eq(projectsTable.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
