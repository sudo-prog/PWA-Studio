import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListProjects, useCreateProject, getListProjectsQueryKey } from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

const STATUS_COLORS: Record<string, string> = {
  active: "#22C55E",
  building: "#F59E0B",
  testing: "#3B82F6",
  deployed: "#8B5CF6",
  archived: "#6B7280",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  building: "Building",
  testing: "Testing",
  deployed: "Deployed",
  archived: "Archived",
};

function ProjectRow({ project, onPress }: { project: Project; onPress: () => void }) {
  const colors = useColors();
  const completion =
    project.taskCount && project.taskCount > 0
      ? Math.round(((project.completedTaskCount ?? 0) / project.taskCount) * 100)
      : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.projectRow, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[project.status] ?? colors.muted }]} />
      <View style={styles.projectInfo}>
        <Text style={[styles.projectName, { color: colors.foreground }]} numberOfLines={1}>
          {project.name}
        </Text>
        {project.description ? (
          <Text style={[styles.projectDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
            {project.description}
          </Text>
        ) : null}
        <View style={styles.progressRow}>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: colors.primary, width: `${completion}%` as any },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
            {project.completedTaskCount ?? 0}/{project.taskCount ?? 0}
          </Text>
        </View>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[project.status] ?? "#6B7280") + "20" }]}>
        <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[project.status] ?? colors.mutedForeground }]}>
          {STATUS_LABELS[project.status] ?? project.status}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: projects, isLoading, isError, refetch } = useListProjects(undefined, {
    query: { queryKey: getListProjectsQueryKey() },
  });

  const createProject = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setShowCreate(false);
        setNewName("");
        setNewDesc("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: () => {
        Alert.alert("Error", "Failed to create project");
      },
    },
  });

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createProject.mutate({ data: { name: newName.trim(), description: newDesc.trim() || undefined } });
  }, [newName, newDesc, createProject]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.background, colors.background + "00"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Projects</Text>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreate(true); }}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Couldn't load projects</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={projects ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: topPad + 72, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90 },
          ]}
          renderItem={({ item }) => (
            <ProjectRow
              project={item}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/project/${item.id}`);
              }}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={refetch}
              tintColor={colors.primary}
              progressViewOffset={topPad + 72}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="folder" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No projects yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Tap + to start your first project
              </Text>
            </View>
          }
        />
      )}

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Project</Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={!newName.trim() || createProject.isPending}
            >
              {createProject.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.modalSave, { color: newName.trim() ? colors.primary : colors.mutedForeground }]}>
                  Create
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>PROJECT NAME</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="My Awesome App"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              returnKeyType="next"
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="Optional description"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  projectInfo: { flex: 1, gap: 4 },
  projectName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  projectDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalCancel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  formGroup: { padding: 20, gap: 8 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  textInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
  },
});
