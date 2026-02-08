import express from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { uploadAvatar } from "../middlewares/avatar.middleware.js";
import {
  uploadAvatarHandler,
  deleteAvatarHandler,
  serveAvatarHandler,
  getLecturerDataHandler,
} from "../controllers/profile.controller.js";

const router = express.Router();

// Protected avatar serving (requires auth)
router.get("/avatar/:fileName", authGuard, serveAvatarHandler);

// Upload avatar (authGuard first, then multer middleware, then handler)
router.post("/avatar", authGuard, uploadAvatar, uploadAvatarHandler);

// Delete avatar
router.delete("/avatar", authGuard, deleteAvatarHandler);

// Get lecturer extended data
router.get("/lecturer-data", authGuard, getLecturerDataHandler);

export default router;
