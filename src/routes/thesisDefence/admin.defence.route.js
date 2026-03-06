import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import {
  listDefences,
  getDefenceDetail,
  validateDocument,
} from "../../controllers/thesisDefence/adminDefence.controller.js";

const router = express.Router();

router.use(authGuard, requireAnyRole([ROLES.ADMIN]));

router.get("/", listDefences);
router.get("/:defenceId", getDefenceDetail);
router.post("/:defenceId/documents/:documentTypeId/validate", validateDocument);

export default router;
