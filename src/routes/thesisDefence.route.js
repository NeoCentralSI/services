import express from "express";
import studentRouter from "./thesisDefence/student.defence.route.js";

const router = express.Router();

router.use("/student", studentRouter);

export default router;
