import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Provider = { key: keyof FormState; label: string; placeholder: string; icon: string };

const PROVIDERS: Provider[] = [
  { key: "openaiKey", label: "OpenAI", placeholder: "sk-…", icon: "zap" },
  { key: "anthropicKey", label: "Anthropic", placeholder: "sk-ant-…", icon: "cpu" },
  { key: "geminiKey", label: "Gemini", placeholder: "AIza…", icon: "star" },
];

interface FormState {
  openaiKey: string;
  anthropicKey: string;
  geminiKey: string;
  customEndpoint: string;
  defaultModel: string;
}

function KeyField({
  provider,
  value,
  onChange,
}: {
  provider: Provider;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useColors();
  const [show, setShow] = useState(false);

  return (
    <View style={[styles.keyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.keyHeader}>
        <Feather name={provider.icon as any} size={16} color={colors.primary} />
        <Text style={[styles.keyLabel, { color: colors.foreground }]}>{provider.label}</Text>
        {value ? (
          <View style={[styles.connectedBadge, { backgroundColor: "#22C55E20" }]}>
            <View style={[styles.connectedDot, { backgroundColor: "#22C55E" }]} />
            <Text style={[styles.connectedText, { color: "#22C55E" }]}>Connected</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <TextInput
          style={[styles.keyInput, { color: colors.foreground }]}
          value={value}
          onChangeText={onChange}
          placeholder={provider.placeholder}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        <TouchableOpacity onPress={() => setShow((s) => !s)} style={styles.eyeBtn}>
          <Feather name={show ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<FormState>({
    openaiKey: "",
    anthropicKey: "",
    geminiKey: "",
    customEndpoint: "",
    defaultModel: "gpt-4o",
  });

  const { data: settings, isLoading } = useGetSettings();

  useEffect(() => {
    if (settings) {
      setForm({
        openaiKey: settings.openaiKey ?? "",
        anthropicKey: settings.anthropicKey ?? "",
        geminiKey: settings.geminiKey ?? "",
        customEndpoint: settings.customEndpoint ?? "",
        defaultModel: settings.defaultModel ?? "gpt-4o",
      });
    }
  }, [settings]);

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Saved", "Settings updated successfully");
      },
      onError: () => Alert.alert("Error", "Failed to save settings"),
    },
  });

  const handleSave = () => {
    updateSettings.mutate({
      data: {
        openaiKey: form.openaiKey || undefined,
        anthropicKey: form.anthropicKey || undefined,
        geminiKey: form.geminiKey || undefined,
        customEndpoint: form.customEndpoint || undefined,
        defaultModel: form.defaultModel || undefined,
      },
    });
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 16, paddingBottom: botPad + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        </View>

        {/* LLM Keys */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>LLM API KEYS</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <>
              {PROVIDERS.map((p) => (
                <KeyField
                  key={p.key}
                  provider={p}
                  value={form[p.key]}
                  onChange={(v) => setForm((f) => ({ ...f, [p.key]: v }))}
                />
              ))}
            </>
          )}
        </View>

        {/* Default model */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DEFAULT MODEL</Text>
          <View style={[styles.keyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.modelInput, { color: colors.foreground }]}
              value={form.defaultModel}
              onChangeText={(v) => setForm((f) => ({ ...f, defaultModel: v }))}
              placeholder="e.g. gpt-4o, claude-3-5-sonnet"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Custom endpoint */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CUSTOM ENDPOINT</Text>
          <View style={[styles.keyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.modelInput, { color: colors.foreground }]}
              value={form.customEndpoint}
              onChangeText={(v) => setForm((f) => ({ ...f, customEndpoint: v }))}
              placeholder="https://…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={updateSettings.isPending}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          {updateSettings.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <Feather name="shield" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            API keys are stored securely in the server and never exposed to other clients.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  headerRow: { marginBottom: 24 },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  section: { marginBottom: 28, gap: 12 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  keyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  keyLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  connectedDot: { width: 6, height: 6, borderRadius: 3 },
  connectedText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  keyInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  eyeBtn: { padding: 4 },
  modelInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 6,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  infoCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
