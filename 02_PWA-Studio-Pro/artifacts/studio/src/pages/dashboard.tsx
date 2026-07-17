import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetDashboardSummary,
  useListProjects,
} from "@workspace/api-client-react";
import { FolderOpen, Puzzle, LayoutGrid, MessageSquare, ArrowRight, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value?: number;
  icon: React.ElementType;
  loading: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <span className="text-3xl font-bold tabular-nums text-foreground">{value ?? 0}</span>
      )}
    </div>
  );
}

export default function Dashboard() {
  // On a Vercel-only frontend deploy there is no backend API server, so skip
  // backend queries to avoid 404 console errors. Local dev (DEV) or an explicit
  // VITE_API_ENABLED opt-in keeps them active.
  const apiEnabled = import.meta.env.DEV || import.meta.env.VITE_API_ENABLED === "true";
  const { data: summary, isLoading } = useGetDashboardSummary({ query: { enabled: apiEnabled } });
  const { data: projects } = useListProjects({ query: { enabled: apiEnabled } });

  return (
    <AppLayout title="Dashboard">
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        {/* Stats */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Projects"
              value={summary?.projectCount}
              icon={FolderOpen}
              loading={isLoading}
            />
            <StatCard
              label="Widgets"
              value={summary?.widgetCount}
              icon={Puzzle}
              loading={isLoading}
            />
            <StatCard
              label="Layouts"
              value={summary?.layoutCount}
              icon={LayoutGrid}
              loading={isLoading}
            />
            <StatCard
              label="Messages"
              value={summary?.conversationCount}
              icon={MessageSquare}
              loading={isLoading}
            />
          </div>
        </section>

        {/* Recent projects */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Recent Projects
            </h2>
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="text-xs gap-1" data-testid="button-view-all-projects">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : (summary?.recentProjects?.length ?? 0) === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No projects yet.</p>
              <Link href="/projects">
                <Button variant="outline" size="sm" className="mt-3 gap-1" data-testid="button-create-first-project">
                  <Plus className="w-3 h-3" /> Create project
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {summary?.recentProjects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} data-testid={`card-project-${p.id}`}>
                  <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {p.layoutCount} layout{p.layoutCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Top widget types */}
        {(summary?.topWidgetTypes?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Top Widget Types
            </h2>
            <div className="flex flex-wrap gap-2">
              {summary?.topWidgetTypes.map((w) => (
                <div
                  key={w.widgetType}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
                  data-testid={`widget-type-stat-${w.widgetType}`}
                >
                  <Puzzle className="w-3 h-3 text-primary" />
                  <span className="text-xs font-medium">{w.widgetType}</span>
                  <span className="text-xs text-muted-foreground">×{w.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All projects quick list */}
        {Array.isArray(projects) && projects.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              All Projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(projects || []).map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} data-testid={`card-all-project-${p.id}`}>
                  <div className="rounded-md border border-border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer h-full">
                    <p className="text-sm font-semibold text-foreground mb-1">{p.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{p.layoutCount} layouts</Badge>
                      <Badge variant="outline" className="text-xs">{p.widgetCount} widgets</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
