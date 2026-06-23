import { Router, type IRouter } from "express";
import { eventBus, type ProjectEvent } from "../lib/eventBus";

const router: IRouter = Router();

router.get("/projects/:projectId/stream", (req, res): void => {
  const projectId = Number(req.params.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  res.flushHeaders();

  const send = (type: string, data: unknown) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    (res as any).flush?.();
  };

  // Greeting frame so the client knows the connection is live
  send("connected", { projectId });

  // Heartbeat every 20 s to keep proxies alive
  const heartbeatTimer = setInterval(() => {
    res.write(":heartbeat\n\n");
    (res as any).flush?.();
  }, 20_000);

  const handler = (event: ProjectEvent) => {
    send(event.type, { projectId: event.projectId, payload: event.payload });
  };

  eventBus.on(`project:${projectId}`, handler);

  req.on("close", () => {
    clearInterval(heartbeatTimer);
    eventBus.off(`project:${projectId}`, handler);
  });
});

export default router;
