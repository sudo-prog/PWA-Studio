import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const SETTINGS_ID = 1;

async function ensureSettings() {
  const [existing] = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.id, SETTINGS_ID));

  if (!existing) {
    const [created] = await db
      .insert(userSettingsTable)
      .values({ id: SETTINGS_ID })
      .returning();
    return created;
  }
  return existing;
}

const router: IRouter = Router();

// GET /settings
router.get("/settings", async (_req, res) => {
  try {
    const settings = await ensureSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to get settings" });
  }
});

// PATCH /settings
router.patch("/settings", async (req, res) => {
  try {
    const bodySchema = z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      activeModel: z.string().optional(),
      apiOverrides: z.record(z.any()).optional(),
    });
    const body = bodySchema.parse(req.body);

    await ensureSettings();

    const [settings] = await db
      .update(userSettingsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(userSettingsTable.id, SETTINGS_ID))
      .returning();

    res.json(settings);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
