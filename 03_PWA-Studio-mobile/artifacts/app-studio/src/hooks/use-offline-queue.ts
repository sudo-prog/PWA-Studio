/**
 * Durable offline mutation queue backed by IndexedDB.
 *
 * Usage:
 *   const { enqueue, drainQueue } = useOfflineQueue();
 *
 * - `enqueue(entry)` persists a mutation to IndexedDB so it survives page reloads.
 * - `drainQueue(executor)` replays pending mutations in order and removes successes.
 * - The AppLayout calls drainQueue on every transition from offline → online.
 * - The service worker posts { type: 'SYNC_AGENT_QUEUE' } on background-sync;
 *   main.tsx forwards that message to drainQueue as well.
 */

import { useCallback } from "react";

const DB_NAME = "app-studio-offline-queue";
const STORE = "mutations";
const DB_VERSION = 1;

export interface QueuedMutation {
  id?: number;
  method: string;
  url: string;
  body: unknown;
  enqueuedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToStore(entry: Omit<QueuedMutation, "id">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFromStore(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromStore(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useOfflineQueue() {
  const enqueue = useCallback(async (entry: Omit<QueuedMutation, "id" | "enqueuedAt">) => {
    await addToStore({ ...entry, enqueuedAt: Date.now() });

    // Register background sync so SW can replay when online
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      try {
        await (reg as any).sync.register("agent-action-queue");
      } catch {
        // Sync not supported — will drain on next online event
      }
    }
  }, []);

  const drainQueue = useCallback(async () => {
    const pending = await getAllFromStore();
    if (pending.length === 0) return;

    for (const mutation of pending) {
      try {
        const resp = await fetch(mutation.url, {
          method: mutation.method,
          headers: { "Content-Type": "application/json" },
          body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        });
        if (resp.ok && mutation.id !== undefined) {
          await deleteFromStore(mutation.id);
        }
      } catch {
        // Still offline — leave in queue
        break;
      }
    }
  }, []);

  return { enqueue, drainQueue };
}
