import express from "express";
import studentRouter from "./thesisSeminar/student.seminar.route.js";

const router = express.Router();

router.use("/student", studentRouter);

export default router;
