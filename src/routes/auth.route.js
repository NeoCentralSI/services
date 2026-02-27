import express from "express";
import { login, refresh, me, doLogout, updateProfileHandler, changePasswordHandler, forgotPassword, verifyResetToken, resetPassword, verifyAccount, requestAccountVerificationController } from "../controllers/auth.controller.js";
import { initiateLogin, handleCallback, mobileLogin } from "../controllers/microsoft-auth.controller.js";
import { authGuard, refreshGuard } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refreshGuard, refresh);
router.get("/me", authGuard, me);
router.post("/logout", authGuard, doLogout);
router.patch("/profile", authGuard, updateProfileHandler);
router.patch("/password", authGuard, changePasswordHandler);
router.post("/reset/request", forgotPassword);
router.get("/reset/verify", verifyResetToken);
router.post("/reset/confirm", resetPassword);
router.get("/verify", verifyAccount);
router.post("/verify/request", requestAccountVerificationController);

// Microsoft OAuth routes
router.get("/microsoft/login", initiateLogin);
router.get("/microsoft/callback", handleCallback);
router.post("/microsoft/mobile", mobileLogin);  // Mobile: accepts MS Graph token, returns our JWT

export default router;

