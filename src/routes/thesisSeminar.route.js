import express from "express";
import studentRouter from "./thesisSeminar/student.seminar.route.js";
import adminRouter from "./thesisSeminar/admin.seminar.route.js";
import lecturerRouter from "./thesisSeminar/lecturer.seminar.route.js";

const router = express.Router();

router.use("/student", studentRouter);
router.use("/admin", adminRouter);
router.use("/lecturer", lecturerRouter);

export default router;
