import express from "express";
import studentRouter from "./thesisDefence/student.defence.route.js";
import adminRouter from "./thesisDefence/admin.defence.route.js";
import lecturerRouter from "./thesisDefence/lecturer.defence.route.js";

const router = express.Router();

router.use("/student", studentRouter);
router.use("/admin", adminRouter);
router.use("/lecturer", lecturerRouter);

export default router;
