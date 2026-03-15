import express from "express";
import { getLogbooks, updateLogbook, updateInternshipDetails, downloadLogbookPdf } from "../../controllers/insternship/activity.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/logbook", authGuard, getLogbooks);
router.get("/logbook/download", authGuard, downloadLogbookPdf);
router.put("/logbook/:id", authGuard, updateLogbook);
router.put("/update-details", authGuard, updateInternshipDetails);

export default router;
