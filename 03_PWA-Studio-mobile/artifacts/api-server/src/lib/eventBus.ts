import { EventEmitter } from "events";

export type ProjectEventType =
  | "tasks_updated"
  | "kanban_updated"
  | "activity_added"
  | "agents_updated"
  | "agent_step";

export interface ProjectEvent {
  type: ProjectEventType;
  projectId: number;
  payload?: unknown;
}

class ProjectEventBus extends EventEmitter {}

export const eventBus = new ProjectEventBus();
eventBus.setMaxListeners(1000);

export function emitProjectEvent(
  projectId: number,
  type: ProjectEventType,
  payload?: unknown
): void {
  eventBus.emit(`project:${projectId}`, { type, projectId, payload });
}
