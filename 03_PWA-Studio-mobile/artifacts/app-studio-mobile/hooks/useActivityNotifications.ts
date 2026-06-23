import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

import { listProjects, getActivityFeed } from "@workspace/api-client-react";

const LAST_SEEN_KEY = "activity_notifications_last_seen_id";
const POLL_INTERVAL_MS = 10_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useActivityNotifications() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkForNewEvents = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const [projects, rawLastId] = await Promise.all([
        listProjects(),
        AsyncStorage.getItem(LAST_SEEN_KEY),
      ]);
      const lastSeenId = rawLastId ? Number(rawLastId) : 0;
      let highestId = lastSeenId;

      for (const project of projects.slice(0, 5)) {
        let events;
        try {
          events = await getActivityFeed(project.id);
        } catch {
          continue;
        }
        const newCritical = events.filter(
          (e) =>
            e.id > lastSeenId &&
            (e.type === "error" || e.type === "success")
        );
        for (const event of newCritical) {
          if (event.id > highestId) highestId = event.id;
          await Notifications.scheduleNotificationAsync({
            content: {
              title:
                event.type === "error"
                  ? `⚠️ ${project.name}`
                  : `✓ ${project.name}`,
              body: event.message,
              data: { projectId: project.id },
              sound: true,
            },
            trigger: null,
          });
        }
      }

      if (highestId > lastSeenId) {
        await AsyncStorage.setItem(LAST_SEEN_KEY, String(highestId));
      }
    } catch {
      // Network failure — silently skip, will retry next interval
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Deep-link handler: tap notification → open project detail
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const projectId = (response.notification.request.content.data as any)
          ?.projectId as number | undefined;
        if (projectId) {
          router.push(`/project/${projectId}`);
        }
      }
    );

    // Poll while app is active
    intervalRef.current = setInterval(checkForNewEvents, POLL_INTERVAL_MS);
    checkForNewEvents();

    // Also re-check when returning to foreground
    const appStateSub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          next === "active"
        ) {
          checkForNewEvents();
        }
        appStateRef.current = next;
      }
    );

    return () => {
      responseSub.remove();
      appStateSub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkForNewEvents]);
}
