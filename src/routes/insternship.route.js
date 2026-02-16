import express from "express";
import registrationRouter from "./insternship/registration.route.js";
import sekdepRouter from "./insternship/sekdep.route.js";
import adminRouter from "./insternship/admin.route.js";
import templateRouter from "./insternship/template.route.js";
import kadepRouter from "./insternship/kadep.route.js";
import publicRouter from "./insternship/public.route.js";

const router = express.Router();

router.use("/registration", registrationRouter);
router.use("/sekdep", sekdepRouter);
router.use("/admin", adminRouter);
router.use("/templates", templateRouter);
router.use("/kadep", kadepRouter);
router.use("/public", publicRouter);

export default router;
