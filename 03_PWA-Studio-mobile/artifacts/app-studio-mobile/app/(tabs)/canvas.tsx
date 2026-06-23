import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import Svg, { Path, Rect, G } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useColorScheme } from "react-native";

import {
  useListProjects,
  useGetCanvas,
  useSaveCanvas,
  getListProjectsQueryKey,
  getGetCanvasQueryKey,
} from "@workspace/api-client-react";
import type { CanvasElement, CanvasElementType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

const SCREEN = Dimensions.get("window");

type Tool = "pen" | "select";

interface StrokePath {
  id: string;
  d: string;
  color: string;
  width: number;
}

interface CanvasShape {
  id: string;
  type: "rectangle" | "button" | "input" | "card" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

interface LocalCanvasState {
  paths: StrokePath[];
  shapes: CanvasShape[];
}

const PALETTE_ITEMS: { type: CanvasShape["type"]; label: string; w: number; h: number }[] = [
  { type: "rectangle", label: "Box", w: 160, h: 100 },
  { type: "card", label: "Card", w: 200, h: 120 },
  { type: "button", label: "Btn", w: 100, h: 40 },
  { type: "input", label: "Input", w: 180, h: 44 },
  { type: "text", label: "Text", w: 160, h: 32 },
];

const STROKE_COLORS = ["#4040E8", "#E83D52", "#22C55E", "#F59E0B", "#8B5CF6", "#0F172A"];

// --- Serialization helpers ---

function toCanvasElements(paths: StrokePath[], shapes: CanvasShape[]): CanvasElement[] {
  const pathElements: CanvasElement[] = paths.map((p) => ({
    id: p.id,
    type: "freehand" as CanvasElementType,
    x: 0, y: 0, width: 0, height: 0,
    annotation: p.d,
    color: p.color,
  }));
  const shapeElements: CanvasElement[] = shapes.map((s) => ({
    id: s.id,
    type: s.type as CanvasElementType,
    x: s.x, y: s.y,
    width: s.w, height: s.h,
    label: s.label,
  }));
  return [...pathElements, ...shapeElements];
}

function fromCanvasElements(elements: CanvasElement[]): LocalCanvasState {
  const paths: StrokePath[] = [];
  const shapes: CanvasShape[] = [];
  for (const el of elements) {
    if (el.type === "freehand") {
      if (el.annotation) {
        paths.push({ id: el.id, d: el.annotation, color: el.color ?? "#4040E8", width: 2.5 });
      }
    } else {
      shapes.push({
        id: el.id,
        type: el.type as CanvasShape["type"],
        x: el.x, y: el.y,
        w: el.width, h: el.height,
        label: el.label ?? el.type,
      });
    }
  }
  return { paths, shapes };
}

// --- Distance helpers for pinch-zoom ---

function getDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(touches: { pageX: number; pageY: number }[]) {
  return {
    x: (touches[0].pageX + touches[1].pageX) / 2,
    y: (touches[0].pageY + touches[1].pageY) / 2,
  };
}

function localKey(projectId: number | null) {
  return `canvas-state-${projectId ?? "local"}`;
}

export default function CanvasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const queryClient = useQueryClient();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [strokeColor, setStrokeColor] = useState(colors.primary);
  const [paths, setPaths] = useState<StrokePath[]>([]);
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const { data: projects } = useListProjects(undefined, {
    query: { queryKey: getListProjectsQueryKey() },
  });

  // Load canvas from server when project is selected
  const { data: serverCanvas } = useGetCanvas(selectedProjectId ?? 0, {
    query: {
      enabled: !!selectedProjectId,
      queryKey: getGetCanvasQueryKey(selectedProjectId ?? 0),
      retry: false,
    },
  });

  const saveCanvas = useSaveCanvas({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetCanvasQueryKey(selectedProjectId ?? 0), result);
        setIsDirty(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: () => Alert.alert("Save failed", "Couldn't sync to server. Your drawing is saved locally."),
    },
  });

  // When server canvas loads, merge it into local state
  useEffect(() => {
    if (serverCanvas?.elements?.length) {
      const { paths: p, shapes: s } = fromCanvasElements(serverCanvas.elements);
      setPaths(p);
      setShapes(s);
      setIsDirty(false);
    }
  }, [serverCanvas]);

  // When project changes (and no server data yet), load from AsyncStorage
  useEffect(() => {
    if (!selectedProjectId) {
      // Local canvas — load from storage
      AsyncStorage.getItem(localKey(null)).then((raw) => {
        if (raw) {
          const parsed: LocalCanvasState = JSON.parse(raw);
          setPaths(parsed.paths ?? []);
          setShapes(parsed.shapes ?? []);
        } else {
          setPaths([]); setShapes([]);
        }
      }).catch(() => { setPaths([]); setShapes([]); });
      return;
    }
    // Project canvas — will be populated by serverCanvas effect
    // Show local cache while loading
    AsyncStorage.getItem(localKey(selectedProjectId)).then((raw) => {
      if (raw) {
        const parsed: LocalCanvasState = JSON.parse(raw);
        setPaths(parsed.paths ?? []);
        setShapes(parsed.shapes ?? []);
      } else {
        setPaths([]); setShapes([]);
      }
    }).catch(() => {});
    setIsDirty(false);
  }, [selectedProjectId]);

  // Debounced local save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveToStorage = useCallback((p: StrokePath[], s: CanvasShape[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(localKey(selectedProjectId), JSON.stringify({ paths: p, shapes: s }));
      } catch {}
    }, 800);
  }, [selectedProjectId]);

  const handleSaveToServer = useCallback(() => {
    if (!selectedProjectId) {
      Alert.alert("Select a project", "Choose a project above to sync your canvas to the server.");
      return;
    }
    const elements = toCanvasElements(paths, shapes);
    saveCanvas.mutate({ projectId: selectedProjectId, data: { elements } });
  }, [selectedProjectId, paths, shapes, saveCanvas]);

  // Drawing state refs
  const currentPathRef = useRef("");
  const isDrawingRef = useRef(false);
  const [tick, setTick] = useState(0);
  const prevDist = useRef(0);
  const prevMid = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const pathsRef = useRef(paths);
  pathsRef.current = paths;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches as any[];
          if (touches.length === 2) {
            prevDist.current = getDistance(touches);
            prevMid.current = getMidpoint(touches);
            return;
          }
          if (toolRef.current === "pen") {
            const lx = (evt.nativeEvent.locationX - offsetRef.current.x) / scaleRef.current;
            const ly = (evt.nativeEvent.locationY - offsetRef.current.y) / scaleRef.current;
            currentPathRef.current = `M${lx.toFixed(1)},${ly.toFixed(1)}`;
            isDrawingRef.current = true;
          }
        },
        onPanResponderMove: (evt, gs) => {
          const touches = evt.nativeEvent.touches as any[];
          if (touches.length === 2) {
            const dist = getDistance(touches);
            const mid = getMidpoint(touches);
            if (prevDist.current > 0) {
              const ratio = dist / prevDist.current;
              const newScale = Math.max(0.2, Math.min(4, scaleRef.current * ratio));
              const dx = mid.x - prevMid.current.x;
              const dy = mid.y - prevMid.current.y;
              scaleRef.current = newScale;
              offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
              setScale(newScale);
              setOffset({ ...offsetRef.current });
            }
            prevDist.current = dist;
            prevMid.current = mid;
            return;
          }
          prevDist.current = 0;
          if (toolRef.current === "pen" && isDrawingRef.current) {
            const lx = (evt.nativeEvent.locationX - offsetRef.current.x) / scaleRef.current;
            const ly = (evt.nativeEvent.locationY - offsetRef.current.y) / scaleRef.current;
            currentPathRef.current += ` L${lx.toFixed(1)},${ly.toFixed(1)}`;
            setTick((t) => t + 1);
          } else if (toolRef.current === "select") {
            offsetRef.current = { x: offsetRef.current.x + gs.dx, y: offsetRef.current.y + gs.dy };
            gs.dx = 0; gs.dy = 0;
            setOffset({ ...offsetRef.current });
          }
        },
        onPanResponderRelease: () => {
          prevDist.current = 0;
          if (toolRef.current === "pen" && isDrawingRef.current && currentPathRef.current.length > 10) {
            const newPath: StrokePath = {
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
              d: currentPathRef.current,
              color: strokeColorRef.current,
              width: 2.5,
            };
            const next = [...pathsRef.current, newPath];
            setPaths(next);
            saveToStorage(next, shapesRef.current);
            setIsDirty(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          currentPathRef.current = "";
          isDrawingRef.current = false;
          setTick((t) => t + 1);
        },
        onPanResponderTerminate: () => { isDrawingRef.current = false; currentPathRef.current = ""; },
      }),
    [saveToStorage]
  );

  const addShape = useCallback((item: typeof PALETTE_ITEMS[0]) => {
    const cx = (-offsetRef.current.x + SCREEN.width / 2) / scaleRef.current - item.w / 2;
    const cy = (-offsetRef.current.y + SCREEN.height / 2) / scaleRef.current - item.h / 2;
    const newShape: CanvasShape = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      type: item.type, x: cx, y: cy, w: item.w, h: item.h, label: item.label,
    };
    const next = [...shapesRef.current, newShape];
    setShapes(next);
    saveToStorage(pathsRef.current, next);
    setIsDirty(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [saveToStorage]);

  const clearCanvas = () => {
    Alert.alert("Clear Canvas", "Remove all strokes and shapes?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => {
          setPaths([]); setShapes([]);
          setIsDirty(true);
          await AsyncStorage.removeItem(localKey(selectedProjectId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const shapeStroke = isDark ? "#3A4A6A" : "#CBD5E1";

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#060A18" : "#F0F2F7" }]}>
      {/* Canvas */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <Svg style={StyleSheet.absoluteFill} width={SCREEN.width} height={SCREEN.height}>
          <G transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
            {Array.from({ length: 40 }, (_, i) => (
              <React.Fragment key={`g${i}`}>
                <Path d={`M${i * 40 - 800},${-800} L${i * 40 - 800},${2400}`}
                  stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} strokeWidth={1 / scale} />
                <Path d={`M${-800},${i * 40 - 800} L${2400},${i * 40 - 800}`}
                  stroke={isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"} strokeWidth={1 / scale} />
              </React.Fragment>
            ))}
            {shapes.map((sh) => (
              <G key={sh.id}>
                {sh.type === "button" ? (
                  <Rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={20} ry={20} fill={colors.primary} opacity={0.9} />
                ) : (
                  <Rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={12} ry={12}
                    fill={isDark ? "#0B1023" : "#FFFFFF"} stroke={shapeStroke} strokeWidth={1 / scale} />
                )}
              </G>
            ))}
            {paths.map((p) => (
              <Path key={p.id} d={p.d} stroke={p.color} strokeWidth={p.width / scale}
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {isDrawingRef.current && currentPathRef.current ? (
              <Path d={currentPathRef.current} stroke={strokeColor} strokeWidth={2.5 / scale}
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
          </G>
        </Svg>
      </View>

      {/* Top toolbar */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        {Platform.OS === "ios" ? (
          <BlurView style={StyleSheet.absoluteFill} intensity={80} tint={isDark ? "dark" : "light"} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(6,10,24,0.92)" : "rgba(247,249,252,0.92)" }]} />
        )}

        {/* Row 1: Tools + colors + save/clear */}
        <View style={styles.topBarContent}>
          <View style={styles.toolGroup}>
            {(["pen", "select"] as Tool[]).map((t) => (
              <TouchableOpacity key={t}
                onPress={() => { setTool(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.toolBtn, tool === t && { backgroundColor: colors.primary + "25" }]}
              >
                <Feather name={t === "pen" ? "edit-3" : "move"} size={18}
                  color={tool === t ? colors.primary : colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow}>
            {STROKE_COLORS.map((c) => (
              <TouchableOpacity key={c}
                onPress={() => { setStrokeColor(c); setTool("pen"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.swatch, { backgroundColor: c }, strokeColor === c && styles.swatchActive]}
              />
            ))}
          </ScrollView>
          {/* Save to server button */}
          <TouchableOpacity
            onPress={handleSaveToServer}
            disabled={saveCanvas.isPending}
            style={[styles.toolBtn, isDirty && selectedProjectId ? { backgroundColor: colors.primary + "20" } : {}]}
          >
            {saveCanvas.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={isDirty && selectedProjectId ? "upload-cloud" : "cloud"}
                size={18}
                color={isDirty && selectedProjectId ? colors.primary : colors.mutedForeground}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={clearCanvas} style={styles.toolBtn}>
            <Feather name="trash-2" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </View>

        {/* Row 2: Project selector */}
        {projects && projects.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projectRow}>
            <TouchableOpacity
              onPress={() => { setSelectedProjectId(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.projectChip, {
                backgroundColor: selectedProjectId === null ? colors.primary : colors.muted,
                borderColor: selectedProjectId === null ? colors.primary : colors.border,
              }]}
            >
              <Text style={[styles.projectChipText, { color: selectedProjectId === null ? "#fff" : colors.mutedForeground }]}>
                Local
              </Text>
            </TouchableOpacity>
            {projects.map((p) => (
              <TouchableOpacity key={p.id}
                onPress={() => { setSelectedProjectId(p.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.projectChip, {
                  backgroundColor: selectedProjectId === p.id ? colors.primary : colors.muted,
                  borderColor: selectedProjectId === p.id ? colors.primary : colors.border,
                }]}
              >
                <Text style={[styles.projectChipText, { color: selectedProjectId === p.id ? "#fff" : colors.mutedForeground }]}
                  numberOfLines={1}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Bottom shape palette */}
      <View style={[styles.bottomBar, { paddingBottom: botPad + (Platform.OS === "web" ? 0 : 80) }]}>
        {Platform.OS === "ios" ? (
          <BlurView style={StyleSheet.absoluteFill} intensity={80} tint={isDark ? "dark" : "light"} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(6,10,24,0.92)" : "rgba(247,249,252,0.92)" }]} />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paletteRow}>
          {PALETTE_ITEMS.map((item) => (
            <TouchableOpacity key={item.type} onPress={() => addShape(item)}
              style={[styles.paletteItem, { borderColor: colors.border, backgroundColor: colors.card + "CC" }]}
            >
              <Feather
                name={item.type === "button" ? "mouse-pointer" : item.type === "input" ? "type" : item.type === "card" ? "layout" : item.type === "text" ? "type" : "square"}
                size={16} color={colors.foreground}
              />
              <Text style={[styles.paletteLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  topBarContent: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  toolGroup: { flexDirection: "row", gap: 4 },
  toolBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  colorRow: { flex: 1 },
  swatch: { width: 24, height: 24, borderRadius: 12, marginHorizontal: 4 },
  swatchActive: {
    borderWidth: 2.5, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 4,
  },
  projectRow: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  projectChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  projectChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  paletteRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  paletteItem: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  paletteLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
