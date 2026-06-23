import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, kanbanColumnsTable, kanbanTasksTable, projectsTable } from "@workspace/db";
import {
  ListColumnsParams,
  ListTasksParams,
  CreateTaskParams,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { emitProjectEvent } from "../lib/eventBus";

const router: IRouter = Router();

// ── Columns ──────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/columns", async (req, res): Promise<void> => {
  const params = ListColumnsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const columns = await db
    .select()
    .from(kanbanColumnsTable)
    .where(eq(kanbanColumnsTable.projectId, params.data.projectId))
    .orderBy(asc(kanbanColumnsTable.order));

  res.json(columns);
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/tasks", async (req, res): Promise<void> => {
  const params = ListTasksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const tasks = await db
    .select()
    .from(kanbanTasksTable)
    .where(eq(kanbanTasksTable.projectId, params.data.projectId))
    .orderBy(asc(kanbanTasksTable.order));

  res.json(tasks);
});

router.post("/projects/:projectId/tasks", async (req, res): Promise<void> => {
  const params = CreateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existingTasks = await db
    .select()
    .from(kanbanTasksTable)
    .where(
      and(
        eq(kanbanTasksTable.projectId, params.data.projectId),
        eq(kanbanTasksTable.columnId, parsed.data.columnId)
      )
    );
  const maxOrder =
    existingTasks.length > 0
      ? Math.max(...existingTasks.map((t) => t.order)) + 1
      : 0;

  const [task] = await db
    .insert(kanbanTasksTable)
    .values({ ...parsed.data, projectId: params.data.projectId, order: maxOrder })
    .returning();

  const allProjectTasks = await db
    .select()
    .from(kanbanTasksTable)
    .where(eq(kanbanTasksTable.projectId, params.data.projectId));
  await db
    .update(projectsTable)
    .set({ taskCount: allProjectTasks.length })
    .where(eq(projectsTable.id, params.data.projectId));

  emitProjectEvent(params.data.projectId, "tasks_updated", { action: "created", taskId: task.id });

  res.status(201).json(task);
});

router.patch("/projects/:projectId/tasks/:taskId", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .update(kanbanTasksTable)
    .set(parsed.data as any)
    .where(
      and(
        eq(kanbanTasksTable.id, params.data.taskId),
        eq(kanbanTasksTable.projectId, params.data.projectId)
      )
    )
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (parsed.data.completedAt) {
    const completedTasks = await db
      .select()
      .from(kanbanTasksTable)
      .where(eq(kanbanTasksTable.projectId, params.data.projectId));
    const completedCount = completedTasks.filter((t) => t.completedAt !== null).length;
    await db
      .update(projectsTable)
      .set({ completedTaskCount: completedCount })
      .where(eq(projectsTable.id, params.data.projectId));
  }

  emitProjectEvent(params.data.projectId, "tasks_updated", {
    action: "updated",
    taskId: params.data.taskId,
    columnId: parsed.data.columnId,
  });

  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/projects/:projectId/tasks/:taskId", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .delete(kanbanTasksTable)
    .where(
      and(
        eq(kanbanTasksTable.id, params.data.taskId),
        eq(kanbanTasksTable.projectId, params.data.projectId)
      )
    )
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  emitProjectEvent(params.data.projectId, "tasks_updated", {
    action: "deleted",
    taskId: params.data.taskId,
  });

  res.sendStatus(204);
});

export default router;
