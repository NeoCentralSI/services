import express from "express";
import registrationRouter from "./insternship/registration.route.js";
import sekdepRouter from "./insternship/sekdep.route.js";
import adminRouter from "./insternship/admin.route.js";

const router = express.Router();

router.use("/registration", registrationRouter);
router.use("/sekdep", sekdepRouter);
router.use("/admin", adminRouter);

export default router;
