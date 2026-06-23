import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import layoutsRouter from "./layouts";
import widgetsRouter from "./widgets";
import conversationsRouter from "./conversations";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import importRouter from "./import";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(layoutsRouter);
router.use(widgetsRouter);
router.use(conversationsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(importRouter);

export default router;
