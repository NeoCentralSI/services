import express from "express";
import * as controller from "../../controllers/insternship/field-assessment.controller.js";

const router = express.Router();

// Public routes — NO authGuard
router.get("/validate/:token", controller.validateToken);
router.post("/verify-pin/:token", controller.verifyPin);
router.post("/submit/:token", controller.submitAssessment);

export default router;
