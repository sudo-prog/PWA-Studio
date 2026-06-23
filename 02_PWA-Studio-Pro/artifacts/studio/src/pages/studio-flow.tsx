import { useCallback, useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetProject,
  useListLayouts,
  useGetLayout,
  useUpdateLayout,
  getGetLayoutQueryKey,
  getListLayoutsQueryKey,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEditorStore } from "@/lib/store";
import type { CanvasItem, FlowNode, FlowEdge } from "@/lib/widget-types";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function StudioFlow() {
  const [, params] = useRoute("/studio/:projectId/flow");
  const projectId = params?.projectId ?? "";

  const { data: project, isLoading: projectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: layouts } = useListLayouts(projectId, {
    query: { enabled: !!projectId, queryKey: getListLayoutsQueryKey(projectId) },
  });

  const { activeLayoutId, setActiveLayoutId, gridLayout, flowGraph, setFlowGraph, setGridLayout, markSaved } = useEditorStore();

  // Auto-select first layout if none active
  useEffect(() => {
    if (!activeLayoutId && layouts && layouts.length > 0) {
      setActiveLayoutId(layouts[0].id);
    }
  }, [layouts, activeLayoutId, setActiveLayoutId]);

  const { data: activeLayout } = useGetLayout(activeLayoutId ?? "", {
    query: { enabled: !!activeLayoutId, queryKey: getGetLayoutQueryKey(activeLayoutId ?? "") },
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync layout data into React Flow state whenever activeLayout arrives.
  // This handles the direct-load/refresh case where store is empty.
  useEffect(() => {
    if (!activeLayout) return;

    const gl = activeLayout.gridLayout as { items?: CanvasItem[] };
    const fg = activeLayout.flowGraph as { nodes?: FlowNode[]; edges?: FlowEdge[] } | null;

    // Hydrate store with DB data if empty
    const storeState = useEditorStore.getState();
    if (storeState.gridLayout.items.length === 0) {
      setGridLayout({ items: Array.isArray(gl?.items) ? gl.items : [] }, false);
    }

    // Build React Flow nodes: prefer stored flow graph, then build from canvas items
    const canvasItems: CanvasItem[] = storeState.gridLayout.items.length > 0
      ? storeState.gridLayout.items
      : Array.isArray(gl?.items) ? gl.items : [];

    if (fg?.nodes && fg.nodes.length > 0) {
      // Restore persisted flow graph
      setNodes(fg.nodes as Node[]);
      setEdges((fg.edges ?? []) as Edge[]);
      setFlowGraph({ nodes: fg.nodes, edges: fg.edges ?? [] }, false);
    } else if (canvasItems.length > 0) {
      // Derive nodes from canvas widgets
      const derivedNodes: Node[] = canvasItems.map((item, idx) => ({
        id: item.i,
        type: "default",
        position: { x: 100 + (idx % 4) * 220, y: 80 + Math.floor(idx / 4) * 160 },
        data: { label: item.widget?.slug ?? item.i },
      }));
      setNodes(derivedNodes);
      setEdges([]);
    }

    markSaved();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayout?.id]);

  const updateLayout = useUpdateLayout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSave = useCallback(
    (n: Node[], e: Edge[]) => {
      if (!activeLayoutId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const newFlow = { nodes: n, edges: e };
        setFlowGraph(newFlow as { nodes: FlowNode[]; edges: FlowEdge[] }, false);
        updateLayout.mutate(
          {
            id: activeLayoutId,
            data: {
              gridLayout: useEditorStore.getState().gridLayout as unknown as Record<string, unknown>,
              flowGraph: newFlow as unknown as Record<string, unknown>,
            },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetLayoutQueryKey(activeLayoutId) });
              markSaved();
            },
          }
        );
      }, 500);
    },
    [activeLayoutId, setFlowGraph, updateLayout, queryClient, markSaved]
  );

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdges = addEdge(params, edges);
      setEdges(newEdges);
      autoSave(nodes, newEdges);
    },
    [edges, nodes, autoSave, setEdges]
  );

  const onNodesChangeWithSave = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const hasPositionEnd = changes.some((c) => c.type === "position" && c.dragging === false);
      if (hasPositionEnd) {
        autoSave(nodes, edges);
      }
    },
    [onNodesChange, nodes, edges, autoSave]
  );

  // Persist edge deletions and other edge mutations
  const onEdgesChangeWithSave = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      const hasMutation = changes.some((c) => c.type === "remove");
      if (hasMutation) {
        // Short timeout so React state settles before reading edges
        setTimeout(() => autoSave(nodes, edges), 50);
      }
    },
    [onEdgesChange, nodes, edges, autoSave]
  );

  function manualSave() {
    if (!activeLayoutId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const newFlow = { nodes, edges };
    setFlowGraph(newFlow as { nodes: FlowNode[]; edges: FlowEdge[] }, false);
    updateLayout.mutate(
      {
        id: activeLayoutId,
        data: {
          gridLayout: useEditorStore.getState().gridLayout as unknown as Record<string, unknown>,
          flowGraph: newFlow as unknown as Record<string, unknown>,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLayoutQueryKey(activeLayoutId) });
          markSaved();
          toast({ title: "Flow graph saved" });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  }

  if (projectLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-background text-foreground" data-testid="flow-page">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeWithSave}
        onEdgesChange={onEdgesChangeWithSave}
        onConnect={onConnect}
        fitView
        style={{ background: "hsl(var(--background))" }}
        defaultEdgeOptions={{ animated: true }}
      >
        <Background color="hsl(var(--border))" gap={20} />
        <Controls />
        <MiniMap
          nodeColor="hsl(var(--primary))"
          maskColor="hsl(var(--muted) / 0.8)"
          style={{ background: "hsl(var(--card))" }}
        />

        <Panel position="top-left">
          <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-1.5 shadow-sm">
            <Link href={`/studio/${projectId}`} data-testid="button-back-to-canvas">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Back to Canvas
              </Button>
            </Link>
            <span className="text-xs text-muted-foreground border-l border-border pl-2">
              {project?.name ?? "..."} — Flow View
            </span>
          </div>
        </Panel>

        <Panel position="top-right">
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={manualSave}
            disabled={!activeLayoutId || updateLayout.isPending}
            data-testid="button-save-flow"
          >
            {updateLayout.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
