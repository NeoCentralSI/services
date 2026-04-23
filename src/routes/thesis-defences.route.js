import express from "express";
import studentRouter from "./thesis-defence/student.route.js";
import adminRouter from "./thesis-defence/admin.route.js";
import lecturerRouter from "./thesis-defence/lecturer.route.js";

const router = express.Router();

router.use("/student", studentRouter);
router.use("/admin", adminRouter);
router.use("/lecturer", lecturerRouter);

export default router;
