export interface Widget {
  id: string;
  slug: string;
  mode: "compact" | "full";
  config: Record<string, unknown>;
  inputs?: Record<string, string>;
  outputs?: Record<string, unknown>;
}

export interface CanvasItemStyle {
  background?: string;
  borderRadius?: string;
}

export interface CanvasItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  widget?: Widget;
  style?: CanvasItemStyle;
}

export interface CanvasLayout {
  items: CanvasItem[];
}

export interface FlowGraphState {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}
