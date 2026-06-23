import { create } from "zustand";
import type { CanvasLayout, FlowGraphState, CanvasItem } from "./widget-types";

type HistoryEntry = {
  gridLayout: CanvasLayout;
  flowGraph: FlowGraphState;
};

interface EditorState {
  activeLayoutId: string | null;
  selectedItemId: string | null;
  unsavedChanges: boolean;
  gridLayout: CanvasLayout;
  flowGraph: FlowGraphState;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  codePanelOpen: boolean;

  setActiveLayoutId: (id: string | null) => void;
  setSelectedItemId: (id: string | null) => void;
  setGridLayout: (layout: CanvasLayout, pushHistory?: boolean) => void;
  setFlowGraph: (graph: FlowGraphState, pushHistory?: boolean) => void;
  updateWidgetConfig: (itemId: string, config: Record<string, unknown>) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setCodePanelOpen: (open: boolean) => void;
  reset: () => void;
  getSelectedItem: () => CanvasItem | undefined;
}

const EMPTY_GRID: CanvasLayout = { items: [] };
const EMPTY_FLOW: FlowGraphState = { nodes: [], edges: [] };

export const useEditorStore = create<EditorState>((set, get) => ({
  activeLayoutId: null,
  selectedItemId: null,
  unsavedChanges: false,
  gridLayout: EMPTY_GRID,
  flowGraph: EMPTY_FLOW,
  undoStack: [],
  redoStack: [],
  leftPanelOpen: true,
  rightPanelOpen: true,
  codePanelOpen: false,

  setActiveLayoutId: (id) => set({ activeLayoutId: id }),
  setSelectedItemId: (id) => set({ selectedItemId: id }),

  setGridLayout: (layout, pushHistory = true) => {
    const { gridLayout, flowGraph, undoStack } = get();
    if (pushHistory) {
      set({
        gridLayout: layout,
        unsavedChanges: true,
        undoStack: [...undoStack.slice(-19), { gridLayout, flowGraph }],
        redoStack: [],
      });
    } else {
      set({ gridLayout: layout });
    }
  },

  setFlowGraph: (graph, pushHistory = true) => {
    const { gridLayout, flowGraph, undoStack } = get();
    if (pushHistory) {
      set({
        flowGraph: graph,
        unsavedChanges: true,
        undoStack: [...undoStack.slice(-19), { gridLayout, flowGraph }],
        redoStack: [],
      });
    } else {
      set({ flowGraph: graph });
    }
  },

  updateWidgetConfig: (itemId, config) => {
    const { gridLayout } = get();
    const items = gridLayout.items.map((item) =>
      item.i === itemId
        ? { ...item, widget: item.widget ? { ...item.widget, config } : undefined }
        : item
    );
    get().setGridLayout({ ...gridLayout, items });
  },

  undo: () => {
    const { undoStack, redoStack, gridLayout, flowGraph } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      gridLayout: prev.gridLayout,
      flowGraph: prev.flowGraph,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { gridLayout, flowGraph }],
      unsavedChanges: true,
    });
  },

  redo: () => {
    const { redoStack, undoStack, gridLayout, flowGraph } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      gridLayout: next.gridLayout,
      flowGraph: next.flowGraph,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { gridLayout, flowGraph }],
      unsavedChanges: true,
    });
  },

  markSaved: () => set({ unsavedChanges: false }),

  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setCodePanelOpen: (open) => set({ codePanelOpen: open }),

  reset: () =>
    set({
      activeLayoutId: null,
      selectedItemId: null,
      unsavedChanges: false,
      gridLayout: EMPTY_GRID,
      flowGraph: EMPTY_FLOW,
      undoStack: [],
      redoStack: [],
      codePanelOpen: false,
    }),

  getSelectedItem: () => {
    const { selectedItemId, gridLayout } = get();
    if (!selectedItemId) return undefined;
    return gridLayout.items.find((item) => item.i === selectedItemId);
  },
}));
