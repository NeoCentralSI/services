import express from "express";
import * as publicController from "../../controllers/insternship/public.controller.js";

const router = express.Router();

router.get("/verify/:id", publicController.verifyLetter);

export default router;
