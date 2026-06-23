/**
 * useOfflineMutate — wraps a React Query mutate function with offline queuing.
 *
 * When the browser is online, calls `mutate` normally.
 * When offline, calls `enqueue` to persist the mutation to IndexedDB, then
 * calls `onOffline` (optional) so callers can still apply optimistic UI.
 */
import { useCallback } from "react";
import { useOfflineQueue, QueuedMutation } from "./use-offline-queue";

interface OfflineMutateOptions<T> {
  mutate: (variables: T) => void;
  toQueueEntry: (variables: T) => Omit<QueuedMutation, "id" | "enqueuedAt">;
  onOffline?: (variables: T) => void;
}

export function useOfflineMutate<T>({ mutate, toQueueEntry, onOffline }: OfflineMutateOptions<T>) {
  const { enqueue } = useOfflineQueue();

  return useCallback(
    (variables: T) => {
      if (!navigator.onLine) {
        enqueue(toQueueEntry(variables)).catch(console.error);
        onOffline?.(variables);
      } else {
        mutate(variables);
      }
    },
    [mutate, enqueue, toQueueEntry, onOffline]
  );
}
