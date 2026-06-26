import { getUserProfile } from "../services/auth.service.js";

/**
 * Middleware untuk modul Yudisium.
 * Menambahkan `id`, `studentId`, `lecturerId`, dan `roles` ke req.user
 * supaya controller resource-oriented dapat dengan mudah membaca konteks user
 * (authGuard global hanya menyediakan `req.user.sub`).
 */
export async function populateProfile(req, res, next) {
  try {
    if (!req.user || !req.user.sub) return next();

    req.user.id = req.user.sub;

    const profile = await getUserProfile(req.user.sub);
    if (profile) {
      req.user.studentId = profile.student?.id;
      req.user.lecturerId = profile.lecturer?.id;
      req.user.roles = profile.roles?.map((r) => r.name) || [];
    }

    next();
  } catch (error) {
    next(error);
  }
}
