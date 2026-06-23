import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import kanbanRouter from "./kanban";
import agentsRouter from "./agents";
import directorRouter from "./director";
import canvasRouter from "./canvas";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import sseRouter from "./sse";
import githubRouter from "./github";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sseRouter);
router.use(projectsRouter);
router.use(kanbanRouter);
router.use(agentsRouter);
router.use(directorRouter);
router.use(canvasRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(githubRouter);

export default router;
