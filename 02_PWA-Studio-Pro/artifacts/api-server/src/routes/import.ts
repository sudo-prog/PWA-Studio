import { Router, type IRouter } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { db } from "@workspace/db";
import {
  projectsTable,
  layoutsTable,
  widgetRegistryTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const FEATURE_PATTERNS: { pattern: RegExp; name: string; description: string; tags: string[] }[] = [
  { pattern: /auth|login|signin|signup|register|session/i, name: "Authentication", description: "Handles user authentication, sign-in, and session management.", tags: ["auth", "user"] },
  { pattern: /cart|checkout|payment|order|purchase|billing/i, name: "Cart & Checkout", description: "Shopping cart, checkout flow, and payment handling.", tags: ["commerce", "payment"] },
  { pattern: /map|location|geo|coordinate|marker|place/i, name: "Map & Location", description: "Geographic map view and location-based features.", tags: ["map", "geo"] },
  { pattern: /chat|message|inbox|thread|conversation|socket/i, name: "Chat & Messaging", description: "Real-time chat and messaging functionality.", tags: ["chat", "realtime"] },
  { pattern: /dashboard|overview|summary|metric|stat|kpi/i, name: "Dashboard", description: "Summary view of key metrics and statistics.", tags: ["dashboard", "analytics"] },
  { pattern: /profile|account|user|avatar|bio/i, name: "User Profile", description: "User profile display and account management.", tags: ["user", "profile"] },
  { pattern: /search|filter|query|find|lookup/i, name: "Search & Filter", description: "Search and filtering interface for content discovery.", tags: ["search", "ui"] },
  { pattern: /nav|menu|sidebar|header|footer|toolbar/i, name: "Navigation", description: "Application navigation, menus, and chrome.", tags: ["nav", "ui"] },
  { pattern: /setting|preference|config|option|theme/i, name: "Settings", description: "User preferences and application configuration.", tags: ["settings"] },
  { pattern: /notification|alert|toast|push|badge/i, name: "Notifications", description: "In-app notifications, alerts, and push messaging.", tags: ["notification", "ux"] },
  { pattern: /upload|file|media|image|photo|gallery/i, name: "Media & Files", description: "File upload, media management, and gallery views.", tags: ["media", "files"] },
  { pattern: /chart|graph|plot|visual|analytic|report/i, name: "Charts & Analytics", description: "Data visualisation and reporting components.", tags: ["charts", "analytics"] },
  { pattern: /calendar|event|schedule|booking|reservation/i, name: "Calendar & Scheduling", description: "Calendar views, event management, and booking.", tags: ["calendar", "scheduling"] },
  { pattern: /form|input|wizard|stepper|survey/i, name: "Forms", description: "Data entry forms, multi-step wizards, and surveys.", tags: ["form", "ui"] },
  { pattern: /api|service|fetch|http|request|endpoint/i, name: "API Service", description: "API communication layer and data-fetching service.", tags: ["api", "service"] },
];

interface DetectedFeature {
  id: string;
  suggestedSlug: string;
  suggestedName: string;
  description: string;
  sourceFiles: string[];
  confidence: "high" | "medium" | "low";
  tags: string[];
}

function detectFeaturesFromFiles(filePaths: string[]): DetectedFeature[] {
  const featureMap = new Map<string, DetectedFeature>();

  for (const filePath of filePaths) {
    const fileName = filePath.split("/").pop() ?? filePath;
    const baseName = fileName.replace(/\.(tsx?|jsx?|vue|svelte|css|scss|html)$/i, "");

    for (const fp of FEATURE_PATTERNS) {
      if (fp.pattern.test(baseName) || fp.pattern.test(filePath)) {
        const key = fp.name;
        if (!featureMap.has(key)) {
          featureMap.set(key, {
            id: crypto.randomUUID(),
            suggestedSlug: slugify(fp.name),
            suggestedName: fp.name,
            description: fp.description,
            sourceFiles: [],
            confidence: "high",
            tags: fp.tags,
          });
        }
        featureMap.get(key)!.sourceFiles.push(filePath);
        break;
      }
    }
  }

  return [...featureMap.values()];
}

function detectFeaturesFromHtml(html: string): DetectedFeature[] {
  const features: DetectedFeature[] = [];
  const seen = new Set<string>();

  const sectionRegex = /<(section|article|aside|nav|header|footer|main)\b[^>]*(?:id=["']([^"']+)["']|class=["']([^"']+)["'])[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const idVal = match[2] ?? "";
    const classVal = match[3] ?? "";
    const identifier = idVal || classVal.split(" ")[0];
    if (!identifier || identifier.length < 3) continue;

    const normalized = identifier.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());

    const displayName = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    features.push({
      id: crypto.randomUUID(),
      suggestedSlug: slugify(identifier),
      suggestedName: displayName,
      description: `${tag.charAt(0).toUpperCase() + tag.slice(1)} section: ${displayName.toLowerCase()} from the original PWA.`,
      sourceFiles: ["index.html"],
      confidence: "medium",
      tags: [tag, "imported"],
    });

    if (features.length >= 8) break;
  }

  return features;
}

function detectFramework(packageJson: Record<string, unknown>): string {
  const deps = {
    ...((packageJson.dependencies ?? {}) as Record<string, string>),
    ...((packageJson.devDependencies ?? {}) as Record<string, string>),
  };
  if (deps["react"] || deps["react-dom"]) return "React";
  if (deps["vue"]) return "Vue";
  if (deps["svelte"]) return "@svelte";
  if (deps["@angular/core"]) return "Angular";
  if (deps["next"]) return "Next.js";
  if (deps["nuxt"]) return "Nuxt";
  return "Unknown";
}

// ── POST /import/analyze ───────────────────────────────────────────────────

router.post("/import/analyze", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded. Send a ZIP as multipart field 'file'." });
    return;
  }
  if (!req.file.originalname.endsWith(".zip")) {
    res.status(400).json({ error: "File must be a .zip archive." });
    return;
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch {
    res.status(400).json({ error: "Could not read ZIP file. It may be corrupt." });
    return;
  }

  const entries = zip.getEntries();
  const filePaths: string[] = entries
    .filter((e) => !e.isDirectory)
    .map((e) => e.entryName)
    .filter((p) => !p.includes("node_modules/") && !p.includes(".git/") && !p.includes("dist/") && !p.includes("build/"));

  // Parse manifest.json
  let appName = "Imported PWA";
  let appDescription = "Imported from an existing PWA project.";
  let themeColor = "#000000";

  const manifestEntry = entries.find(
    (e) => !e.isDirectory && (e.name === "manifest.json" || e.name === "site.webmanifest")
  );
  if (manifestEntry) {
    try {
      const manifest = JSON.parse(zip.readAsText(manifestEntry));
      if (manifest.name) appName = manifest.name;
      if (manifest.short_name && !manifest.name) appName = manifest.short_name;
      if (manifest.description) appDescription = manifest.description;
      if (manifest.theme_color) themeColor = manifest.theme_color;
    } catch { /* ignore parse errors */ }
  }

  // Parse package.json for framework detection
  let framework = "Unknown";
  const pkgEntry = entries.find(
    (e) => !e.isDirectory && e.name === "package.json" && !e.entryName.includes("/")
  );
  if (pkgEntry) {
    try {
      const pkg = JSON.parse(zip.readAsText(pkgEntry));
      framework = detectFramework(pkg);
    } catch { /* ignore */ }
  }

  // Detect from HTML
  let htmlFeatures: DetectedFeature[] = [];
  const indexHtmlEntry = entries.find(
    (e) => !e.isDirectory && (e.name === "index.html" && !e.entryName.includes("/src/"))
  );
  if (indexHtmlEntry) {
    const html = zip.readAsText(indexHtmlEntry);
    htmlFeatures = detectFeaturesFromHtml(html);
  }

  // Detect from file names
  const sourceFiles = filePaths.filter((p) => /\.(tsx?|jsx?|vue|svelte)$/i.test(p));
  const fileFeatures = detectFeaturesFromFiles(sourceFiles);

  // Merge: prefer file-detected over HTML (higher confidence), deduplicate by slug
  const allFeatures: DetectedFeature[] = [];
  const slugsSeen = new Set<string>();

  for (const f of [...fileFeatures, ...htmlFeatures]) {
    const slug = f.suggestedSlug;
    if (!slugsSeen.has(slug)) {
      slugsSeen.add(slug);
      allFeatures.push(f);
    }
  }

  // If nothing found, create a single catch-all widget
  if (allFeatures.length === 0) {
    allFeatures.push({
      id: crypto.randomUUID(),
      suggestedSlug: slugify(appName) || "imported-app",
      suggestedName: appName,
      description: appDescription,
      sourceFiles: filePaths.slice(0, 5),
      confidence: "low",
      tags: ["imported"],
    });
  }

  res.json({
    appName,
    appDescription,
    framework,
    themeColor,
    totalFiles: filePaths.length,
    features: allFeatures,
  });
});

// ── POST /import/extract ───────────────────────────────────────────────────

const extractBodySchema = z.object({
  projectName: z.string().min(1).max(100),
  projectDescription: z.string().max(500).default(""),
  features: z.array(
    z.object({
      slug: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      description: z.string().default(""),
      tags: z.array(z.string()).default([]),
      schema: z.any().default({}),
    })
  ).min(1),
});

router.post("/import/extract", async (req, res): Promise<void> => {
  let body: z.infer<typeof extractBodySchema>;
  try {
    body = extractBodySchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    res.status(400).json({ error: "Invalid request body." });
    return;
  }

  const { projectName, projectDescription, features } = body;

  // Create the project
  const [project] = await db
    .insert(projectsTable)
    .values({ name: projectName, description: projectDescription })
    .returning();

  // Upsert widgets into registry (skip if slug already exists)
  const createdWidgets: string[] = [];
  for (const feature of features) {
    const existing = await db
      .select({ id: widgetRegistryTable.id })
      .from(widgetRegistryTable)
      .where(eq(widgetRegistryTable.slug, feature.slug));

    if (existing.length === 0) {
      await db.insert(widgetRegistryTable).values({
        slug: feature.slug,
        name: feature.name,
        description: feature.description,
        tags: [...feature.tags, "imported"],
        schema: feature.schema ?? {},
        isBuiltin: "false",
        version: "1.0.0",
      });
      createdWidgets.push(feature.slug);
    }
  }

  // Build a grid layout: 2-column grid, each widget 6 wide × 4 tall
  const COLS = 12;
  const W = 6;
  const H = 4;

  const gridLayout = features.map((feature, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    return {
      i: crypto.randomUUID(),
      x: col * W,
      y: row * H,
      w: W,
      h: H,
      widget: {
        id: crypto.randomUUID(),
        slug: feature.slug,
        mode: "full",
        config: {},
      },
    };
  });

  // Create the layout
  const [layout] = await db
    .insert(layoutsTable)
    .values({
      projectId: project.id,
      name: "Main Layout",
      gridLayout: gridLayout as any,
    })
    .returning();

  res.status(201).json({
    projectId: project.id,
    layoutId: layout.id,
    widgetsCreated: createdWidgets.length,
    widgetsSkipped: features.length - createdWidgets.length,
  });
});

export default router;
