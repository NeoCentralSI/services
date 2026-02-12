import express from "express";
import registrationRouter from "./insternship/registration.route.js";
import sekdepRouter from "./insternship/sekdep.route.js";

const router = express.Router();

router.use("/registration", registrationRouter);
router.use("/sekdep", sekdepRouter);

export default router;
