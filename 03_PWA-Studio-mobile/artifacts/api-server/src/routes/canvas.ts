import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, canvasSnapshotsTable } from "@workspace/db";
import {
  GetCanvasParams,
  SaveCanvasParams,
  SaveCanvasBody,
  SaveCanvasResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/projects/:projectId/canvas", async (req, res): Promise<void> => {
  const params = GetCanvasParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [snapshot] = await db
    .select()
    .from(canvasSnapshotsTable)
    .where(eq(canvasSnapshotsTable.projectId, params.data.projectId));

  if (!snapshot) {
    res.status(404).json({ error: "Canvas not found" });
    return;
  }

  res.json({
    ...snapshot,
    elements: Array.isArray(snapshot.elements) ? snapshot.elements : [],
  });
});

router.put("/projects/:projectId/canvas", async (req, res): Promise<void> => {
  const params = SaveCanvasParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SaveCanvasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Upsert canvas snapshot
  const existing = await db
    .select()
    .from(canvasSnapshotsTable)
    .where(eq(canvasSnapshotsTable.projectId, params.data.projectId));

  let snapshot;
  if (existing.length > 0) {
    [snapshot] = await db
      .update(canvasSnapshotsTable)
      .set({ elements: parsed.data.elements, thumbnail: parsed.data.thumbnail })
      .where(eq(canvasSnapshotsTable.projectId, params.data.projectId))
      .returning();
  } else {
    [snapshot] = await db
      .insert(canvasSnapshotsTable)
      .values({
        projectId: params.data.projectId,
        elements: parsed.data.elements,
        thumbnail: parsed.data.thumbnail,
      })
      .returning();
  }

  res.json(SaveCanvasResponse.parse({
    ...snapshot,
    elements: Array.isArray(snapshot.elements) ? snapshot.elements : [],
  }));
});

export default router;
