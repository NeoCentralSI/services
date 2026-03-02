import express from "express";
import studentRouter from "./thesisSeminar/student.seminar.route.js";
import adminRouter from "./thesisSeminar/admin.seminar.route.js";

const router = express.Router();

router.use("/student", studentRouter);
router.use("/admin", adminRouter);

export default router;
