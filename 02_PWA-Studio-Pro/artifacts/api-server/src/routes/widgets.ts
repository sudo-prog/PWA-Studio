import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { widgetRegistryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// GET /widgets/registry — list all
router.get("/widgets/registry", async (_req, res) => {
  try {
    const entries = await db.select().from(widgetRegistryTable);
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: "Failed to list widget registry" });
  }
});

// POST /widgets/registry — register
router.post("/widgets/registry", async (req, res) => {
  try {
    const bodySchema = z.object({
      slug: z.string(),
      name: z.string(),
      version: z.string().default("1.0.0"),
      description: z.string().default(""),
      schema: z.any().default({}),
      tags: z.array(z.string()).default([]),
      isBuiltin: z.string().default("false"),
    });
    const body = bodySchema.parse(req.body);

    const [entry] = await db
      .insert(widgetRegistryTable)
      .values(body)
      .returning();

    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to register widget" });
  }
});

// GET /widgets/registry/:slug
router.get("/widgets/registry/:slug", async (req, res) => {
  try {
    const [entry] = await db
      .select()
      .from(widgetRegistryTable)
      .where(eq(widgetRegistryTable.slug, req.params.slug));

    if (!entry) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: "Failed to get widget" });
  }
});

export default router;
