import { getUserProfile } from "../services/auth.service.js";

/**
 * Middleware khusus untuk modul Thesis Seminar.
 * Memastikan req.user memiliki property `id`, `studentId`, dan `lecturerId`
 * karena struktur lama aplikasi/controller masih sangat bergantung padanya,
 * sedangkan authGuard global hanya menyediakan `req.user.sub`.
 */
export async function populateProfile(req, res, next) {
  try {
    if (!req.user || !req.user.sub) return next();
    
    // Map sub ke id untuk backward compatibility pada controller
    req.user.id = req.user.sub;
    
    // Ambil detail student & lecturer dari auth service
    const profile = await getUserProfile(req.user.sub);
    if (profile) {
      req.user.studentId = profile.student?.id;
      req.user.lecturerId = profile.lecturer?.id;
      req.user.roles = profile.roles?.map(r => r.name) || [];
    }
    
    next();
  } catch (error) {
    next(error);
  }
}
