import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Alert,
  Animated,
  Modal,
  TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";

import {
  useListProjects,
  useListColumns,
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useDeleteTask,
  getListTasksQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useProjectStream } from "@/hooks/useProjectStream";
import type {
  KanbanTask,
  KanbanColumn,
  KanbanTaskInputAgentRole,
  KanbanTaskInputPriority,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#E83D52",
  high: "#F59E0B",
  medium: "#3B82F6",
  low: "#22C55E",
};

const ROLE_COLORS: Record<string, string> = {
  director: "#8B5CF6",
  design: "#EC4899",
  image: "#F59E0B",
  builder: "#22C55E",
  tester: "#3B82F6",
  deployer: "#06B6D4",
  reviewer: "#6B7280",
};

const ROLES: KanbanTaskInputAgentRole[] = [
  "director","design","image","builder","tester","deployer","reviewer",
];
const PRIORITIES: { value: KanbanTaskInputPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// --- Swipe actions ---

function MoveAction({
  label, color, icon, side, dragX,
}: {
  label: string; color: string; icon: string; side: "left" | "right";
  dragX: Animated.AnimatedInterpolation<number>;
}) {
  const scale = dragX.interpolate({
    inputRange: side === "right" ? [0, 80] : [-80, 0],
    outputRange: side === "right" ? [0.8, 1] : [1, 0.8],
    extrapolate: "clamp",
  });
  return (
    <Animated.View style={[
      styles.swipeAction,
      { backgroundColor: color + "20", transform: [{ scale }],
        [side === "right" ? "marginLeft" : "marginRight"]: 8 }
    ]}>
      <Feather name={icon as any} size={18} color={color} />
      <Text style={[styles.swipeLabel, { color }]}>{label}</Text>
    </Animated.View>
  );
}

function DeleteAction({ dragX }: { dragX: Animated.AnimatedInterpolation<number> }) {
  const scale = dragX.interpolate({
    inputRange: [-80, 0], outputRange: [1, 0.8], extrapolate: "clamp",
  });
  return (
    <Animated.View style={[styles.swipeAction, { backgroundColor: "#E83D5220", transform: [{ scale }], marginLeft: 8 }]}>
      <Feather name="trash-2" size={18} color="#E83D52" />
      <Text style={[styles.swipeLabel, { color: "#E83D52" }]}>Delete</Text>
    </Animated.View>
  );
}

// --- Task card ---

function TaskCard({
  task, columns, onMove, onDelete,
}: {
  task: KanbanTask; columns: KanbanColumn[];
  onMove: (taskId: number, newColumnId: number) => void;
  onDelete: (taskId: number) => void;
}) {
  const colors = useColors();
  const swipeRef = useRef<Swipeable>(null);
  const colIndex = columns.findIndex((c) => c.id === task.columnId);
  const prevCol = colIndex > 0 ? columns[colIndex - 1] : null;
  const nextCol = colIndex < columns.length - 1 ? columns[colIndex + 1] : null;

  const handleSwipeOpen = (direction: "left" | "right") => {
    swipeRef.current?.close();
    if (direction === "left") {
      if (prevCol) onMove(task.id, prevCol.id);
      else {
        Alert.alert("Delete task?", task.title, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => onDelete(task.id) },
        ]);
      }
    } else if (direction === "right" && nextCol) {
      onMove(task.id, nextCol.id);
    }
  };

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (prevCol) {
      return <MoveAction label={prevCol.name} color={prevCol.color} icon="chevron-left" side="left" dragX={dragX} />;
    }
    return <DeleteAction dragX={dragX} />;
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!nextCol) return null;
    return <MoveAction label={nextCol.name} color={nextCol.color} icon="chevron-right" side="right" dragX={dragX} />;
  };

  return (
    <Swipeable ref={swipeRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      friction={2} leftThreshold={80} rightThreshold={80}
      overshootLeft={false} overshootRight={false}
    >
      <View style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.accentBar, { backgroundColor: columns[colIndex]?.color ?? colors.primary }]} />
        <View style={styles.taskBody}>
          <View style={styles.taskTopRow}>
            <View style={[styles.rolePill, { backgroundColor: (ROLE_COLORS[task.agentRole] ?? "#6B7280") + "20" }]}>
              <Text style={[styles.roleText, { color: ROLE_COLORS[task.agentRole] ?? "#6B7280" }]}>
                {task.agentRole}
              </Text>
            </View>
            {task.priority !== "medium" && (
              <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
            )}
          </View>
          <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={2}>{task.title}</Text>
          {task.description ? (
            <Text style={[styles.taskDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{task.description}</Text>
          ) : null}
          {task.branch ? (
            <View style={styles.branchRow}>
              <Feather name="git-branch" size={10} color={colors.mutedForeground} />
              <Text style={[styles.branchText, { color: colors.mutedForeground }]} numberOfLines={1}>{task.branch}</Text>
            </View>
          ) : null}
          <View style={styles.swipeHintRow}>
            {prevCol ? (
              <View style={styles.swipeHint}>
                <Feather name="chevron-left" size={12} color={colors.mutedForeground} />
                <Text style={[styles.swipeHintText, { color: colors.mutedForeground }]}>{prevCol.name}</Text>
              </View>
            ) : (
              <View style={styles.swipeHint}>
                <Feather name="trash-2" size={12} color="#E83D52" />
                <Text style={[styles.swipeHintText, { color: "#E83D52" }]}>Delete</Text>
              </View>
            )}
            <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>{columns[colIndex]?.name ?? ""}</Text>
            {nextCol ? (
              <View style={styles.swipeHint}>
                <Text style={[styles.swipeHintText, { color: colors.mutedForeground }]}>{nextCol.name}</Text>
                <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
              </View>
            ) : <View />}
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

// --- Create task modal ---

interface NewTaskForm {
  title: string;
  description: string;
  role: KanbanTaskInputAgentRole;
  priority: KanbanTaskInputPriority;
}

function CreateTaskModal({
  visible, onClose, columns, activeColumnId, projectId,
}: {
  visible: boolean; onClose: () => void;
  columns: KanbanColumn[]; activeColumnId: number | null; projectId: number;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NewTaskForm>({
    title: "", description: "", role: "builder", priority: "medium",
  });

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) });
        setForm({ title: "", description: "", role: "builder", priority: "medium" });
        onClose();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: () => Alert.alert("Error", "Failed to create task"),
    },
  });

  const handleCreate = useCallback(() => {
    if (!form.title.trim() || !activeColumnId) return;
    createTask.mutate({
      projectId,
      data: {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        columnId: activeColumnId,
        agentRole: form.role,
        priority: form.priority,
      },
    });
  }, [form, activeColumnId, projectId, createTask]);

  const col = columns.find((c) => c.id === activeColumnId);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Task</Text>
          <TouchableOpacity onPress={handleCreate} disabled={!form.title.trim() || createTask.isPending}>
            {createTask.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.modalSave, { color: form.title.trim() ? colors.primary : colors.mutedForeground }]}>
                Create
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody}>
          {/* Column indicator */}
          {col && (
            <View style={[styles.colIndicator, { backgroundColor: col.color + "20" }]}>
              <View style={[styles.colDotSm, { backgroundColor: col.color }]} />
              <Text style={[styles.colIndicatorText, { color: col.color }]}>Adding to {col.name}</Text>
            </View>
          )}

          {/* Title */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>TITLE *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="Describe the task…" placeholderTextColor={colors.mutedForeground}
              autoFocus returnKeyType="next"
            />
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
              placeholder="Optional details…" placeholderTextColor={colors.mutedForeground}
              multiline numberOfLines={3}
            />
          </View>

          {/* Agent role */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>AGENT ROLE</Text>
            <View style={styles.chipGroup}>
              {ROLES.map((r) => (
                <TouchableOpacity key={r}
                  onPress={() => { setForm((f) => ({ ...f, role: r })); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.roleChip, {
                    backgroundColor: form.role === r ? (ROLE_COLORS[r] ?? colors.primary) + "20" : colors.muted,
                    borderColor: form.role === r ? (ROLE_COLORS[r] ?? colors.primary) : colors.border,
                  }]}
                >
                  <Text style={[styles.roleChipText, { color: form.role === r ? (ROLE_COLORS[r] ?? colors.primary) : colors.mutedForeground }]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Priority */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>PRIORITY</Text>
            <View style={styles.chipGroup}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity key={p.value}
                  onPress={() => { setForm((f) => ({ ...f, priority: p.value })); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.roleChip, {
                    backgroundColor: form.priority === p.value ? (PRIORITY_COLORS[p.value] ?? colors.primary) + "20" : colors.muted,
                    borderColor: form.priority === p.value ? (PRIORITY_COLORS[p.value] ?? colors.primary) : colors.border,
                  }]}
                >
                  <Text style={[styles.roleChipText, { color: form.priority === p.value ? (PRIORITY_COLORS[p.value] ?? colors.primary) : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// --- Main screen ---

export default function KanbanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: projects } = useListProjects(undefined, { query: { queryKey: getListProjectsQueryKey() } });
  const projectId = selectedProjectId ?? projects?.[0]?.id ?? 0;

  const { data: columns, isLoading: colsLoading } = useListColumns(projectId, {
    query: { enabled: !!projectId, queryKey: ["listColumns", projectId] as const },
  });
  const { data: tasks, isLoading: tasksLoading } = useListTasks(projectId, {
    query: { enabled: !!projectId, queryKey: getListTasksQueryKey(projectId) },
  });

  // Real-time SSE: invalidate task cache the instant any mutation lands on the server
  useProjectStream(projectId || null, (event) => {
    if (event.type === "tasks_updated") {
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) });
    }
  });

  const updateTask = useUpdateTask({
    mutation: {
      onMutate: async ({ taskId, data }) => {
        await queryClient.cancelQueries({ queryKey: getListTasksQueryKey(projectId) });
        const prev = queryClient.getQueryData<KanbanTask[]>(getListTasksQueryKey(projectId));
        if (prev && data.columnId) {
          queryClient.setQueryData<KanbanTask[]>(getListTasksQueryKey(projectId),
            prev.map((t) => t.id === taskId ? { ...t, columnId: data.columnId! } : t));
        }
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(getListTasksQueryKey(projectId), ctx.prev);
        Alert.alert("Error", "Failed to move task");
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) }),
    },
  });

  const deleteTask = useDeleteTask({
    mutation: {
      onMutate: async ({ taskId }) => {
        await queryClient.cancelQueries({ queryKey: getListTasksQueryKey(projectId) });
        const prev = queryClient.getQueryData<KanbanTask[]>(getListTasksQueryKey(projectId));
        if (prev) {
          queryClient.setQueryData<KanbanTask[]>(getListTasksQueryKey(projectId), prev.filter((t) => t.id !== taskId));
        }
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(getListTasksQueryKey(projectId), ctx.prev);
        Alert.alert("Error", "Failed to delete task");
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(projectId) }),
    },
  });

  const handleMove = (taskId: number, newColumnId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateTask.mutate({ projectId, taskId, data: { columnId: newColumnId } });
  };

  const handleDelete = useCallback((taskId: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteTask.mutate({ projectId, taskId });
  }, [projectId, deleteTask]);

  const sortedCols = [...(columns ?? [])].sort((a, b) => a.order - b.order);
  const activeColId = selectedColumnId ?? sortedCols[0]?.id ?? null;
  const visibleTasks = tasks?.filter((t) => t.columnId === activeColId) ?? [];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const isLoading = colsLoading || tasksLoading;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        {Platform.OS === "ios" && (
          <BlurView style={StyleSheet.absoluteFill} intensity={80} tint={isDark ? "dark" : "light"} />
        )}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Board</Text>
          {projects && projects.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {projects.map((p) => (
                <TouchableOpacity key={p.id}
                  onPress={() => { setSelectedProjectId(p.id); setSelectedColumnId(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.projectChip, {
                    backgroundColor: p.id === projectId ? colors.primary : colors.muted,
                    borderColor: p.id === projectId ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.projectChipText, { color: p.id === projectId ? "#fff" : colors.mutedForeground }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
        {sortedCols.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colTabsRow}>
            {sortedCols.map((col) => {
              const count = tasks?.filter((t) => t.columnId === col.id).length ?? 0;
              const active = col.id === activeColId;
              return (
                <TouchableOpacity key={col.id}
                  onPress={() => { setSelectedColumnId(col.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={styles.colTab}
                >
                  <View style={[styles.colDot, { backgroundColor: col.color }]} />
                  <Text style={[styles.colTabText, { color: active ? colors.foreground : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                    {col.name}
                  </Text>
                  <View style={[styles.colCount, { backgroundColor: active ? colors.primary + "20" : colors.muted }]}>
                    <Text style={[styles.colCountText, { color: active ? colors.primary : colors.mutedForeground }]}>{count}</Text>
                  </View>
                  {active && <View style={[styles.colUnderline, { backgroundColor: colors.primary }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Task list */}
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={visibleTasks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: botPad + (Platform.OS === "web" ? 34 : 100) }]}
          renderItem={({ item }) => (
            <TaskCard task={item} columns={sortedCols} onMove={handleMove} onDelete={handleDelete} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tasks here</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Tap + to add the first task</Text>
            </View>
          }
          scrollEnabled={!!visibleTasks.length}
        />
      )}

      {/* FAB */}
      {!!projectId && !!activeColId && (
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreate(true); }}
          style={[styles.fab, { backgroundColor: colors.primary, bottom: botPad + (Platform.OS === "web" ? 34 : 90) }]}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create task modal */}
      <CreateTaskModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        columns={sortedCols}
        activeColumnId={activeColId}
        projectId={projectId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { overflow: "hidden", borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5, flexShrink: 0 },
  projectChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  projectChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  colTabsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 4 },
  colTab: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 6, position: "relative" },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTabText: { fontSize: 14 },
  colCount: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 22, alignItems: "center" },
  colCountText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  colUnderline: { position: "absolute", bottom: 0, left: 12, right: 12, height: 2, borderRadius: 1 },
  listContent: { padding: 16, gap: 12 },
  taskCard: {
    borderRadius: 14, borderWidth: 1, flexDirection: "row", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  accentBar: { width: 4 },
  taskBody: { flex: 1, padding: 14, gap: 6 },
  taskTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  taskDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  branchRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  branchText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  swipeHintRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8,
    paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(128,128,128,0.15)",
  },
  swipeHint: { flexDirection: "row", alignItems: "center", gap: 2 },
  swipeHintText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  colLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  swipeAction: {
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    minWidth: 72, borderRadius: 14, gap: 4, marginVertical: 2, padding: 10,
  },
  swipeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, paddingTop: 20, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalCancel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalBody: { padding: 20, gap: 20 },
  colIndicator: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  colDotSm: { width: 8, height: 8, borderRadius: 4 },
  colIndicatorText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  formGroup: { gap: 8 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  textInput: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontFamily: "Inter_400Regular", borderWidth: 1,
  },
  textArea: { height: 80, textAlignVertical: "top", paddingTop: 12 },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  roleChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
