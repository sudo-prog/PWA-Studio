import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

export type StreamEventType =
  | "connected"
  | "tasks_updated"
  | "activity_added"
  | "agents_updated";

export interface StreamEvent {
  type: StreamEventType;
  projectId?: number;
  payload?: unknown;
}

type EventHandler = (event: StreamEvent) => void;

/**
 * Connects to GET /api/projects/:projectId/stream (SSE).
 * Uses fetch + ReadableStream — works in both web (native) and
 * React Native 0.76 (new architecture fetch).
 * Auto-reconnects on network loss.
 */
export function useProjectStream(
  projectId: number | null,
  onEvent: EventHandler
) {
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef<EventHandler>(onEvent);
  onEventRef.current = onEvent;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(async () => {
    if (!projectId) return;

    // Cancel any prior connection
    abortRef.current?.abort();
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const base = Platform.OS === "web"
      ? window.location.origin
      : `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
    const url = `${base}/api/projects/${projectId}/stream`;

    try {
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
        signal: ctrl.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let curEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            curEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onEventRef.current({ type: curEvent as StreamEventType, ...data });
            } catch {
              // malformed data — ignore
            }
            curEvent = "";
          }
          // Ignore comment lines (:heartbeat)
        }
      }

      // Stream ended cleanly — reconnect immediately
      if (!ctrl.signal.aborted) {
        reconnectTimer.current = setTimeout(connect, 500);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // Backoff reconnect on error
      if (!ctrl.signal.aborted) {
        reconnectTimer.current = setTimeout(connect, 3_000);
      }
    }
  }, [projectId]);

  useEffect(() => {
    connect();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") connect();
    });

    return () => {
      sub.remove();
      abortRef.current?.abort();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);
}
