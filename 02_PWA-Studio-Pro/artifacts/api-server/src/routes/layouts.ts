import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { layoutsTable, projectsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// GET /projects/:projectId/layouts — list summaries
router.get("/projects/:projectId/layouts", async (req, res) => {
  try {
    const layouts = await db
      .select({
        id: layoutsTable.id,
        projectId: layoutsTable.projectId,
        name: layoutsTable.name,
        createdAt: layoutsTable.createdAt,
        updatedAt: layoutsTable.updatedAt,
      })
      .from(layoutsTable)
      .where(eq(layoutsTable.projectId, req.params.projectId))
      .orderBy(desc(layoutsTable.updatedAt));

    res.json(layouts);
  } catch (err) {
    res.status(500).json({ error: "Failed to list layouts" });
  }
});

// POST /projects/:projectId/layouts — create snapshot
router.post("/projects/:projectId/layouts", async (req, res) => {
  try {
    const bodySchema = z.object({
      name: z.string().default("Untitled Layout"),
      gridLayout: z.any().default([]),
      flowGraph: z.any().default({ nodes: [], edges: [] }),
    });
    const body = bodySchema.parse(req.body);

    // Check project exists
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [layout] = await db
      .insert(layoutsTable)
      .values({ ...body, projectId: req.params.projectId })
      .returning();

    res.status(201).json(layout);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create layout" });
  }
});

// GET /layouts/:id — full layout
router.get("/layouts/:id", async (req, res) => {
  try {
    const [layout] = await db
      .select()
      .from(layoutsTable)
      .where(eq(layoutsTable.id, req.params.id));

    if (!layout) {
      res.status(404).json({ error: "Layout not found" });
      return;
    }
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: "Failed to get layout" });
  }
});

// PUT /layouts/:id — save full state
router.put("/layouts/:id", async (req, res) => {
  try {
    const bodySchema = z.object({
      name: z.string().optional(),
      gridLayout: z.any().optional(),
      flowGraph: z.any().optional(),
    });
    const body = bodySchema.parse(req.body);

    const [layout] = await db
      .update(layoutsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(layoutsTable.id, req.params.id))
      .returning();

    if (!layout) {
      res.status(404).json({ error: "Layout not found" });
      return;
    }
    res.json(layout);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to update layout" });
  }
});

// DELETE /layouts/:id
router.delete("/layouts/:id", async (req, res) => {
  try {
    await db.delete(layoutsTable).where(eq(layoutsTable.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete layout" });
  }
});

export default router;
