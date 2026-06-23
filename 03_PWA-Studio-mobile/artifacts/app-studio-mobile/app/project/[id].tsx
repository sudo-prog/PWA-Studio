import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import {
  useGetProject,
  useListAgents,
  useGetActivityFeed,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import type { AgentStatus, ActivityEvent } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const ROLE_COLORS: Record<string, string> = {
  director: "#8B5CF6",
  design: "#EC4899",
  image: "#F59E0B",
  builder: "#22C55E",
  tester: "#3B82F6",
  deployer: "#06B6D4",
  reviewer: "#6B7280",
};

const STATUS_ICON: Record<string, string> = {
  idle: "pause-circle",
  running: "activity",
  waiting: "clock",
  error: "alert-circle",
  complete: "check-circle",
};

const STATUS_COLOR: Record<string, string> = {
  idle: "#6B7280",
  running: "#22C55E",
  waiting: "#F59E0B",
  error: "#E83D52",
  complete: "#3B82F6",
};

const EVENT_ICON: Record<string, string> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  error: "x-circle",
  progress: "loader",
};

const EVENT_COLOR: Record<string, string> = {
  info: "#3B82F6",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#E83D52",
  progress: "#8B5CF6",
};

function AgentRow({ agent }: { agent: AgentStatus }) {
  const colors = useColors();
  const roleColor = ROLE_COLORS[agent.role] ?? "#6B7280";
  const statusColor = STATUS_COLOR[agent.status] ?? "#6B7280";

  return (
    <View style={[styles.agentRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
      <View style={styles.agentInfo}>
        <View style={styles.agentTopRow}>
          <Text style={[styles.agentRole, { color: colors.foreground }]}>
            {agent.role.charAt(0).toUpperCase() + agent.role.slice(1)}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: statusColor + "20" }]}>
            <Feather name={STATUS_ICON[agent.status] as any ?? "pause-circle"} size={10} color={statusColor} />
            <Text style={[styles.statusChipText, { color: statusColor }]}>{agent.status}</Text>
          </View>
        </View>
        {agent.currentTask ? (
          <Text style={[styles.agentTask, { color: colors.mutedForeground }]} numberOfLines={1}>
            {agent.currentTask}
          </Text>
        ) : null}
        {agent.progress != null && agent.progress > 0 ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.progressBar, { backgroundColor: roleColor, width: `${agent.progress}%` as any }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const colors = useColors();
  const col = EVENT_COLOR[event.type] ?? "#6B7280";

  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: col + "20" }]}>
        <Feather name={EVENT_ICON[event.type] as any ?? "info"} size={14} color={col} />
      </View>
      <View style={styles.activityBody}>
        <Text style={[styles.activityMsg, { color: colors.foreground }]} numberOfLines={2}>
          {event.message}
        </Text>
        <View style={styles.activityMeta}>
          <View style={[styles.rolePill, { backgroundColor: (ROLE_COLORS[event.agentRole] ?? "#6B7280") + "20" }]}>
            <Text style={[styles.rolePillText, { color: ROLE_COLORS[event.agentRole] ?? "#6B7280" }]}>
              {event.agentRole}
            </Text>
          </View>
          <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>
            {new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
        </View>
      </View>
    </View>
  );
}

type TabId = "agents" | "activity";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>("agents");

  const { data: project, isLoading: projLoading, refetch: refetchProject } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId), retry: false },
  });

  const { data: agents, isLoading: agentsLoading, refetch: refetchAgents } = useListAgents(projectId, {
    query: { enabled: !!projectId, queryKey: ["listAgents", projectId] as const },
  });

  const { data: activity, isLoading: actLoading, refetch: refetchActivity } = useGetActivityFeed(projectId, {
    query: { enabled: !!projectId, queryKey: ["getActivityFeed", projectId] as const },
  });

  const refetch = () => {
    refetchProject();
    refetchAgents();
    refetchActivity();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const STATUS_COLORS_MAP: Record<string, string> = {
    active: "#22C55E", building: "#F59E0B", testing: "#3B82F6", deployed: "#8B5CF6", archived: "#6B7280",
  };

  if (projLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad + 60 }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const completion =
    project?.taskCount && project.taskCount > 0
      ? Math.round(((project.completedTaskCount ?? 0) / project.taskCount) * 100)
      : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 60, paddingBottom: botPad + 24 }]}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} progressViewOffset={topPad + 60} />
        }
      >
        {/* Project header */}
        {project && (
          <View style={styles.projectHeader}>
            <View style={styles.projectTitleRow}>
              <Text style={[styles.projectTitle, { color: colors.foreground }]}>{project.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS_MAP[project.status] ?? "#6B7280") + "20" }]}>
                <Text style={[styles.statusBadgeText, { color: STATUS_COLORS_MAP[project.status] ?? "#6B7280" }]}>
                  {project.status}
                </Text>
              </View>
            </View>
            {project.description ? (
              <Text style={[styles.projectDesc, { color: colors.mutedForeground }]}>{project.description}</Text>
            ) : null}

            {/* Progress */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Progress</Text>
                <Text style={[styles.progressPct, { color: colors.primary }]}>{completion}%</Text>
              </View>
              <View style={[styles.progressTrackFull, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressBar, { backgroundColor: colors.primary, width: `${completion}%` as any }]} />
              </View>
              <Text style={[styles.taskCount, { color: colors.mutedForeground }]}>
                {project.completedTaskCount ?? 0} / {project.taskCount ?? 0} tasks
              </Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {(["agents", "activity"] as TabId[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                setActiveTab(tab);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.tabText, {
                color: activeTab === tab ? colors.primary : colors.mutedForeground,
                fontFamily: activeTab === tab ? "Inter_600SemiBold" : "Inter_400Regular",
              }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === "agents" ? (
          <View style={styles.section}>
            {agentsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : agents && agents.length > 0 ? (
              agents.map((a) => <AgentRow key={a.id} agent={a} />)
            ) : (
              <View style={styles.emptyState}>
                <Feather name="cpu" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No agents active</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {actLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : activity && activity.length > 0 ? (
              activity.slice(0, 30).map((e) => <ActivityRow key={e.id} event={e} />)
            ) : (
              <View style={styles.emptyState}>
                <Feather name="activity" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No activity yet</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 20 },
  projectHeader: { marginBottom: 20 },
  projectTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  projectTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  projectDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 16 },
  progressSection: { gap: 6 },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  progressPct: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressTrackFull: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressBar: { height: 6, borderRadius: 3 },
  taskCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14 },
  section: { gap: 10 },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  roleDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  agentInfo: { flex: 1, gap: 4 },
  agentTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  agentRole: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  agentTask: { fontSize: 13, fontFamily: "Inter_400Regular" },
  progressTrack: { height: 3, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  activityRow: { flexDirection: "row", gap: 12, paddingVertical: 10 },
  activityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  activityBody: { flex: 1, gap: 6 },
  activityMsg: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  activityMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  rolePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  activityTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
