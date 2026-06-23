import { db } from "@workspace/db";
import {
  projectsTable,
  layoutsTable,
  widgetRegistryTable,
  userSettingsTable,
  widgetsTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";

async function seed() {
  console.log("🌱 Checking seed data...");

  // Check if the widget registry already has entries to make seed idempotent
  const [{ value: widgetCount }] = await db
    .select({ value: count() })
    .from(widgetRegistryTable);

  if (Number(widgetCount) > 0) {
    console.log("✅ Widget registry already populated, skipping widget seed.");
  } else {
    // Seed 6 built-in widgets
    const builtinWidgets = [
      {
        slug: "clock",
        name: "Clock",
        version: "1.0.0",
        description: "Displays the current time with timezone support",
        schema: {
          type: "object",
          properties: {
            timezone: { type: "string", default: "UTC" },
            format: { type: "string", enum: ["12h", "24h"], default: "24h" },
            showSeconds: { type: "boolean", default: true },
          },
        },
        tags: ["time", "utility"],
        isBuiltin: "true",
      },
      {
        slug: "weather",
        name: "Weather",
        version: "1.0.0",
        description: "Shows current weather conditions for a location",
        schema: {
          type: "object",
          properties: {
            location: { type: "string", default: "San Francisco, CA" },
            units: { type: "string", enum: ["metric", "imperial"], default: "metric" },
          },
        },
        tags: ["weather", "data"],
        isBuiltin: "true",
      },
      {
        slug: "notes",
        name: "Notes",
        version: "1.0.0",
        description: "A simple rich-text notepad widget",
        schema: {
          type: "object",
          properties: {
            placeholder: { type: "string", default: "Start writing..." },
            fontSize: { type: "number", default: 14 },
          },
        },
        tags: ["text", "productivity"],
        isBuiltin: "true",
      },
      {
        slug: "calculator",
        name: "Calculator",
        version: "1.0.0",
        description: "A basic calculator widget with standard arithmetic operations",
        schema: {
          type: "object",
          properties: {
            theme: { type: "string", enum: ["light", "dark"], default: "dark" },
            precision: { type: "number", default: 2 },
          },
        },
        tags: ["utility", "math"],
        isBuiltin: "true",
      },
      {
        slug: "iframe",
        name: "iFrame",
        version: "1.0.0",
        description: "Embeds any web page or content via URL",
        schema: {
          type: "object",
          properties: {
            url: { type: "string", default: "https://example.com" },
            height: { type: "number", default: 400 },
            allowFullscreen: { type: "boolean", default: true },
          },
        },
        tags: ["embed", "web"],
        isBuiltin: "true",
      },
      {
        slug: "rss",
        name: "RSS Feed",
        version: "1.0.0",
        description: "Displays items from any RSS or Atom feed URL",
        schema: {
          type: "object",
          properties: {
            feedUrl: { type: "string", default: "https://feeds.example.com/latest" },
            maxItems: { type: "number", default: 5 },
            showImages: { type: "boolean", default: true },
          },
        },
        tags: ["news", "feed", "data"],
        isBuiltin: "true",
      },
    ];

    await db.insert(widgetRegistryTable).values(builtinWidgets);
    console.log("✅ Seeded 6 built-in widget registry entries");
  }

  // Check if sample project already exists
  const [existingProject] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.name, "My First PWA"));

  let projectId: string;

  if (existingProject) {
    projectId = existingProject.id;
    console.log("✅ Sample project 'My First PWA' already exists, skipping project seed.");
  } else {
    // Seed 1 sample project
    const [project] = await db
      .insert(projectsTable)
      .values({
        name: "My First PWA",
        description: "A starter project with essential widgets for your daily workflow",
      })
      .returning();

    projectId = project.id;
    console.log("✅ Seeded sample project 'My First PWA'");

    // Seed layout for the project
    const [existingLayout] = await db
      .select()
      .from(layoutsTable)
      .where(eq(layoutsTable.projectId, projectId));

    if (!existingLayout) {
      await db.insert(layoutsTable).values({
        projectId: project.id,
        name: "Main Dashboard",
        gridLayout: [
          { i: "clock-1", x: 0, y: 0, w: 3, h: 2 },
          { i: "weather-1", x: 3, y: 0, w: 3, h: 2 },
          { i: "notes-1", x: 0, y: 2, w: 6, h: 4 },
          { i: "calculator-1", x: 6, y: 0, w: 3, h: 2 },
          { i: "rss-1", x: 6, y: 2, w: 3, h: 4 },
          { i: "iframe-1", x: 9, y: 0, w: 3, h: 6 },
        ],
        flowGraph: {
          nodes: [
            { id: "clock-1", type: "widget", position: { x: 50, y: 50 }, data: { slug: "clock", label: "Clock" } },
            { id: "weather-1", type: "widget", position: { x: 300, y: 50 }, data: { slug: "weather", label: "Weather" } },
            { id: "notes-1", type: "widget", position: { x: 50, y: 220 }, data: { slug: "notes", label: "Notes" } },
            { id: "calculator-1", type: "widget", position: { x: 550, y: 50 }, data: { slug: "calculator", label: "Calculator" } },
            { id: "rss-1", type: "widget", position: { x: 550, y: 220 }, data: { slug: "rss", label: "RSS Feed" } },
            { id: "iframe-1", type: "widget", position: { x: 800, y: 50 }, data: { slug: "iframe", label: "iFrame" } },
          ],
          edges: [],
        },
      });
      console.log("✅ Seeded layout 'Main Dashboard'");
    } else {
      console.log("✅ Layout already exists for project, skipping layout seed.");
    }

    // Seed widget instances for the project
    const [{ value: widgetInstanceCount }] = await db
      .select({ value: count() })
      .from(widgetsTable)
      .where(eq(widgetsTable.projectId, projectId));

    if (Number(widgetInstanceCount) === 0) {
      await db.insert(widgetsTable).values([
        { projectId, widgetType: "clock", config: { timezone: "UTC", format: "24h" }, positionX: 0, positionY: 0 },
        { projectId, widgetType: "weather", config: { location: "San Francisco, CA", units: "metric" }, positionX: 3, positionY: 0 },
        { projectId, widgetType: "notes", config: { placeholder: "Write your notes here..." }, positionX: 0, positionY: 2 },
        { projectId, widgetType: "calculator", config: { theme: "dark" }, positionX: 6, positionY: 0 },
        { projectId, widgetType: "rss", config: { feedUrl: "https://feeds.example.com/latest", maxItems: 5 }, positionX: 6, positionY: 2 },
        { projectId, widgetType: "iframe", config: { url: "https://example.com", height: 400 }, positionX: 9, positionY: 0 },
      ]);
      console.log("✅ Seeded 6 widget instances for project");
    } else {
      console.log("✅ Widget instances already exist for project, skipping.");
    }
  }

  // Ensure user settings singleton (id=1) - idempotent via upsert
  const [existingSettings] = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.id, 1));

  if (!existingSettings) {
    await db.insert(userSettingsTable).values({ id: 1 });
    console.log("✅ Seeded user settings (id=1)");
  } else {
    console.log("✅ User settings already exist, skipping.");
  }

  console.log("🎉 Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
