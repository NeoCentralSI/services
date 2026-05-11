import { ROLES, LECTURER_ROLES } from "../../constants/roles.js";
import { getEvents as getAdminEvents } from "./admin-yudisium.controller.js";
import { getOverview as getStudentOverview } from "./student-yudisium.controller.js";

export const getYudisiumsHome = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role === ROLES.ADMIN) {
    return getAdminEvents(req, res, next);
  }

  if (req.user.role === ROLES.MAHASISWA) {
    return getStudentOverview(req, res, next);
  }

  if (LECTURER_ROLES.includes(req.user.role)) {
    return getAdminEvents(req, res, next);
  }

  return res.status(403).json({ message: "Forbidden" });
};
