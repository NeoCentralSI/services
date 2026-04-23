import { ROLES, LECTURER_ROLES } from "../../constants/roles.js";
import { listSeminars } from "./admin.controller.js";
import { getSeminarOverview } from "./student.controller.js";
import { listSupervisedStudentSeminars } from "./lecturer.controller.js";

export const getThesisSeminarsHome = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role === ROLES.ADMIN) {
    return listSeminars(req, res, next);
  }

  if (req.user.role === ROLES.MAHASISWA) {
    return getSeminarOverview(req, res, next);
  }

  if (LECTURER_ROLES.includes(req.user.role)) {
    return listSupervisedStudentSeminars(req, res, next);
  }

  return res.status(403).json({ message: "Forbidden" });
};
