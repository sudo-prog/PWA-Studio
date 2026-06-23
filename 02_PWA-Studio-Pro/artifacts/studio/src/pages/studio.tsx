import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetProject,
  useGetLayout,
  useListLayouts,
  useCreateLayout,
  useUpdateLayout,
  useListConversations,
  useClearConversations,
  useListWidgetRegistry,
  useGetSettings,
  useUpdateSettings,
  getListLayoutsQueryKey,
  getGetLayoutQueryKey,
  getListConversationsQueryKey,
  getGetProjectQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEditorStore } from "@/lib/store";
import { useTheme } from "@/components/layout/theme-provider";
import type { CanvasItem } from "@/lib/widget-types";
import ReactGridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Plus,
  Trash2,
  GitGraph,
  MessageSquare,
  Send,
  ChevronLeft,
  ChevronRight,
  Save,
  RefreshCw,
  Undo2,
  Redo2,
  Puzzle,
  X,
  Search,
  Code2,
  Clock,
  LayoutGrid,
  Settings,
  PanelLeftClose,
  PanelRightClose,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   New-layout dialog helper
   ────────────────────────────────────────────────────────────────────────── */
const newLayoutSchema = z.object({ name: z.string().min(1, "Name is required") });
type NewLayoutForm = z.infer<typeof newLayoutSchema>;

const messageSchema = z.object({ content: z.string().min(1) });
type MessageForm = z.infer<typeof messageSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   LEFT PANEL — AI Chat Sidebar
   ────────────────────────────────────────────────────────────────────────── */
function AIChatPanel({ projectId }: { projectId: string }) {
  const { data: messages, isLoading } = useListConversations(projectId);
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const clearMsgs = useClearConversations();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const form = useForm<MessageForm>({
    resolver: zodResolver(messageSchema),
    defaultValues: { content: "" },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  async function sendMessage(values: MessageForm) {
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamingContent("");
    setStreamError(null);
    form.reset();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`/api/projects/${projectId}/conversations/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: values.content }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errData.error ?? `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json) as { content?: string; done?: boolean; error?: string };
            if (event.error) {
              setStreamError(event.error);
            } else if (event.content) {
              setStreamingContent((prev) => prev + event.content);
            } else if (event.done) {
              // Refresh full conversation (user + assistant both saved by server)
              await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey(projectId) });
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Failed to connect to LLM";
        setStreamError(msg);
        toast({ title: "AI error", description: msg, variant: "destructive" });
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  }

  function clearAll() {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    clearMsgs.mutate(
      { projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey(projectId) });
          setStreamingContent("");
          setStreamError(null);
          toast({ title: "Conversation cleared" });
        },
      }
    );
  }

  function onModelChange(model: string) {
    updateSettings.mutate(
      { data: { activeModel: model } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }),
      }
    );
  }

  const isEmpty = !isLoading && (messages?.length ?? 0) === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full" data-testid="ai-chat-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">AI Chat</span>
          {isStreaming && (
            <span className="text-[10px] text-muted-foreground animate-pulse">generating...</span>
          )}
        </div>
        {((messages?.length ?? 0) > 0 || isStreaming) && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearAll} disabled={clearMsgs.isPending} data-testid="button-clear-conversation">
            <Trash2 className="w-3 h-3 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Model selector — editable text for local LLM model names */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <Input
          value={settings?.activeModel ?? ""}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="Model (e.g. llama3, gpt-4o, mistral)"
          className="h-7 text-xs font-mono"
          data-testid="input-ai-model"
        />
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-7 w-3/4" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-24 text-center gap-1">
            <MessageSquare className="w-5 h-5 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Ask anything about your PWA.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages?.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
                data-testid={`message-${msg.id}`}
              >
                <div
                  className={cn(
                    "rounded-md px-3 py-2 max-w-[90%] text-xs leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : msg.role === "system"
                      ? "bg-muted text-muted-foreground italic"
                      : "bg-card border border-border text-foreground"
                  )}
                >
                  {msg.content}
                </div>
                <div className="flex items-center gap-1 px-1">
                  <span className="text-[10px] text-muted-foreground">{msg.role}</span>
                  {msg.model && (
                    <span className="text-[10px] text-muted-foreground/50">· {msg.model}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/40">
                    · {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}

            {/* Streaming assistant bubble */}
            {isStreaming && (
              <div className="flex flex-col gap-0.5 items-start" data-testid="message-streaming">
                <div className="rounded-md px-3 py-2 max-w-[90%] text-xs leading-relaxed bg-card border border-border text-foreground whitespace-pre-wrap">
                  {streamingContent || (
                    <span className="flex gap-1 items-center text-muted-foreground">
                      <span className="animate-bounce [animation-delay:0ms]">·</span>
                      <span className="animate-bounce [animation-delay:150ms]">·</span>
                      <span className="animate-bounce [animation-delay:300ms]">·</span>
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">assistant</span>
              </div>
            )}

            {/* Error display */}
            {streamError && !isStreaming && (
              <div className="rounded-md px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/20" data-testid="message-error">
                {streamError}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-2 shrink-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(sendMessage)} className="flex gap-1.5">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem className="flex-1 space-y-0">
                  <FormControl>
                    <Input
                      placeholder="Ask something..."
                      className="h-8 text-xs"
                      disabled={isStreaming}
                      {...field}
                      data-testid="input-message"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={isStreaming}
              data-testid="button-send-message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   CENTER PANEL — Canvas
   ────────────────────────────────────────────────────────────────────────── */
function CanvasPanel({
  projectId,
  activeLayoutId,
}: {
  projectId: string;
  activeLayoutId: string | null;
}) {
  const {
    gridLayout,
    setGridLayout,
    selectedItemId,
    setSelectedItemId,
    unsavedChanges,
    undoStack,
    redoStack,
    undo,
    redo,
    markSaved,
    codePanelOpen,
    setCodePanelOpen,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
  } = useEditorStore();

  const updateLayout = useUpdateLayout();
  const { data: layouts } = useListLayouts(projectId, { query: { enabled: !!projectId, queryKey: getListLayoutsQueryKey(projectId) } });
  const { data: registryWidgets } = useListWidgetRegistry();
  const registryBySlug = useMemo(
    () => Object.fromEntries((registryWidgets ?? []).map((w) => [w.slug, w])),
    [registryWidgets]
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [registryOpen, setRegistryOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save debounced 500ms
  const autoSave = useCallback(
    (layout: typeof gridLayout, fg: import("@/lib/widget-types").FlowGraphState) => {
      if (!activeLayoutId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateLayout.mutate(
          {
            id: activeLayoutId,
            data: {
              gridLayout: layout as unknown as Record<string, unknown>,
              flowGraph: fg as unknown as Record<string, unknown>,
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
    [activeLayoutId, updateLayout, queryClient, markSaved]
  );

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  function addWidget(slug: string, name: string) {
    const newItem: CanvasItem = {
      i: `${slug}-${Date.now()}`,
      x: 0,
      y: Infinity,
      w: 4,
      h: 3,
      widget: { id: `${slug}-${Date.now()}`, slug, mode: "compact", config: {} },
    };
    const updated = { ...gridLayout, items: [...gridLayout.items, newItem] };
    setGridLayout(updated);
    autoSave(updated, useEditorStore.getState().flowGraph);
    setRegistryOpen(false);
  }

  function removeItem(i: string) {
    const updated = { ...gridLayout, items: gridLayout.items.filter((item) => item.i !== i) };
    setGridLayout(updated);
    if (selectedItemId === i) setSelectedItemId(null);
    autoSave(updated, useEditorStore.getState().flowGraph);
  }

  function onLayoutChange(newLayout: readonly { i: string; x: number; y: number; w: number; h: number }[]) {
    const updated = {
      items: gridLayout.items.map((item) => {
        const found = newLayout.find((l) => l.i === item.i);
        return found ? { ...item, ...found } : item;
      }),
    };
    setGridLayout(updated);
    autoSave(updated, useEditorStore.getState().flowGraph);
  }

  function manualSave() {
    if (!activeLayoutId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    updateLayout.mutate(
      {
        id: activeLayoutId,
        data: {
          gridLayout: gridLayout as unknown as Record<string, unknown>,
          flowGraph: useEditorStore.getState().flowGraph as unknown as Record<string, unknown>,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLayoutQueryKey(activeLayoutId) });
          markSaved();
          toast({ title: "Layout saved" });
        },
        onError: () => toast({ title: "Failed to save layout", variant: "destructive" }),
      }
    );
  }

  const layoutName = layouts?.find((l) => l.id === activeLayoutId)?.name;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Canvas toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            title={leftPanelOpen ? "Collapse AI panel" : "Expand AI panel"}
            data-testid="button-toggle-left-panel"
          >
            {leftPanelOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo"
            data-testid="button-undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo"
            data-testid="button-redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setRegistryOpen(true)}
            data-testid="button-add-widget"
          >
            <Plus className="w-3 h-3" /> Add Widget
          </Button>

          {layoutName && (
            <span className="text-xs text-muted-foreground ml-1">— {layoutName}</span>
          )}
          {unsavedChanges && (
            <Badge variant="outline" className="text-xs ml-1">unsaved</Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Flow view button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setLocation(`/studio/${projectId}/flow`)}
            data-testid="button-flow-view"
          >
            <GitGraph className="w-3 h-3" /> Flow View
          </Button>

          {/* Code drawer */}
          <Button
            variant={codePanelOpen ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setCodePanelOpen(!codePanelOpen)}
            title="Code editor"
            data-testid="button-toggle-code-panel"
          >
            <Code2 className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant={unsavedChanges ? "default" : "outline"}
            className="h-7 text-xs gap-1.5"
            onClick={manualSave}
            disabled={!activeLayoutId || updateLayout.isPending}
            data-testid="button-save-layout"
          >
            {updateLayout.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title={rightPanelOpen ? "Collapse inspector" : "Expand inspector"}
            data-testid="button-toggle-right-panel"
          >
            {rightPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto bg-muted/10 relative" data-testid="canvas-area">
        {!activeLayoutId ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <LayoutGrid className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">No layout selected</p>
            <p className="text-xs text-muted-foreground">Select or create a layout from the sidebar.</p>
          </div>
        ) : gridLayout.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <LayoutGrid className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">Canvas is empty</p>
            <p className="text-xs text-muted-foreground">Add widgets to get started.</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 mt-1"
              onClick={() => setRegistryOpen(true)}
              data-testid="button-add-first-widget"
            >
              <Plus className="w-3 h-3" /> Add widget
            </Button>
          </div>
        ) : (
          <div className="p-4">
            <ReactGridLayout
              className="layout"
              width={800}
              gridConfig={{ cols: 12, rowHeight: 60, margin: [8, 8] as [number, number], containerPadding: null, maxRows: Infinity }}
              dragConfig={{ enabled: true, handle: ".drag-handle", bounded: false, threshold: 3 }}
              resizeConfig={{ enabled: true }}
              layout={gridLayout.items}
              onLayoutChange={onLayoutChange}
            >
              {gridLayout.items.map((item) => (
                <div
                  key={item.i}
                  className={cn(
                    "rounded-md border flex flex-col overflow-hidden cursor-pointer transition-colors",
                    selectedItemId === item.i
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/50"
                  )}
                  onClick={() => setSelectedItemId(item.i)}
                  data-testid={`canvas-item-${item.i}`}
                >
                  <div className="drag-handle flex items-center justify-between px-2 py-1 bg-muted/40 cursor-move border-b border-border shrink-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <Puzzle className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono text-muted-foreground truncate">
                        {item.widget?.slug ?? item.i}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.widget?.config && Object.values(item.widget.config).some((v) => v !== "" && v !== undefined && v !== false) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Configured" />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item.i); }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        data-testid={`button-remove-widget-${item.i}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-h-0">
                    <span className="text-xs font-medium text-foreground/70 truncate max-w-full text-center">
                      {String(item.widget?.config?.title ?? item.widget?.config?.label ?? registryBySlug[item.widget?.slug ?? ""]?.name ?? item.widget?.slug ?? "widget")}
                    </span>
                    {!!item.widget?.config?.location && (
                      <span className="text-[10px] text-muted-foreground/50 truncate max-w-full">{String(item.widget.config.location)}</span>
                    )}
                  </div>
                </div>
              ))}
            </ReactGridLayout>
          </div>
        )}
      </div>

      {/* code-server drawer */}
      {codePanelOpen && <CodeServerDrawer onClose={() => setCodePanelOpen(false)} />}

      {/* Widget registry drawer */}
      <WidgetRegistryDrawer open={registryOpen} onClose={() => setRegistryOpen(false)} onSelect={addWidget} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Code Server Drawer (conditional overlay based on iframe load state)
   ────────────────────────────────────────────────────────────────────────── */
function CodeServerDrawer({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  return (
    <div className="h-64 border-t border-border bg-card flex flex-col shrink-0" data-testid="code-server-drawer">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Code Editor</span>
          {status === "ready" && <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">connected</Badge>}
          {status === "unavailable" && <Badge variant="outline" className="text-xs text-muted-foreground">unavailable</Badge>}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex-1 relative bg-muted/20 overflow-hidden">
        <iframe
          src="/code-server"
          className="absolute inset-0 w-full h-full border-0"
          title="Code Server"
          data-testid="iframe-code-server"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("unavailable")}
        />
        {/* Overlay only when loading or unavailable */}
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 gap-2" data-testid="code-server-placeholder">
            {status === "loading" ? (
              <>
                <RefreshCw className="w-6 h-6 text-muted-foreground/40 animate-spin" />
                <p className="text-xs text-muted-foreground">Connecting to code server...</p>
              </>
            ) : (
              <>
                <Code2 className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs font-medium">Code server not running</p>
                <p className="text-xs text-muted-foreground">Start code-server to enable the embedded editor.</p>
                <Button variant="outline" size="sm" className="gap-1.5 mt-1" asChild>
                  <a href="/code-server" target="_blank" rel="noopener noreferrer" data-testid="link-launch-editor">
                    <ExternalLink className="w-3 h-3" /> Open in new tab
                  </a>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Widget Registry Drawer
   ────────────────────────────────────────────────────────────────────────── */
function WidgetRegistryDrawer({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (slug: string, name: string) => void;
}) {
  const { data: widgets } = useListWidgetRegistry();
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      widgets?.filter(
        (w) =>
          !search ||
          w.name.toLowerCase().includes(search.toLowerCase()) ||
          w.slug.includes(search.toLowerCase())
      ),
    [widgets, search]
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-sm">Widget Registry</SheetTitle>
        </SheetHeader>
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search widgets..."
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-registry"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filtered?.map((w) => (
              <button
                key={w.id}
                className="w-full text-left rounded-md border border-border bg-card p-3 hover:bg-accent transition-colors"
                onClick={() => onSelect(w.slug, w.name)}
                data-testid={`button-add-registry-widget-${w.slug}`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-semibold truncate">{w.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">v{w.version}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{w.slug}</p>
                {w.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{w.description}</p>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Dynamic widget config form (react-hook-form + zod, schema-driven)
   ────────────────────────────────────────────────────────────────────────── */
interface FieldDef {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

type ConfigRecord = Record<string, string | number | boolean>;

function WidgetConfigForm({
  itemId,
  initialConfig,
  schemaProps,
  onUpdate,
}: {
  itemId: string;
  initialConfig: Record<string, unknown>;
  schemaProps: Record<string, FieldDef>;
  onUpdate: (config: Record<string, unknown>) => void;
}) {
  // Always call latest onUpdate without recreating subscription
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, def] of Object.entries(schemaProps)) {
      if (def.enum && def.enum.length > 0) {
        shape[key] = z.string().optional();
      } else if (def.type === "number" || def.type === "integer") {
        shape[key] = z.coerce.number().optional();
      } else if (def.type === "boolean") {
        shape[key] = z.boolean().optional();
      } else {
        shape[key] = z.string().optional();
      }
    }
    return z.object(shape);
  }, [schemaProps]);

  const buildDefaults = useCallback((): ConfigRecord => {
    const vals: ConfigRecord = {};
    for (const [key, def] of Object.entries(schemaProps)) {
      const v = initialConfig[key] ?? def.default;
      if (def.type === "boolean") vals[key] = Boolean(v ?? false);
      else if (def.type === "number" || def.type === "integer") vals[key] = Number(v ?? 0);
      else vals[key] = String(v ?? "");
    }
    return vals;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, schemaProps]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<ConfigRecord>({ resolver: zodResolver(formSchema) as any, defaultValues: buildDefaults() });

  // Reset when selected widget changes
  useEffect(() => { form.reset(buildDefaults()); }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to changes → debounce → persist to store
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sub = form.watch((values) => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(() => {
        onUpdateRef.current(values as Record<string, unknown>);
      }, 250);
    });
    return () => {
      sub.unsubscribe();
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Form {...form}>
      <form className="space-y-2.5">
        {Object.entries(schemaProps).map(([key, def]) => {
          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
          return (
            <FormField
              key={key}
              control={form.control}
              name={key}
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
                  <FormControl>
                    {def.enum && def.enum.length > 0 ? (
                      <Select
                        value={String(field.value ?? "")}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-config-${key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {def.enum.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : def.type === "boolean" ? (
                      <div className="flex items-center h-7">
                        <Switch
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                          data-testid={`switch-config-${key}`}
                        />
                      </div>
                    ) : (
                      <Input
                        type={def.type === "number" || def.type === "integer" ? "number" : "text"}
                        className="h-7 text-xs"
                        placeholder={def.description ?? String(def.default ?? "")}
                        value={String(field.value ?? "")}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        data-testid={`input-config-${key}`}
                      />
                    )}
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          );
        })}
      </form>
    </Form>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   RIGHT PANEL — Inspector
   ────────────────────────────────────────────────────────────────────────── */
function InspectorPanel({ projectId }: { projectId: string }) {
  const { selectedItemId, gridLayout, updateWidgetConfig, setGridLayout } = useEditorStore();
  const selectedItem = gridLayout.items.find((item) => item.i === selectedItemId);
  const { data: widgets } = useListWidgetRegistry();
  const [showRaw, setShowRaw] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);

  function updateStyle(key: "background" | "borderRadius", value: string) {
    if (!selectedItemId) return;
    const items = gridLayout.items.map((item) =>
      item.i === selectedItemId
        ? { ...item, style: { ...item.style, [key]: value } }
        : item
    );
    setGridLayout({ ...gridLayout, items });
  }
  const { toast } = useToast();

  const widgetMeta = useMemo(
    () => widgets?.find((w) => w.slug === selectedItem?.widget?.slug),
    [widgets, selectedItem]
  );

  function onReplaceWidget(slug: string, name: string) {
    if (!selectedItemId || !selectedItem?.widget) return;
    const items = gridLayout.items.map((item) =>
      item.i === selectedItemId
        ? { ...item, widget: { ...item.widget!, slug, id: `${slug}-${Date.now()}`, config: {} } }
        : item
    );
    useEditorStore.getState().setGridLayout({ ...gridLayout, items });
    setRegistryOpen(false);
    toast({ title: `Widget replaced with ${name}` });
  }

  if (!selectedItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 p-4" data-testid="inspector-empty">
        <Puzzle className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">Select a widget on the canvas to inspect it.</p>
      </div>
    );
  }

  const schema = widgetMeta?.schema as Record<string, unknown> | undefined;
  const schemaProps = schema?.properties as Record<string, { type?: string; description?: string }> | undefined;
  const config = selectedItem.widget?.config ?? {};

  return (
    <div className="flex flex-col h-full" data-testid="inspector-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold">Inspector</span>
        {selectedItem.widget && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setRegistryOpen(true)}
            data-testid="button-replace-widget"
          >
            <RefreshCw className="w-3 h-3" /> Replace
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Metadata */}
          {widgetMeta && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metadata</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-mono">{widgetMeta.slug}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono">{widgetMeta.version}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Built-in</span>
                  <span>{widgetMeta.isBuiltin === "true" ? "Yes" : "No"}</span>
                </div>
                {widgetMeta.description && (
                  <p className="text-xs text-muted-foreground">{widgetMeta.description}</p>
                )}
                {widgetMeta.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {widgetMeta.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Config */}
          {schemaProps && Object.keys(schemaProps).length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuration</p>
              <WidgetConfigForm
                itemId={selectedItemId!}
                initialConfig={config}
                schemaProps={schemaProps as Record<string, FieldDef>}
                onUpdate={(newConfig) => updateWidgetConfig(selectedItemId!, newConfig)}
              />
            </section>
          )}

          {/* Layout dimensions */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layout</p>
            <div className="grid grid-cols-2 gap-2">
              {(["w", "h"] as const).map((prop) => (
                <div key={prop} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{prop === "w" ? "Width (cols)" : "Height (rows)"}</label>
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    value={selectedItem[prop]}
                    readOnly
                    data-testid={`input-layout-${prop}`}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Style overrides */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Style overrides</p>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Background</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="color"
                    className="h-7 w-7 rounded border border-border cursor-pointer bg-transparent"
                    value={selectedItem.style?.background ?? "#1e293b"}
                    onChange={(e) => updateStyle("background", e.target.value)}
                    data-testid="input-style-background-picker"
                    title="Background color"
                  />
                  <Input
                    className="h-7 text-xs font-mono flex-1"
                    placeholder="#1e293b or transparent"
                    value={selectedItem.style?.background ?? ""}
                    onChange={(e) => updateStyle("background", e.target.value)}
                    data-testid="input-style-background"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Border radius</label>
                <div className="flex gap-1.5 items-center">
                  <Input
                    className="h-7 text-xs font-mono flex-1"
                    placeholder="6px or 0.5rem"
                    value={selectedItem.style?.borderRadius ?? ""}
                    onChange={(e) => updateStyle("borderRadius", e.target.value)}
                    data-testid="input-style-border-radius"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Raw JSON toggle */}
          <section>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs gap-1"
              onClick={() => setShowRaw(!showRaw)}
              data-testid="button-toggle-raw-json"
            >
              {showRaw ? <ChevronLeft className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
              {showRaw ? "Hide" : "Raw JSON"}
            </Button>
            {showRaw && (
              <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all" data-testid="text-raw-json">
                  {JSON.stringify(selectedItem, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>

      <WidgetRegistryDrawer open={registryOpen} onClose={() => setRegistryOpen(false)} onSelect={onReplaceWidget} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Layouts sidebar (left-side, inside the editor shell)
   ────────────────────────────────────────────────────────────────────────── */
function LayoutsSidebar({ projectId }: { projectId: string }) {
  const { activeLayoutId, setActiveLayoutId, reset } = useEditorStore();
  const { data: layouts, isLoading } = useListLayouts(projectId, {
    query: { enabled: !!projectId, queryKey: getListLayoutsQueryKey(projectId) },
  });
  const createLayout = useCreateLayout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm<NewLayoutForm>({
    resolver: zodResolver(newLayoutSchema),
    defaultValues: { name: "" },
  });

  function onCreate(values: NewLayoutForm) {
    createLayout.mutate(
      { projectId, data: { name: values.name } },
      {
        onSuccess: (layout) => {
          queryClient.invalidateQueries({ queryKey: getListLayoutsQueryKey(projectId) });
          setCreateOpen(false);
          form.reset();
          setActiveLayoutId(layout.id);
          toast({ title: "Layout created" });
        },
        onError: () => toast({ title: "Failed to create layout", variant: "destructive" }),
      }
    );
  }

  // Auto-select first layout
  useEffect(() => {
    if (!activeLayoutId && layouts && layouts.length > 0) {
      setActiveLayoutId(layouts[0].id);
    }
  }, [layouts, activeLayoutId, setActiveLayoutId]);

  useEffect(() => () => reset(), [reset]);

  return (
    <>
      <div className="w-48 border-r border-border flex flex-col shrink-0 bg-sidebar" data-testid="layouts-sidebar">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layouts</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCreateOpen(true)} data-testid="button-new-layout">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-2 space-y-1">
              {[0, 1].map((i) => <Skeleton key={i} className="h-7 w-full rounded" />)}
            </div>
          ) : layouts?.length === 0 ? (
            <div className="p-3 text-center">
              <p className="text-xs text-muted-foreground">No layouts</p>
              <Button variant="ghost" size="sm" className="mt-1 text-xs h-6" onClick={() => setCreateOpen(true)}>Create one</Button>
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {layouts?.map((layout) => (
                <button
                  key={layout.id}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5",
                    activeLayoutId === layout.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-accent"
                  )}
                  onClick={() => setActiveLayoutId(layout.id)}
                  data-testid={`button-select-layout-${layout.id}`}
                >
                  <LayoutGrid className="w-3 h-3 shrink-0" />
                  <span className="truncate">{layout.name}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="dialog-create-layout">
          <DialogHeader><DialogTitle>New Layout</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Main layout" {...field} data-testid="input-layout-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createLayout.isPending} data-testid="button-submit-create-layout">
                  {createLayout.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Main Studio page
   ────────────────────────────────────────────────────────────────────────── */
export default function Studio() {
  const [, params] = useRoute("/studio/:projectId");
  const projectId = params?.projectId ?? "";

  const { data: project, isLoading: projectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });

  const { activeLayoutId, setActiveLayoutId, setGridLayout, setFlowGraph, markSaved, leftPanelOpen, rightPanelOpen } = useEditorStore();

  const { data: activeLayout } = useGetLayout(activeLayoutId ?? "", {
    query: { enabled: !!activeLayoutId, queryKey: getGetLayoutQueryKey(activeLayoutId ?? "") },
  });

  // Load layout data into store when layout changes
  useEffect(() => {
    if (activeLayout) {
      const gl = (activeLayout.gridLayout as { items?: CanvasItem[] });
      setGridLayout({ items: Array.isArray(gl?.items) ? gl.items : [] }, false);
      const fg = activeLayout.flowGraph as { nodes?: unknown[]; edges?: unknown[] };
      setFlowGraph({ nodes: (fg?.nodes as Parameters<typeof setFlowGraph>[0]["nodes"]) ?? [], edges: (fg?.edges as Parameters<typeof setFlowGraph>[0]["edges"]) ?? [] }, false);
      markSaved();
    }
  }, [activeLayout?.id]);

  if (projectLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Project not found.</p>
          <Link href="/projects">
            <Button variant="outline" size="sm">Back to projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" data-testid="studio-layout">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-3 border-b border-border bg-card z-10">
        <div className="flex items-center gap-2">
          <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-projects">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-semibold text-foreground">{project.name}</span>
          <span className="text-xs text-muted-foreground hidden sm:block">· {project.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            <Clock className="w-3 h-3 inline mr-1" />
            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
          </span>
          <Link href="/settings" data-testid="link-settings">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Main content below top bar */}
      <div className="flex w-full h-full pt-10 overflow-hidden">
        {/* Layouts sidebar (always shown, collapsible behind AI panel) */}
        <LayoutsSidebar projectId={projectId} />

        {/* Left panel — AI chat */}
        {leftPanelOpen && (
          <div className="w-72 border-r border-border flex flex-col shrink-0" data-testid="left-panel">
            <AIChatPanel projectId={projectId} />
          </div>
        )}

        {/* Center panel — Canvas */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <CanvasPanel projectId={projectId} activeLayoutId={activeLayoutId} />
        </div>

        {/* Right panel — Inspector */}
        {rightPanelOpen && (
          <div className="w-64 border-l border-border flex flex-col shrink-0" data-testid="right-panel">
            <InspectorPanel projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  );
}
