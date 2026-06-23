import { useRoute, useLocation, Link, Switch, Route } from "wouter";
import {
  useGetProject,
  getGetProjectQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  LayoutTemplate,
  KanbanSquare,
  Users,
  Activity,
  MonitorSmartphone,
  Github,
  CloudUpload,
  Loader2,
  ExternalLink,
  GitFork,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBackupProject, usePublishProject, useInitRepo } from "@/hooks/useGitHub";

import ForgeCanvas from "./canvas";
import KanbanBoard from "./kanban";
import AgentStatusPanel from "./agents";
import ActivityFeed from "./activity";

export default function ProjectDetailRouter() {
  const [match, params] = useRoute("/projects/:projectId/*?");
  const projectId = params?.projectId ? parseInt(params.projectId, 10) : 0;
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useGetProject(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectQueryKey(projectId),
    },
  });

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const backup = useBackupProject();
  const publish = usePublishProject();
  const initRepo = useInitRepo();

  const hasGitHub = !!(settings?.githubToken);
  const hasRepo = !!(project?.githubRepo);
  const repoUrl = hasRepo
    ? `https://github.com/${project!.githubRepo}`
    : null;

  function handleBackup() {
    backup.mutate(projectId, {
      onSuccess: (result) => {
        toast({
          title: "Backup successful",
          description: (
            <span>
              Project saved to{" "}
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                {result.repo}
              </a>
            </span>
          ),
        });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Backup failed";
        toast({ title: "Backup failed", description: msg, variant: "destructive" });
      },
    });
  }

  function handlePublish() {
    publish.mutate(projectId, {
      onSuccess: (result) => {
        toast({
          title: "Published to GitHub Pages",
          description: (
            <span>
              Live at{" "}
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                {result.url}
              </a>
            </span>
          ),
        });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Publish failed";
        toast({ title: "Publish failed", description: msg, variant: "destructive" });
      },
    });
  }

  function handleInitRepo() {
    initRepo.mutate(projectId, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        toast({
          title: "GitHub repo created",
          description: (
            <span>
              Scaffolded{" "}
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                {result.repo}
              </a>{" "}
              with {result.filesCount} files ({result.framework})
            </span>
          ),
        });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Repo creation failed";
        toast({ title: "Create repo failed", description: msg, variant: "destructive" });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  const tabs = [
    { id: "canvas", label: "Canvas", icon: LayoutTemplate },
    { id: "kanban", label: "Kanban", icon: KanbanSquare },
    { id: "agents", label: "Agents", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
    ...(project.previewUrl ? [{ id: "preview", label: "Preview", icon: Globe }] : []),
  ];

  const currentTab = params?.["*"]?.split("/")[0] || "canvas";

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex-none bg-background/80 backdrop-blur-xl border-b border-border/50 pb-4 mb-4 sticky top-0 z-20">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {project.name}
              </h1>
              <Badge
                variant="secondary"
                className={cn(
                  "capitalize px-2.5 py-0.5 text-xs font-medium",
                  PROJECT_STATUS_COLORS[project.status],
                )}
              >
                {project.status}
              </Badge>
              {/* Repo link badge */}
              {hasRepo && repoUrl && (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={`GitHub: ${project.githubRepo}`}
                >
                  <Github className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{project.githubRepo}</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground truncate mt-1">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            {project.previewUrl && (
              <Link href={`/projects/${projectId}/preview`}>
                <Button
                  variant="outline"
                  className="rounded-xl shadow-sm hidden sm:flex"
                >
                  <MonitorSmartphone className="h-4 w-4 mr-2 text-primary" />
                  Preview
                </Button>
              </Link>
            )}

            {hasGitHub && (
              <>
                {/* Create Repo — only shown when no repo linked yet */}
                {!hasRepo && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl shadow-sm hidden sm:flex border-dashed"
                    disabled={initRepo.isPending}
                    onClick={handleInitRepo}
                    title="Create a GitHub repo and scaffold the PWA template"
                  >
                    {initRepo.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <GitFork className="h-4 w-4 mr-2" />
                    )}
                    {initRepo.isPending ? "Creating…" : "Create Repo"}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl shadow-sm hidden sm:flex"
                  disabled={backup.isPending}
                  onClick={handleBackup}
                  title="Back up project to GitHub"
                >
                  {backup.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Github className="h-4 w-4 mr-2" />
                  )}
                  Backup
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl shadow-sm hidden sm:flex"
                  disabled={publish.isPending}
                  onClick={handlePublish}
                  title="Publish project page to GitHub Pages"
                >
                  {publish.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4 mr-2 text-primary" />
                  )}
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-muted/50 p-1 rounded-xl max-w-fit overflow-x-auto no-scrollbar glass-panel">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <Link key={tab.id} href={`/projects/${projectId}/${tab.id}`}>
                <button
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative whitespace-nowrap",
                    isActive
                      ? "text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-black/20",
                  )}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-background rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] -z-10" />
                  )}
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative rounded-2xl glass-panel shadow-sm">
        <Switch>
          <Route
            path="/projects/:projectId/canvas"
            component={() => <ForgeCanvas projectId={projectId} />}
          />
          <Route
            path="/projects/:projectId/kanban"
            component={() => <KanbanBoard projectId={projectId} />}
          />
          <Route
            path="/projects/:projectId/agents"
            component={() => <AgentStatusPanel projectId={projectId} />}
          />
          <Route
            path="/projects/:projectId/activity"
            component={() => <ActivityFeed projectId={projectId} />}
          />
          <Route
            path="/projects/:projectId/preview"
            component={() => (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/30 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{project.previewUrl}</span>
                  </div>
                  <a href={project.previewUrl!} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Open
                    </Button>
                  </a>
                </div>
                <iframe
                  src={project.previewUrl!}
                  className="flex-1 w-full border-0"
                  title={`${project.name} — Live Preview`}
                  allow="fullscreen"
                />
              </div>
            )}
          />
          <Route
            path="/projects/:projectId"
            component={() => <ForgeCanvas projectId={projectId} />}
          />
        </Switch>
      </div>
    </div>
  );
}
