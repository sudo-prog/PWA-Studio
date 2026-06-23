import { Router, type IRouter } from "express";
import { db, projectsTable, kanbanTasksTable, agentStatusTable, activityEventsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [projects, allTasks, allAgents, recentActivity] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(kanbanTasksTable),
    db.select().from(agentStatusTable),
    db.select().from(activityEventsTable).orderBy(desc(activityEventsTable.createdAt)).limit(10),
  ]);

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "building").length;
  const deployedProjects = projects.filter((p) => p.status === "deployed").length;
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.completedAt !== null).length;
  const runningAgents = allAgents.filter((a) => a.status === "running").length;

  // Agent breakdown by role
  const agentRoles = ["director", "design", "image", "builder", "tester", "deployer", "reviewer"];
  const agentBreakdown = agentRoles.map((role) => {
    const roleAgents = allAgents.filter((a) => a.role === role);
    const runningCount = roleAgents.filter((a) => a.status === "running").length;
    const dominantStatus = runningCount > 0 ? "running" :
      roleAgents.some((a) => a.status === "waiting") ? "waiting" :
      roleAgents.some((a) => a.status === "error") ? "error" :
      roleAgents.some((a) => a.status === "complete") ? "complete" : "idle";

    return {
      role,
      count: roleAgents.length,
      status: dominantStatus,
    };
  });

  res.json({
    totalProjects,
    activeProjects,
    deployedProjects,
    totalTasks,
    completedTasks,
    runningAgents,
    agentBreakdown,
    recentActivity,
  });
});

export default router;
