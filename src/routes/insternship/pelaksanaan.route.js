import express from "express";
import * as pelaksanaanController from "../../controllers/insternship/pelaksanaan.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";

const router = express.Router();
const activityRouter = express.Router();

// Logbook
activityRouter.get("/logbook", authGuard, pelaksanaanController.getLogbooks);
activityRouter.get("/logbook/download", authGuard, pelaksanaanController.downloadLogbookPdf);
activityRouter.get("/download-docx", authGuard, pelaksanaanController.downloadLogbookDocx);
activityRouter.post("/logbook/finish", authGuard, pelaksanaanController.lockLogbook);
activityRouter.put("/logbook/:id", authGuard, pelaksanaanController.updateLogbook);

// Internship Details
activityRouter.put("/details", authGuard, pelaksanaanController.updateInternshipDetails);

// Reports & Documents
activityRouter.post("/report", authGuard, pelaksanaanController.submitReport);
activityRouter.post("/certificate", authGuard, pelaksanaanController.updateCompletionCertificate);
activityRouter.post("/receipt", authGuard, pelaksanaanController.updateCompanyReceipt);
activityRouter.post("/company-report", authGuard, pelaksanaanController.submitCompanyReport);
activityRouter.post("/logbook-doc", authGuard, pelaksanaanController.submitLogbook);
activityRouter.post("/final-fix-report", authGuard, pelaksanaanController.submitFinalReport);

router.use("/activity", activityRouter);

export default router;
