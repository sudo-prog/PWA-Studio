import { useListTasks, useListColumns, useUpdateTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AGENT_ROLE_COLORS } from "@/lib/constants";
import { AlertCircle, Clock, GitBranch, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { KanbanTask } from "@workspace/api-client-react";
import { useOfflineMutate } from "@/hooks/use-offline-mutate";
import { useOffline } from "@/hooks/use-offline";
import { useToast } from "@/hooks/use-toast";

export default function KanbanBoard({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const isOffline = useOffline();
  const { toast } = useToast();

  const { data: columns, isLoading: colsLoading } = useListColumns(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: ["listColumns", projectId] as const,
    }
  });

  const { data: tasks, isLoading: tasksLoading } = useListTasks(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListTasksQueryKey(projectId)
    }
  });

  const updateTask = useUpdateTask({
    mutation: {
      onMutate: async ({ taskId, data }) => {
        await queryClient.cancelQueries({ queryKey: getListTasksQueryKey(projectId) });
        const previousTasks = queryClient.getQueryData<KanbanTask[]>(getListTasksQueryKey(projectId));
        if (previousTasks && data.columnId) {
          queryClient.setQueryData<KanbanTask[]>(
            getListTasksQueryKey(projectId),
            previousTasks.map(t => t.id === taskId ? { ...t, columnId: data.columnId! } : t)
          );
        }
        return { previousTasks };
      },
      onError: (_err, _vars, context) => {
        if (context?.previousTasks) {
          queryClient.setQueryData(getListTasksQueryKey(projectId), context.previousTasks);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) });
      }
    }
  });

  // Offline-aware wrapper: optimistic update + IndexedDB queue when offline
  const offlineUpdateTask = useOfflineMutate({
    mutate: (vars: Parameters<typeof updateTask.mutate>[0]) => updateTask.mutate(vars),
    toQueueEntry: ({ projectId: pid, taskId, data }) => ({
      method: "PATCH",
      url: `/api/projects/${pid}/tasks/${taskId}`,
      body: data,
    }),
    onOffline: ({ taskId, data }) => {
      // Apply optimistic update even offline
      const prev = queryClient.getQueryData<KanbanTask[]>(getListTasksQueryKey(projectId));
      if (prev && data.columnId) {
        queryClient.setQueryData<KanbanTask[]>(
          getListTasksQueryKey(projectId),
          prev.map(t => t.id === taskId ? { ...t, columnId: data.columnId! } : t)
        );
      }
      toast({ title: "Queued Offline", description: "Task move will sync when you reconnect." });
    }
  });

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: number) => {
    e.dataTransfer.setData("taskId", taskId.toString());
    (e.currentTarget as HTMLElement).style.opacity = "0.5";
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-1", "ring-primary/30");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-1", "ring-primary/30");
  };

  const handleDrop = (e: React.DragEvent, columnId: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-1", "ring-primary/30");
    const taskId = parseInt(e.dataTransfer.getData("taskId"), 10);
    if (!isNaN(taskId)) {
      const task = tasks?.find(t => t.id === taskId);
      if (task && task.columnId !== columnId) {
        offlineUpdateTask({ projectId, taskId, data: { columnId } });
      }
    }
  };

  if (colsLoading || tasksLoading) {
    return (
      <div className="flex gap-4 h-full p-4 overflow-x-auto">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="min-w-[300px] w-[300px] flex-shrink-0 flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const sortedCols = [...(columns || [])].sort((a, b) => a.order - b.order);

  return (
    <div className="flex gap-6 h-full p-6 overflow-x-auto bg-[#f8fafc] dark:bg-[#0f111a]">
      {isOffline && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-amber-500/90 text-white text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur">
          <WifiOff className="h-3 w-3" />
          Offline — moves will sync on reconnect
        </div>
      )}

      {sortedCols.map(col => {
        const colTasks = tasks?.filter(t => t.columnId === col.id).sort((a, b) => a.order - b.order) || [];
        return (
          <div
            key={col.id}
            className="flex flex-col min-w-[320px] w-[320px] max-w-[320px] rounded-2xl glass-panel bg-white/40 dark:bg-black/20 transition-all duration-150"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="p-4 flex items-center justify-between border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="font-semibold">{col.name}</h3>
              </div>
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                {colTasks.length}
              </span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
              <AnimatePresence>
                {colTasks.length === 0 ? (
                  <div className="h-24 flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl m-1">
                    <p className="text-sm text-muted-foreground">Drop tasks here</p>
                  </div>
                ) : (
                  colTasks.map(task => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      key={task.id}
                    >
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        className="bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-xl p-4 cursor-grab active:cursor-grabbing group relative overflow-hidden"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: col.color }} />

                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${AGENT_ROLE_COLORS[task.agentRole]} border-0`}>
                            {task.agentRole}
                          </Badge>
                          {task.priority === 'critical' && <AlertCircle className="h-4 w-4 text-destructive" />}
                          {task.priority === 'high' && <AlertCircle className="h-4 w-4 text-amber-500" />}
                        </div>

                        <h4 className="font-medium text-sm mb-1 leading-snug">{task.title}</h4>

                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-3 mt-1">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                          {task.branch ? (
                            <div className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                              <GitBranch className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">{task.branch}</span>
                            </div>
                          ) : <div />}
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(task.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}
