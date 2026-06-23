import { useGetActivityFeed, getGetActivityFeedQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AGENT_ROLE_COLORS } from "@/lib/constants";
import { Info, CheckCircle2, AlertTriangle, XCircle, Loader2, GitCommit } from "lucide-react";

export default function ActivityFeed({ projectId }: { projectId: number }) {
  const { data: activities, isLoading } = useGetActivityFeed(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetActivityFeedQueryKey(projectId),
      refetchInterval: 5000 // Poll
    }
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info className="h-4 w-4" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'progress': return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f8fafc] dark:bg-[#0f111a] p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold mb-6">Activity Timeline</h2>
        
        {(!activities || activities.length === 0) ? (
          <div className="text-center p-12 glass-panel rounded-2xl border-dashed border-2">
            <GitCommit className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium">Quiet on set</h3>
            <p className="text-muted-foreground mt-2">No agent activity logged yet.</p>
          </div>
        ) : (
          <div className="relative space-y-0 pl-6 border-l border-border/60 ml-4">
            {activities.map((activity, index) => (
              <div key={activity.id} className="relative pb-8 last:pb-0">
                {/* Timeline dot */}
                <div className={`absolute -left-[35px] top-1 h-8 w-8 rounded-full flex items-center justify-center border-2 border-background shadow-sm ${AGENT_ROLE_COLORS[activity.agentRole] || AGENT_ROLE_COLORS.system}`}>
                  {getEventIcon(activity.type)}
                </div>
                
                <div className="glass-panel p-4 rounded-xl shadow-sm border-0 ml-2 hover-elevate transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm capitalize">{activity.agentRole}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-sm font-medium text-foreground/90">{activity.message}</p>
                  
                  {activity.detail && (
                    <div className="mt-3 p-3 bg-black/5 dark:bg-white/5 rounded-lg text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words border border-border/30">
                      {activity.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}