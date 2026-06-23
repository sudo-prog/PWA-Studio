import { useEffect, useState } from "react";
import { useListAgents, getListAgentsQueryKey, useGetSettings, getGetSettingsQueryKey, useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_ROLES, AGENT_ROLE_COLORS } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, AlertTriangle, CheckCircle2, User, Loader2,
  Sparkles, Settings, Brain, KanbanSquare, Code2, GitCommit, Circle,
  Send, Wrench, FileCode2, ExternalLink, Copy, ChevronDown, ChevronUp,
  Github,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const PIPELINE_STEPS = [
  { id: "planning",  label: "Planning",    icon: Brain },
  { id: "kanban",    label: "Kanban",      icon: KanbanSquare },
  { id: "codegen",   label: "Code Gen",    icon: Code2 },
  { id: "pushing",   label: "Pushing",     icon: GitCommit },
] as const;

type StepId = (typeof PIPELINE_STEPS)[number]["id"];

interface LiveStep {
  step: StepId;
  message: string;
  percent: number;
  done?: boolean;
  error?: boolean;
}

interface DirectorResult {
  mode: "direct-edit" | "vscode-plan";
  summary: string;
  filesChanged?: number;
  files?: string[];
  githubUrl?: string | null;
  copilotPrompt?: string;
  planMarkdown?: string;
}

export default function AgentStatusPanel({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [liveStep, setLiveStep] = useState<LiveStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());

  // Director Chat state
  const [instruction, setInstruction] = useState("");
  const [chatMode, setChatMode] = useState<"direct-edit" | "vscode-plan">("direct-edit");
  const [dirResult, setDirResult] = useState<DirectorResult | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  const { data: agents, isLoading } = useListAgents(projectId, {
    query: { enabled: !!projectId, queryKey: getListAgentsQueryKey(projectId) },
  });

  const { data: project } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  // ── SSE ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    const es = new EventSource(`/api/projects/${projectId}/stream`);
    const on = (type: string, fn: (p: any) => void) =>
      es.addEventListener(type, (e) => { try { fn(JSON.parse((e as MessageEvent).data)); } catch {} });

    on("agents_updated", () => queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey(projectId) }));
    on("activity_added", () => queryClient.invalidateQueries({ queryKey: ["activity", projectId] }));
    on("kanban_updated", () => queryClient.invalidateQueries({ queryKey: ["kanban", projectId] }));
    on("agent_step", ({ step, message, percent, done, error }: LiveStep) => {
      setLiveStep({ step, message, percent, done, error });
      if (done && !error) setCompletedSteps((prev) => new Set([...prev, step]));
    });

    return () => es.close();
  }, [projectId, queryClient]);

  const hasLLM = !!(settings?.openaiKey || settings?.anthropicKey || settings?.geminiKey || settings?.customEndpoint);
  const hasGitHub = !!(project?.githubRepo && settings?.githubToken);

  // ── Run full agent pipeline ────────────────────────────────────────────────
  const runAgent = useMutation({
    mutationFn: () =>
      customFetch<{ success: boolean; plan: any; eventCount: number; kanbanCount: number; filesCount: number }>(
        `/api/projects/${projectId}/run-agent`, { method: "POST" },
      ),
    onMutate: () => { setLiveStep(null); setCompletedSteps(new Set()); setDirResult(null); },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      const parts = [
        data.plan?.summary,
        data.kanbanCount ? `${data.kanbanCount} tasks added to Kanban` : null,
        data.filesCount ? `${data.filesCount} files pushed to GitHub` : null,
      ].filter(Boolean);
      toast({ title: "Agent complete ✓", description: parts.join(" · ") || "Done" });
    },
    onError: (err: unknown) => {
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey(projectId) });
      toast({ title: "Agent failed", description: err instanceof Error ? err.message : "Agent run failed", variant: "destructive" });
      setLiveStep(null);
    },
  });

  // ── Director Chat ──────────────────────────────────────────────────────────
  const directorChat = useMutation({
    mutationFn: (vars: { instruction: string; mode: string }) =>
      customFetch<DirectorResult & { success: boolean }>(
        `/api/projects/${projectId}/director-chat`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vars) },
      ),
    onMutate: () => { setLiveStep(null); setCompletedSteps(new Set()); setDirResult(null); setShowPlan(false); },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
      setDirResult(data);
      setInstruction("");
      toast({
        title: data.mode === "vscode-plan" ? "VS Code plan ready ✓" : "Changes applied ✓",
        description: data.summary,
      });
    },
    onError: (err: unknown) => {
      queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey(projectId) });
      toast({ title: "Director failed", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
      setLiveStep(null);
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: "Copied!", description: "Paste it into VS Code Copilot Chat." })
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }

  const agentData = AGENT_ROLES.map((role) => {
    const found = agents?.find((a) => a.role === role);
    return found || { id: 0, projectId, role: role as any, status: "idle", currentTask: null, progress: 0, updatedAt: new Date().toISOString() };
  });

  const isRunning = runAgent.isPending || directorChat.isPending || agentData.some((a) => a.status === "running");
  const activeStepIndex = PIPELINE_STEPS.findIndex((s) => s.id === liveStep?.step);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":  return <Loader2 className="h-4 w-4 animate-spin" />;
      case "idle":     return <Pause className="h-4 w-4" />;
      case "waiting":  return <Play className="h-4 w-4 opacity-50" />;
      case "error":    return <AlertTriangle className="h-4 w-4" />;
      case "complete": return <CheckCircle2 className="h-4 w-4" />;
      default:         return <Pause className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":  return "text-primary";
      case "idle":     return "text-muted-foreground";
      case "waiting":  return "text-amber-500";
      case "error":    return "text-destructive";
      case "complete": return "text-emerald-500";
      default:         return "text-muted-foreground";
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto bg-[#f8fafc] dark:bg-[#0f111a]">

      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold mb-1">Agent Team</h2>
          <p className="text-sm text-muted-foreground">
            Chat with the Director to fix or extend your PWA, or run the full planning pipeline.
          </p>
        </div>

        {hasLLM ? (
          <Button onClick={() => runAgent.mutate()} disabled={isRunning} className="rounded-xl shadow-md shrink-0">
            {runAgent.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Full Pipeline</>
            )}
          </Button>
        ) : (
          <Link href="/settings">
            <Button variant="outline" className="rounded-xl shrink-0">
              <Settings className="h-4 w-4 mr-2" />Add API Key
            </Button>
          </Link>
        )}
      </div>

      {/* ── No LLM notice ── */}
      {!hasLLM && (
        <div className="mb-6 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <strong>No LLM configured.</strong> Add an API key or custom endpoint in{" "}
          <Link href="/settings" className="underline font-medium">Settings</Link> to use the Director.
          Supports OpenAI, Anthropic, or local Ollama (<code>http://localhost:11434/v1</code>).
        </div>
      )}

      {/* ── Director Chat ── */}
      {hasLLM && (
        <div className="mb-6 rounded-2xl glass-panel border border-border/50 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold">Director Chat</span>
            <span className="text-xs text-muted-foreground ml-1">— tell the Director what to build, add, or fix</span>
          </div>

          <Textarea
            placeholder="e.g. Add a dark mode toggle to the navbar… or Fix the mobile layout on the hero section… or Add a contact form with email validation…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="mb-3 resize-none rounded-xl text-sm min-h-[72px]"
            disabled={isRunning}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && instruction.trim() && !isRunning) {
                directorChat.mutate({ instruction: instruction.trim(), mode: chatMode });
              }
            }}
          />

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              <button
                onClick={() => setChatMode("direct-edit")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  chatMode === "direct-edit"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                Quick Fix
              </button>
              <button
                onClick={() => setChatMode("vscode-plan")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                  chatMode === "vscode-plan"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                VS Code Plan
              </button>
            </div>

            <span className="text-xs text-muted-foreground hidden sm:block">
              {chatMode === "direct-edit"
                ? "Director reads files, edits code & pushes a commit"
                : "Director writes a detailed plan for VS Code / Copilot agents"}
            </span>

            <Button
              size="sm"
              className="ml-auto rounded-xl shrink-0"
              disabled={!instruction.trim() || isRunning}
              onClick={() => directorChat.mutate({ instruction: instruction.trim(), mode: chatMode })}
            >
              {directorChat.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              {directorChat.isPending ? "Working…" : "Send"}
            </Button>
          </div>

          {/* ── Director result card ── */}
          <AnimatePresence>
            {dirResult && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className={`rounded-xl border p-3 text-sm ${
                  dirResult.mode === "vscode-plan"
                    ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
                    : "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${dirResult.mode === "vscode-plan" ? "text-blue-500" : "text-emerald-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{dirResult.summary}</p>
                      {dirResult.files && dirResult.files.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {dirResult.files.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {dirResult.githubUrl && (
                      <a href={dirResult.githubUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg">
                          <Github className="h-3 w-3 mr-1" />
                          {dirResult.mode === "vscode-plan" ? "View Plan on GitHub" : "View Commit"}
                          <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
                        </Button>
                      </a>
                    )}

                    {dirResult.copilotPrompt && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-lg"
                        onClick={() => copyToClipboard(dirResult.copilotPrompt!)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Copilot Prompt
                      </Button>
                    )}

                    {dirResult.planMarkdown && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs rounded-lg ml-auto"
                        onClick={() => setShowPlan((v) => !v)}
                      >
                        {showPlan ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        {showPlan ? "Hide Plan" : "View Plan"}
                      </Button>
                    )}
                  </div>

                  {/* Inline plan viewer */}
                  <AnimatePresence>
                    {showPlan && dirResult.planMarkdown && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <pre className="mt-3 p-3 rounded-lg bg-black/5 dark:bg-white/5 text-xs overflow-x-auto whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">
                          {dirResult.planMarkdown}
                        </pre>
                        {dirResult.copilotPrompt && (
                          <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                            <p className="text-xs font-medium text-primary mb-1">Paste into VS Code Copilot Chat:</p>
                            <code className="text-xs text-muted-foreground break-all">{dirResult.copilotPrompt}</code>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Live pipeline strip ── */}
      <AnimatePresence>
        {isRunning && liveStep && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mb-6 overflow-hidden"
          >
            <div className="rounded-2xl glass-panel border border-primary/10 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">Live Pipeline</span>
                <Badge variant="secondary" className="ml-auto text-xs">{liveStep.percent}%</Badge>
              </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {PIPELINE_STEPS.map((s, i) => {
                  const isDone = completedSteps.has(s.id);
                  const isActive = liveStep?.step === s.id && !liveStep.done;
                  const isError = liveStep?.step === s.id && liveStep.error;
                  const Icon = s.icon;
                  return (
                    <div key={s.id} className="flex items-center gap-1.5">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                        isError ? "bg-destructive/10 text-destructive"
                          : isDone ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : isActive ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "bg-muted/50 text-muted-foreground"
                      }`}>
                        {isError ? <AlertTriangle className="h-3 w-3" />
                          : isDone ? <CheckCircle2 className="h-3 w-3" />
                          : isActive ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Circle className="h-3 w-3 opacity-40" />}
                        <Icon className="h-3 w-3" />
                        {s.label}
                      </div>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className={`h-px w-3 ${i < activeStepIndex ? "bg-emerald-400" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {liveStep?.message && (
                <p className="text-xs text-muted-foreground truncate">{liveStep.message}</p>
              )}
              <Progress value={liveStep?.percent ?? 10} className="h-1 mt-2" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Agent cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agentData.map((agent, index) => (
          <motion.div
            key={agent.role}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className={`glass-panel border-0 shadow-sm h-full overflow-hidden transition-all duration-300 ${agent.status === "running" ? "ring-1 ring-primary/30" : ""}`}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${AGENT_ROLE_COLORS[agent.role]}`}>
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold capitalize leading-none">{agent.role}</h3>
                      <div className={`flex items-center gap-1 text-xs mt-1 font-medium capitalize ${getStatusColor(agent.status)}`}>
                        {getStatusIcon(agent.status)}
                        {agent.status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Current Task</div>
                    <div className="text-sm font-medium line-clamp-2 h-10">
                      {agent.currentTask || "Standing by for assignment…"}
                    </div>
                  </div>

                  {agent.status === "running" && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{agent.progress || 0}%</span>
                      </div>
                      <Progress value={agent.progress || 0} className="h-1.5" />
                    </div>
                  )}
                  {agent.status !== "running" && <div className="h-[22px] pt-2" />}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
