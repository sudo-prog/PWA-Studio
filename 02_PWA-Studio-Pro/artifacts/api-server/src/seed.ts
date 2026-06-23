import { db } from "@workspace/db";
import {
  projectsTable,
  layoutsTable,
  widgetRegistryTable,
  userSettingsTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";

async function seed() {
  console.log("🌱 Checking seed data...");

  // Only seed if no projects exist
  const [{ value: projectCount }] = await db
    .select({ value: count() })
    .from(projectsTable);

  if (Number(projectCount) > 0) {
    console.log("✅ Database already has data, skipping seed.");
    return;
  }

  console.log("🌱 Seeding database...");

  // Seed widget registry
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
      slug: "rss-feed",
      name: "RSS Feed",
      version: "1.0.0",
      description: "Displays items from any RSS feed URL",
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
  console.log("✅ Seeded 4 built-in widget registry entries");

  // Seed 2 projects
  const [project1] = await db
    .insert(projectsTable)
    .values({
      name: "Personal Dashboard",
      description: "A home screen with clock, weather, and news widgets for daily use",
    })
    .returning();

  const [project2] = await db
    .insert(projectsTable)
    .values({
      name: "Dev Workspace",
      description: "Developer-focused layout with code notes, terminal shortcuts, and task tracking",
    })
    .returning();

  console.log(`✅ Seeded 2 projects`);

  // Seed 1 layout per project
  await db.insert(layoutsTable).values([
    {
      projectId: project1.id,
      name: "Main Layout",
      gridLayout: [
        { i: "clock-1", x: 0, y: 0, w: 3, h: 2 },
        { i: "weather-1", x: 3, y: 0, w: 3, h: 2 },
        { i: "notes-1", x: 0, y: 2, w: 6, h: 4 },
        { i: "rss-1", x: 6, y: 0, w: 6, h: 6 },
      ],
      flowGraph: {
        nodes: [
          { id: "clock-1", type: "widget", position: { x: 100, y: 100 }, data: { slug: "clock", label: "Clock" } },
          { id: "weather-1", type: "widget", position: { x: 350, y: 100 }, data: { slug: "weather", label: "Weather" } },
          { id: "notes-1", type: "widget", position: { x: 100, y: 280 }, data: { slug: "notes", label: "Notes" } },
          { id: "rss-1", type: "widget", position: { x: 600, y: 100 }, data: { slug: "rss-feed", label: "RSS Feed" } },
        ],
        edges: [],
      },
    },
    {
      projectId: project2.id,
      name: "Dev Layout",
      gridLayout: [
        { i: "notes-dev", x: 0, y: 0, w: 8, h: 6 },
        { i: "clock-dev", x: 8, y: 0, w: 4, h: 2 },
        { i: "rss-dev", x: 8, y: 2, w: 4, h: 4 },
      ],
      flowGraph: {
        nodes: [
          { id: "notes-dev", type: "widget", position: { x: 100, y: 100 }, data: { slug: "notes", label: "Notes" } },
          { id: "clock-dev", type: "widget", position: { x: 500, y: 100 }, data: { slug: "clock", label: "Clock" } },
          { id: "rss-dev", type: "widget", position: { x: 500, y: 300 }, data: { slug: "rss-feed", label: "RSS Feed" } },
        ],
        edges: [
          { id: "e1", source: "notes-dev", target: "clock-dev" },
        ],
      },
    },
  ]);

  console.log("✅ Seeded 2 layouts");

  // Ensure settings singleton
  const [existingSettings] = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.id, 1));

  if (!existingSettings) {
    await db.insert(userSettingsTable).values({ id: 1 });
    console.log("✅ Seeded user settings");
  }

  console.log("🎉 Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
