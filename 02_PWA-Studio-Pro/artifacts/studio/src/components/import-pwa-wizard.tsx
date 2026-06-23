import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import {
  Upload,
  FileArchive,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PackagePlus,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";

interface DetectedFeature {
  id: string;
  suggestedSlug: string;
  suggestedName: string;
  description: string;
  sourceFiles: string[];
  confidence: "high" | "medium" | "low";
  tags: string[];
}

interface AnalyzeResult {
  appName: string;
  appDescription: string;
  framework: string;
  themeColor: string;
  totalFiles: number;
  features: DetectedFeature[];
}

interface EditableFeature {
  id: string;
  selected: boolean;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  sourceFiles: string[];
  confidence: "high" | "medium" | "low";
  expanded: boolean;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  medium: "text-yellow-400 border-yellow-800 bg-yellow-950/40",
  low: "text-slate-400 border-slate-700 bg-slate-900/40",
};

function buildApiUrl(path: string) {
  const base = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  return `${base}/api/${path.replace(/^\//, "")}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "review" | "done";

export function ImportPwaWizard({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [features, setFeatures] = useState<EditableFeature[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [result, setResult] = useState<{ projectId: string; widgetsCreated: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  function reset() {
    setStep("upload");
    setFile(null);
    setAnalyzing(false);
    setExtracting(false);
    setAnalyzeResult(null);
    setFeatures([]);
    setProjectName("");
    setProjectDescription("");
    setResult(null);
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  function acceptFile(f: File) {
    if (!f.name.endsWith(".zip")) {
      toast({ title: "ZIP files only", description: "Please upload a .zip archive of your PWA project.", variant: "destructive" });
      return;
    }
    setFile(f);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  async function analyze() {
    if (!file) return;
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(buildApiUrl("import/analyze"), { method: "POST", body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server error ${resp.status}`);
      }
      const data: AnalyzeResult = await resp.json();
      setAnalyzeResult(data);
      setProjectName(data.appName);
      setProjectDescription(data.appDescription);
      setFeatures(
        data.features.map((f) => ({
          id: f.id,
          selected: true,
          slug: f.suggestedSlug,
          name: f.suggestedName,
          description: f.description,
          tags: f.tags,
          sourceFiles: f.sourceFiles,
          confidence: f.confidence,
          expanded: false,
        }))
      );
      setStep("review");
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  async function extract() {
    const selected = features.filter((f) => f.selected);
    if (selected.length === 0) {
      toast({ title: "Select at least one feature", variant: "destructive" });
      return;
    }
    setExtracting(true);
    try {
      const resp = await fetch(buildApiUrl("import/extract"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          projectDescription,
          features: selected.map((f) => ({
            slug: f.slug,
            name: f.name,
            description: f.description,
            tags: f.tags,
            schema: {},
          })),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server error ${resp.status}`);
      }
      const data = await resp.json();
      setResult({ projectId: data.projectId, widgetsCreated: data.widgetsCreated });
      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setStep("done");
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }

  function toggleFeature(id: string) {
    setFeatures((prev) => prev.map((f) => f.id === id ? { ...f, selected: !f.selected } : f));
  }

  function toggleExpand(id: string) {
    setFeatures((prev) => prev.map((f) => f.id === id ? { ...f, expanded: !f.expanded } : f));
  }

  function updateFeature(id: string, patch: Partial<EditableFeature>) {
    setFeatures((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }

  const selectedCount = features.filter((f) => f.selected).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-primary" />
            Import PWA Project
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2">
            {(["upload", "review", "done"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium border
                  ${step === s ? "border-primary bg-primary text-primary-foreground" :
                    (["upload", "review", "done"].indexOf(step) > i)
                      ? "border-emerald-600 bg-emerald-950 text-emerald-400"
                      : "border-border text-muted-foreground"}`}>
                  {(["upload", "review", "done"].indexOf(step) > i) ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs ${step === s ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {s === "upload" ? "Upload" : s === "review" ? "Review Features" : "Done"}
                </span>
                {i < 2 && <div className="w-6 h-px bg-border" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload a <span className="font-medium text-foreground">.zip</span> archive of your existing PWA project.
                  The studio will scan it for distinct features and let you turn each one into a reusable widget.
                </p>
              </div>

              <div
                className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer
                  ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
                  ${file ? "bg-card" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
                />
                {file ? (
                  <div className="flex items-center gap-3 px-4 py-5">
                    <FileArchive className="w-8 h-8 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB — click to change</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Drop your PWA .zip here</p>
                    <p className="text-xs text-muted-foreground">or click to browse — max 50 MB</p>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-1">
                <p className="text-xs font-medium text-foreground">What gets detected</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  <li>App name & description from <code className="text-xs">manifest.json</code></li>
                  <li>Named sections from <code className="text-xs">index.html</code></li>
                  <li>Feature modules by filename (auth, cart, map, chat, dashboard…)</li>
                  <li>UI framework from <code className="text-xs">package.json</code></li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 2: Review Features ── */}
          {step === "review" && analyzeResult && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{analyzeResult.appName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {analyzeResult.framework} · {analyzeResult.totalFiles} files scanned · {features.length} feature{features.length !== 1 ? "s" : ""} detected
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">{selectedCount} selected</Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New project name</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Rebuilt PWA"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
                <Textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Rebuilt from an existing PWA using the modular widget system."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detected features</Label>
                  <div className="flex gap-2">
                    <button className="text-xs text-primary hover:underline" onClick={() => setFeatures((p) => p.map((f) => ({ ...f, selected: true })))}>
                      all
                    </button>
                    <span className="text-xs text-muted-foreground">/</span>
                    <button className="text-xs text-primary hover:underline" onClick={() => setFeatures((p) => p.map((f) => ({ ...f, selected: false })))}>
                      none
                    </button>
                  </div>
                </div>

                {features.map((feature) => (
                  <div
                    key={feature.id}
                    className={`rounded-md border transition-colors ${feature.selected ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"}`}
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Checkbox
                        checked={feature.selected}
                        onCheckedChange={() => toggleFeature(feature.id)}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{feature.name}</span>
                          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{feature.slug}</code>
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[feature.confidence]}`}>
                            {feature.confidence}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{feature.description}</p>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        onClick={() => toggleExpand(feature.id)}
                        aria-label="Expand feature editor"
                      >
                        {feature.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {feature.expanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-border/60 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Widget name</Label>
                            <Input
                              value={feature.name}
                              onChange={(e) => updateFeature(feature.id, { name: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Slug (unique ID)</Label>
                            <Input
                              value={feature.slug}
                              onChange={(e) => updateFeature(feature.id, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                              className="h-7 text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <Textarea
                            value={feature.description}
                            onChange={(e) => updateFeature(feature.id, { description: e.target.value })}
                            rows={2}
                            className="text-xs resize-none"
                          />
                        </div>
                        {feature.sourceFiles.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Matched source files</Label>
                            <div className="flex flex-wrap gap-1">
                              {feature.sourceFiles.slice(0, 6).map((f) => (
                                <code key={f} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                  {f.split("/").pop()}
                                </code>
                              ))}
                              {feature.sourceFiles.length > 6 && (
                                <span className="text-xs text-muted-foreground">+{feature.sourceFiles.length - 6} more</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && result && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-950/60 border border-emerald-800 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-semibold text-foreground">Project rebuilt</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  <span className="font-medium text-foreground">{result.widgetsCreated}</span> new widget{result.widgetsCreated !== 1 ? "s" : ""} added to
                  your library. The project has been created with a pre-populated layout — ready to edit.
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-4 py-3 w-full max-w-xs space-y-1 text-left">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</p>
                <p className="text-sm font-semibold text-foreground">{projectName}</p>
                {projectDescription && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{projectDescription}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-2">
          {step === "upload" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!file || analyzing}
                onClick={analyze}
                className="gap-1.5"
              >
                {analyzing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                ) : (
                  <>Analyze ZIP <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </Button>
            </>
          )}

          {step === "review" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")} className="gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <Button
                size="sm"
                disabled={selectedCount === 0 || !projectName.trim() || extracting}
                onClick={extract}
                className="gap-1.5"
              >
                {extracting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…</>
                ) : (
                  <>Extract {selectedCount} widget{selectedCount !== 1 ? "s" : ""} <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </Button>
            </>
          )}

          {step === "done" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>Close</Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  handleClose(false);
                  if (result) setLocation(`/studio/${result.projectId}`);
                }}
              >
                Open in Studio <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
