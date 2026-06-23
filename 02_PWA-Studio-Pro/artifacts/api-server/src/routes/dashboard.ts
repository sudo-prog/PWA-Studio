import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  projectsTable,
  layoutsTable,
  widgetsTable,
  aiConversationsTable,
} from "@workspace/db";
import { eq, sql, desc, count } from "drizzle-orm";

const router: IRouter = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", async (_req, res) => {
  try {
    const [[projectCount], [widgetCount], [layoutCount], [conversationCount]] =
      await Promise.all([
        db.select({ count: count() }).from(projectsTable),
        db.select({ count: count() }).from(widgetsTable),
        db.select({ count: count() }).from(layoutsTable),
        db.select({ count: count() }).from(aiConversationsTable),
      ]);

    // Recent 5 projects with counts
    const recentProjects = await db
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
      .orderBy(desc(projectsTable.updatedAt))
      .limit(5);

    // Top widget types by usage
    const topWidgetTypes = await db
      .select({
        widgetType: widgetsTable.widgetType,
        count: sql<number>`count(*)::int`,
      })
      .from(widgetsTable)
      .groupBy(widgetsTable.widgetType)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    res.json({
      projectCount: projectCount.count,
      widgetCount: widgetCount.count,
      layoutCount: layoutCount.count,
      conversationCount: conversationCount.count,
      recentProjects,
      topWidgetTypes,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

// GET /projects/:id/activity
router.get("/projects/:id/activity", async (req, res) => {
  try {
    const [recentLayouts, recentMessages] = await Promise.all([
      db
        .select({
          id: layoutsTable.id,
          projectId: layoutsTable.projectId,
          name: layoutsTable.name,
          createdAt: layoutsTable.createdAt,
          updatedAt: layoutsTable.updatedAt,
        })
        .from(layoutsTable)
        .where(eq(layoutsTable.projectId, req.params.id))
        .orderBy(desc(layoutsTable.updatedAt))
        .limit(5),
      db
        .select()
        .from(aiConversationsTable)
        .where(eq(aiConversationsTable.projectId, req.params.id))
        .orderBy(desc(aiConversationsTable.createdAt))
        .limit(10),
    ]);

    res.json({
      projectId: req.params.id,
      recentLayouts,
      recentMessages,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get project activity" });
  }
});

export default router;
