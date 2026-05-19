import express from "express";
import * as pendaftaranController from "../../controllers/insternship/pendaftaran.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for template uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = "uploads/internship/templates";
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `template-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            cb(null, true);
        } else {
            cb(new Error("Hanya file .docx yang diizinkan"), false);
        }
    }
});

const router = express.Router();

// ==================== 1. Student Registration (/registration/*) ====================
const registrationRouter = express.Router();
registrationRouter.get("/proposals", authGuard, pendaftaranController.getProposals);
registrationRouter.put("/proposals/:id", authGuard, pendaftaranController.updateProposal);
registrationRouter.delete("/proposals/:id", authGuard, pendaftaranController.deleteProposal);
registrationRouter.post("/proposals/:id/respond", authGuard, pendaftaranController.respondToInvitation);
registrationRouter.post("/proposals/:id/company-response", authGuard, pendaftaranController.submitCompanyResponse);
registrationRouter.get("/companies", authGuard, pendaftaranController.listCompanies);
registrationRouter.get("/eligible-students", authGuard, pendaftaranController.listEligibleStudents);
registrationRouter.get("/working-days", authGuard, pendaftaranController.getWorkingDays);
registrationRouter.post("/submit", authGuard, pendaftaranController.submitProposal);
router.use("/registration", registrationRouter);

// ==================== 2. Sekdep Proposals & Companies (/sekdep/*) ====================
const sekdepRouter = express.Router();
sekdepRouter.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

// Proposals
sekdepRouter.get("/proposals", pendaftaranController.getAllProposals);
sekdepRouter.get("/proposals/pending", pendaftaranController.getPendingProposals);
sekdepRouter.get("/proposals/:id", pendaftaranController.getProposalDetail);
sekdepRouter.post("/proposals/:id/respond", pendaftaranController.respondToProposal);

// Companies
sekdepRouter.get("/companies/stats", pendaftaranController.getCompaniesWithStats);
sekdepRouter.post("/companies", pendaftaranController.createCompany);
sekdepRouter.put("/companies/:id", pendaftaranController.updateCompany);
sekdepRouter.delete("/companies/:id", pendaftaranController.deleteCompany);

// Template Management
sekdepRouter.get("/templates/:name", pendaftaranController.getTemplate);
sekdepRouter.get("/templates/:name/preview", pendaftaranController.previewTemplate);
sekdepRouter.post("/templates", upload.single("file"), pendaftaranController.saveSekdepTemplate);

router.use("/sekdep", sekdepRouter);

// ==================== 3. Admin Letters & Company Response (/admin/*) ====================
const adminRouter = express.Router();
adminRouter.use(authGuard, requireRole(ROLES.ADMIN));

adminRouter.get("/companies/stats", pendaftaranController.getCompaniesWithStats);
adminRouter.get("/proposals/assignments", pendaftaranController.getAssignmentProposals);
adminRouter.get("/proposals/approved", pendaftaranController.getApprovedInternshipProposals);
adminRouter.get("/proposals/:id/assignment", pendaftaranController.getAssignmentLetterDetail);
adminRouter.patch("/proposals/:id/assignment-letter", pendaftaranController.updateAssignmentLetter);
adminRouter.get("/proposals/:id", pendaftaranController.getProposalLetterDetail);
adminRouter.patch("/proposals/:id/letter", pendaftaranController.updateProposalLetter);
adminRouter.post("/proposals/:id/company-response", pendaftaranController.adminSubmitCompanyResponse);
adminRouter.post("/company-responses/:id/verify", pendaftaranController.verifyCompanyResponse);

router.use("/admin", adminRouter);

// ==================== 4. Kadep Approval (/kadep/*) ====================
const kadepRouter = express.Router();
kadepRouter.use(authGuard, requireRole(ROLES.KETUA_DEPARTEMEN));

kadepRouter.get("/pending-letters", pendaftaranController.getPendingLetters);
kadepRouter.post("/approve-letter", pendaftaranController.approveLetter);
kadepRouter.get("/companies/stats", pendaftaranController.getCompaniesWithStats);
kadepRouter.post("/companies", pendaftaranController.createCompany);
// Wait, kadepRouter also uses updateCompany and deleteCompany, which map to createCompany, updateCompany, deleteCompany in sekdepController.
kadepRouter.put("/companies/:id", pendaftaranController.updateCompany);
kadepRouter.delete("/companies/:id", pendaftaranController.deleteCompany);

router.use("/kadep", kadepRouter);

// ==================== 5. Holidays (/holidays/*) ====================
const holidayRouter = express.Router();
holidayRouter.use(authGuard);
holidayRouter.get("/", pendaftaranController.getHolidays);

const holidayAdminRouter = express.Router();
holidayAdminRouter.use(requireRole(ROLES.ADMIN));
holidayAdminRouter.post("/", pendaftaranController.createHoliday);
holidayAdminRouter.post("/bulk", pendaftaranController.createManyHolidays);
holidayAdminRouter.post("/sync", pendaftaranController.syncHolidays);
holidayAdminRouter.patch("/:id", pendaftaranController.updateHoliday);
holidayAdminRouter.delete("/:id", pendaftaranController.deleteHoliday);
holidayRouter.use(holidayAdminRouter);

router.use("/holidays", holidayRouter);

// ==================== 6. Admin Templates (/templates/*) ====================
const templateRouter = express.Router();
templateRouter.use(authGuard, requireRole(ROLES.ADMIN));
templateRouter.get("/:name", pendaftaranController.getTemplate);
templateRouter.get("/:name/preview", pendaftaranController.previewTemplate);
templateRouter.post("/", upload.single("file"), pendaftaranController.saveTemplate);

router.use("/templates", templateRouter);

export default router;
