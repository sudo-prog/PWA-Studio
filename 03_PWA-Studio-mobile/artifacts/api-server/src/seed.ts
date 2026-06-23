import { db } from "@workspace/db";
import {
  projectsTable,
  kanbanColumnsTable,
  kanbanTasksTable,
  agentStatusTable,
  activityEventsTable,
  canvasSnapshotsTable,
  appSettingsTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";

async function seed() {
  console.log("🌱 Checking seed data...");

  // --- App Settings (singleton, id=1) ---
  const [existingSettings] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.id, 1));

  if (!existingSettings) {
    await db.insert(appSettingsTable).values({
      id: 1,
      theme: "dark",
      defaultModel: "gpt-4o",
    });
    console.log("✅ Seeded app settings (id=1, theme=dark, defaultModel=gpt-4o)");
  } else {
    console.log("✅ App settings already exist, skipping.");
  }

  // --- Find or create a sample project for kanban/agent data ---
  let projectId: number;

  const [existingProject] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.name, "My Mobile App"));

  if (existingProject) {
    projectId = existingProject.id;
    console.log(`✅ Found existing project 'My Mobile App' (id=${projectId})`);
  } else {
    const [project] = await db
      .insert(projectsTable)
      .values({
        name: "My Mobile App",
        description: "A sample mobile project with kanban board and agent status tracking",
        status: "active",
      })
      .returning();

    projectId = project.id;
    console.log(`✅ Created sample project 'My Mobile App' (id=${projectId})`);
  }

  // --- Agent Status (3 agents: director, builder, tester) ---
  const [{ value: agentCount }] = await db
    .select({ value: count() })
    .from(agentStatusTable)
    .where(eq(agentStatusTable.projectId, projectId));

  if (Number(agentCount) === 0) {
    await db.insert(agentStatusTable).values([
      {
        projectId,
        role: "director",
        status: "idle",
      },
      {
        projectId,
        role: "builder",
        status: "idle",
      },
      {
        projectId,
        role: "tester",
        status: "idle",
      },
    ]);
    console.log("✅ Seeded 3 agent status entries (director:idle, builder:idle, tester:idle)");
  } else {
    console.log("✅ Agent status entries already exist for project, skipping.");
  }

  // --- Kanban Columns (To Do, In Progress, Done) ---
  const [{ value: columnCount }] = await db
    .select({ value: count() })
    .from(kanbanColumnsTable)
    .where(eq(kanbanColumnsTable.projectId, projectId));

  if (Number(columnCount) === 0) {
    await db.insert(kanbanColumnsTable).values([
      {
        projectId,
        name: "To Do",
        order: 0,
        color: "#6366f1",
      },
      {
        projectId,
        name: "In Progress",
        order: 1,
        color: "#f59e0b",
      },
      {
        projectId,
        name: "Done",
        order: 2,
        color: "#10b981",
      },
    ]);
    console.log("✅ Seeded 3 kanban columns (To Do, In Progress, Done)");
  } else {
    console.log("✅ Kanban columns already exist for project, skipping.");
  }

  console.log("🎉 Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
