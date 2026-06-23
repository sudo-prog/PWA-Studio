import { useGetCanvas, useSaveCanvas, getGetCanvasQueryKey, CanvasElement } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MousePointer2, ZoomIn, ZoomOut, Pencil, Type, Square, AppWindow, Navigation, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { useOffline } from "@/hooks/use-offline";
import { cn } from "@/lib/utils";

type ActiveTool = "select" | "freehand" | "annotation";

// Shape library items (drag-from-sidebar)
const SHAPES = [
  { type: "rectangle", icon: Square, label: "Rectangle", w: 200, h: 120 },
  { type: "card", icon: AppWindow, label: "Card", w: 240, h: 140 },
  { type: "button", icon: MousePointer2, label: "Button", w: 120, h: 40 },
  { type: "input", icon: Type, label: "Input", w: 200, h: 44 },
  { type: "navbar", icon: Navigation, label: "Navbar", w: 320, h: 56 },
  { type: "text", icon: Type, label: "Text", w: 160, h: 32 },
];

// Decode freehand points from annotation JSON
function getFreehandPoints(el: CanvasElement): number[][] {
  if (!el.annotation) return [];
  try { return JSON.parse(el.annotation); } catch { return []; }
}

export default function ForgeCanvas({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOffline = useOffline();
  const { enqueue, drainQueue } = useOfflineQueue();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingEl, setIsDraggingEl] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [pointerStart, setPointerStart] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [freehandPoints, setFreehandPoints] = useState<number[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Annotation editing state
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const annotationInputRef = useRef<HTMLInputElement>(null);

  const { data: canvasData, isLoading } = useGetCanvas(projectId, {
    query: { enabled: !!projectId, queryKey: getGetCanvasQueryKey(projectId), retry: false }
  });

  const saveCanvas = useSaveCanvas({
    mutation: {
      onSuccess: () => {
        toast({ title: "Canvas Saved", description: "Design sent to agents." });
        queryClient.invalidateQueries({ queryKey: getGetCanvasQueryKey(projectId) });
      },
      onError: () => toast({ title: "Error", description: "Failed to save canvas.", variant: "destructive" })
    }
  });

  useEffect(() => {
    if (canvasData?.elements) setElements(canvasData.elements);
  }, [canvasData]);

  // ── Drawing ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Grid
    ctx.strokeStyle = "rgba(150,150,150,0.12)";
    ctx.lineWidth = 1 / scale;
    const gs = 40;
    const l = -offset.x / scale, t = -offset.y / scale;
    const r = l + canvas.width / scale, b = t + canvas.height / scale;
    ctx.beginPath();
    for (let x = Math.floor(l / gs) * gs; x < r; x += gs) { ctx.moveTo(x, t); ctx.lineTo(x, b); }
    for (let y = Math.floor(t / gs) * gs; y < b; y += gs) { ctx.moveTo(l, y); ctx.lineTo(r, y); }
    ctx.stroke();

    // Elements
    elements.forEach((el) => {
      ctx.save();
      const isSelected = selectedId === el.id;

      if (el.type === "freehand") {
        const pts = getFreehandPoints(el);
        if (pts.length < 2) { ctx.restore(); return; }
        ctx.strokeStyle = el.color || "#4338ca";
        ctx.lineWidth = (isSelected ? 3 : 2) / scale;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.stroke();
        if (isSelected) {
          ctx.strokeStyle = "#818cf8";
          ctx.lineWidth = 1 / scale;
          ctx.setLineDash([4 / scale, 4 / scale]);
          const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
          const bx = Math.min(...xs) - 6, by = Math.min(...ys) - 6;
          const bw = Math.max(...xs) - bx + 12, bh = Math.max(...ys) - by + 12;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.setLineDash([]);
        }
        ctx.restore(); return;
      }

      if (el.type === "text") {
        ctx.shadowColor = "transparent";
        ctx.fillStyle = el.color || "#0f172a";
        ctx.font = `500 ${16 / scale > 16 ? 16 : 16}px "SF Pro Display", sans-serif`;
        ctx.font = `500 16px "SF Pro Display", sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(el.label || "Text", el.x, el.y + el.height / 2);
        if (isSelected) {
          ctx.strokeStyle = "#818cf8";
          ctx.lineWidth = 1 / scale;
          ctx.setLineDash([3 / scale, 3 / scale]);
          ctx.strokeRect(el.x - 4, el.y, el.width + 8, el.height);
          ctx.setLineDash([]);
        }
        // Annotation tooltip
        if (el.annotation) {
          ctx.fillStyle = "#6366f1";
          ctx.font = `12px "SF Pro Display", sans-serif`;
          ctx.fillText(`💬 ${el.annotation}`, el.x, el.y - 14);
        }
        ctx.restore(); return;
      }

      ctx.shadowColor = "rgba(0,0,0,0.1)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;

      if (el.type === "button") {
        ctx.fillStyle = el.color || "#4338ca";
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, el.width, el.height, 20);
        ctx.fill();
        if (isSelected) { ctx.strokeStyle = "#818cf8"; ctx.lineWidth = 2 / scale; ctx.stroke(); }
      } else {
        // rectangle, card, input, navbar, modal, list
        const bg = el.type === "card" ? "#ffffff" : el.type === "input" ? "#f8fafc" : "#f1f5f9";
        ctx.fillStyle = el.color || bg;
        ctx.strokeStyle = isSelected ? "#4338ca" : "#cbd5e1";
        ctx.lineWidth = isSelected ? 2 / scale : 1 / scale;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, el.width, el.height, el.type === "input" ? 8 : 12);
        ctx.fill();
        ctx.stroke();
        if (el.type === "input") {
          ctx.fillStyle = "#94a3b8";
          ctx.font = `400 13px "SF Pro Display", sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("Placeholder text…", el.x + 12, el.y + el.height / 2);
        }
        if (el.type === "navbar") {
          ctx.fillStyle = "#334155";
          ctx.font = `600 14px "SF Pro Display", sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("← Nav", el.x + 12, el.y + el.height / 2);
          ctx.textAlign = "right";
          ctx.fillText("≡", el.x + el.width - 12, el.y + el.height / 2);
        }
      }

      // Label
      if (el.label && el.type !== "input" && el.type !== "navbar") {
        ctx.shadowColor = "transparent";
        ctx.fillStyle = el.type === "button" ? "#ffffff" : "#0f172a";
        ctx.font = `500 14px "SF Pro Display", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.label, el.x + el.width / 2, el.y + el.height / 2);
      }

      // Annotation badge
      if (el.annotation && (el.type as string) !== "text") {
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#6366f1";
        ctx.fillRect(el.x + el.width - 16, el.y - 8, 16, 16);
        ctx.fillStyle = "#fff";
        ctx.font = `bold 10px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("A", el.x + el.width - 8, el.y);
      }

      ctx.restore();
    });

    // In-progress freehand stroke
    if (isDrawing && freehandPoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#4338ca";
      ctx.lineWidth = 2 / scale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(freehandPoints[0][0], freehandPoints[0][1]);
      freehandPoints.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [elements, offset, scale, selectedId, isDrawing, freehandPoints]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        draw();
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  // ── Coordinates ────────────────────────────────────────────────────────────
  const getCanvasPos = useCallback((e: React.PointerEvent | React.WheelEvent | DragEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left - offset.x) / scale, y: (e.clientY - rect.top - offset.y) / scale };
  }, [offset, scale]);

  // ── Pointer down ───────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const pos = getCanvasPos(e);

    if (activeTool === "freehand") {
      setIsDrawing(true);
      setFreehandPoints([[pos.x, pos.y]]);
      return;
    }

    if (activeTool === "annotation") {
      // Place annotation on existing element under cursor, or add standalone text
      const hit = [...elements].reverse().find(el => {
        if (el.type === "freehand") return false;
        return pos.x >= el.x && pos.x <= el.x + el.width && pos.y >= el.y && pos.y <= el.y + el.height;
      });
      if (hit) {
        setEditingAnnotationId(hit.id);
        setAnnotationDraft(hit.annotation ?? "");
        setTimeout(() => annotationInputRef.current?.focus(), 50);
      } else {
        // Add standalone text element
        const id = `text-${Date.now()}`;
        setElements(prev => [...prev, {
          id, type: "text" as any, x: pos.x, y: pos.y, width: 200, height: 28, label: "Double-click to edit"
        }]);
        setSelectedId(id);
      }
      return;
    }

    // select tool
    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      setPointerStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    const hit = [...elements].reverse().find(el => {
      if (el.type === "freehand") return false;
      return pos.x >= el.x && pos.x <= el.x + el.width && pos.y >= el.y && pos.y <= el.y + el.height;
    });
    if (hit) {
      setSelectedId(hit.id);
      setIsDraggingEl(true);
      setPointerStart({ x: pos.x - hit.x, y: pos.y - hit.y });
    } else {
      setSelectedId(null);
    }
  }, [activeTool, elements, offset, getCanvasPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (activeTool === "freehand" && isDrawing) {
      const pos = getCanvasPos(e);
      setFreehandPoints(prev => [...prev, [pos.x, pos.y]]);
      return;
    }
    if (isPanning) {
      setOffset({ x: e.clientX - pointerStart.x, y: e.clientY - pointerStart.y });
    } else if (isDraggingEl && selectedId) {
      const pos = getCanvasPos(e);
      setElements(prev => prev.map(el =>
        el.id === selectedId ? { ...el, x: pos.x - pointerStart.x, y: pos.y - pointerStart.y } : el
      ));
    }
  }, [activeTool, isDrawing, isPanning, isDraggingEl, selectedId, pointerStart, getCanvasPos]);

  const handlePointerUp = useCallback(() => {
    if (activeTool === "freehand" && isDrawing && freehandPoints.length > 2) {
      const pts = freehandPoints;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const id = `freehand-${Date.now()}`;
      const newEl: CanvasElement = {
        id, type: "freehand" as any,
        x: Math.min(...xs), y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        annotation: JSON.stringify(pts),
      };
      setElements(prev => [...prev, newEl]);
      setSelectedId(id);
    }
    setIsDrawing(false);
    setFreehandPoints([]);
    setIsDraggingEl(false);
    setIsPanning(false);
  }, [activeTool, isDrawing, freehandPoints]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.001;
      const newScale = Math.min(Math.max(0.1, scale + delta), 5);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        setOffset({ x: mx - (mx - offset.x) * (newScale / scale), y: my - (my - offset.y) * (newScale / scale) });
      }
      setScale(newScale);
    } else {
      setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  }, [scale, offset]);

  // ── Drag from library ──────────────────────────────────────────────────────
  const handleSidebarDragStart = (e: React.DragEvent, shape: typeof SHAPES[0]) => {
    e.dataTransfer.setData("shape-type", shape.type);
    e.dataTransfer.setData("shape-w", String(shape.w));
    e.dataTransfer.setData("shape-h", String(shape.h));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("shape-type");
    if (!type) return;
    const w = parseInt(e.dataTransfer.getData("shape-w")) || 200;
    const h = parseInt(e.dataTransfer.getData("shape-h")) || 100;
    const pos = getCanvasPos(e as unknown as React.PointerEvent);
    const id = `${type}-${Date.now()}`;
    const newEl: CanvasElement = {
      id, type: type as any,
      x: pos.x - w / 2, y: pos.y - h / 2,
      width: w, height: h,
      label: type.charAt(0).toUpperCase() + type.slice(1),
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  // ── Annotation submit ──────────────────────────────────────────────────────
  const commitAnnotation = () => {
    if (!editingAnnotationId) return;
    setElements(prev => prev.map(el =>
      el.id === editingAnnotationId ? { ...el, annotation: annotationDraft || null } : el
    ));
    setEditingAnnotationId(null);
  };

  // ── Delete selected ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && document.activeElement?.tagName !== "INPUT") {
        setElements(prev => prev.filter(el => el.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  // ── Save (offline-aware) ───────────────────────────────────────────────────
  const handleSendToAgents = async () => {
    if (isOffline) {
      await enqueue({ method: "PUT", url: `/api/projects/${projectId}/canvas`, body: { elements } });
      toast({ title: "Queued Offline", description: "Canvas will sync when you reconnect." });
    } else {
      saveCanvas.mutate({ projectId, data: { elements } });
    }
  };

  const cursorClass = activeTool === "freehand" ? "cursor-crosshair" :
    activeTool === "annotation" ? "cursor-text" : "cursor-default";

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">Loading canvas…</span>
      </div>
    );
  }

  return (
    <div className="h-full flex relative overflow-hidden bg-[#fcfcfd] dark:bg-[#0a0f1e]">
      {/* Sidebar Tool Palette */}
      <div className="w-16 md:w-48 absolute left-4 top-4 bottom-4 glass-panel rounded-2xl flex flex-col items-center md:items-stretch py-4 px-2 md:px-3 gap-1 z-10 shadow-lg overflow-y-auto">
        <div className="hidden md:block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Components</div>
        {SHAPES.map((shape) => (
          <div
            key={shape.type}
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, shape)}
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const cx = (-offset.x + canvas.width / 2) / scale;
              const cy = (-offset.y + canvas.height / 2) / scale;
              const id = `${shape.type}-${Date.now()}`;
              setElements(prev => [...prev, {
                id, type: shape.type as any,
                x: cx - shape.w / 2, y: cy - shape.h / 2,
                width: shape.w, height: shape.h,
                label: shape.label,
              }]);
              setSelectedId(id);
              setActiveTool("select");
            }}
            className="flex items-center justify-center md:justify-start gap-3 p-2 md:px-3 md:py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-foreground cursor-grab active:cursor-grabbing select-none"
            title={`Drag or click to add ${shape.label}`}
          >
            <shape.icon className="h-4 w-4 opacity-70 shrink-0" />
            <span className="hidden md:inline text-sm font-medium">{shape.label}</span>
          </div>
        ))}

        {/* Tool separator */}
        <div className="border-t border-border/40 my-2" />
        <div className="hidden md:block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">Tools</div>
        {([
          { id: "select", icon: MousePointer2, label: "Select" },
          { id: "freehand", icon: Pencil, label: "Freehand" },
          { id: "annotation", icon: MessageSquare, label: "Annotate" },
        ] as const).map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id as ActiveTool)}
            className={cn(
              "flex items-center justify-center md:justify-start gap-3 p-2 md:px-3 md:py-2 rounded-xl transition-colors",
              activeTool === tool.id
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
            )}
          >
            <tool.icon className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-sm font-medium">{tool.label}</span>
          </button>
        ))}
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className={cn("flex-1 h-full touch-none", cursorClass)}
        onWheel={handleWheel}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* Annotation input overlay */}
      {editingAnnotationId && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/20 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl p-5 shadow-2xl w-80">
            <p className="text-sm font-semibold mb-3 text-foreground">Add annotation</p>
            <input
              ref={annotationInputRef}
              type="text"
              value={annotationDraft}
              onChange={e => setAnnotationDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitAnnotation(); if (e.key === "Escape") setEditingAnnotationId(null); }}
              placeholder="Describe this element…"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none ring-2 ring-primary/30 focus:ring-primary mb-4"
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1 rounded-xl" onClick={() => setEditingAnnotationId(null)}>Cancel</Button>
              <Button size="sm" className="flex-1 rounded-xl" onClick={commitAnnotation}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Controls & Actions */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-3 z-10">
        <div className="glass-panel rounded-xl flex flex-col shadow-lg overflow-hidden">
          <button onClick={() => setScale(s => Math.min(5, s + 0.15))} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors border-b border-border/50">
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="p-2 text-[10px] font-medium text-center border-b border-border/50 bg-black/5 dark:bg-white/5 min-w-[42px]">
            {Math.round(scale * 100)}%
          </div>
          <button onClick={() => setScale(s => Math.max(0.1, s - 0.15))} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors border-b border-border/50">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <MousePointer2 className="h-4 w-4" />
          </button>
        </div>

        <Button
          size="lg"
          className="rounded-xl shadow-lg shadow-primary/20"
          onClick={handleSendToAgents}
          disabled={saveCanvas.isPending}
        >
          {saveCanvas.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          {isOffline ? "Queue for Agents" : "Send to Agents"}
        </Button>
      </div>
    </div>
  );
}
