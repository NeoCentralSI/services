import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import {
  listSeminars,
  getSeminarDetail,
  validateDocument,
} from "../../controllers/thesisSeminar/adminSeminar.controller.js";

const router = express.Router();

// Only Admin can access
router.use(authGuard, requireAnyRole([ROLES.ADMIN]));

// GET /thesisSeminar/admin
router.get("/", listSeminars);

// GET /thesisSeminar/admin/:seminarId
router.get("/:seminarId", getSeminarDetail);

// POST /thesisSeminar/admin/:seminarId/documents/:documentTypeId/validate
router.post("/:seminarId/documents/:documentTypeId/validate", validateDocument);

export default router;
