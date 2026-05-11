import prisma from "../config/prisma.js";
import { isStudentRole, isLecturerRole, ROLES } from "../constants/roles.js";

export const checkThesisFileAccess = async (req, res, next) => {
    const userId = req.user?.sub;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    // When mounted at /uploads/thesis, req.path is e.g. /<thesisId>/<filename>
    const parts = req.path.split("/");
    const thesisId = parts[1];

    // Allow general folder or empty thesisId
    if (!thesisId || thesisId === "general") {
        return next();
    }

    try {
        // Resolve roles via DB — JWT contains only sub+email, not role
        const userRoles = await prisma.userHasRole.findMany({
            where: { userId },
            include: { role: { select: { name: true } } },
        });
        const roleNames = userRoles.map((r) => r.role.name);
        const isStudent = roleNames.some(isStudentRole);
        const isLecturer = roleNames.some(isLecturerRole);
        const isMetopenLecturer = roleNames.includes(ROLES.KOORDINATOR_METOPEN);

        if (isStudent) {
            const thesis = await prisma.thesis.findFirst({ where: { id: thesisId, studentId: userId } });
            if (!thesis) {
                return res.status(403).json({ message: "Forbidden: You don't have access to this thesis file" });
            }
        } else if (isLecturer) {
            const isSupervisor = await prisma.thesisParticipant.findFirst({
                where: { thesisId, lecturer: { userId } }
            });
            const isExaminer = await prisma.thesisSeminarExaminer.findFirst({
                where: { seminar: { thesisId }, lecturer: { userId } }
            });
            const isDefenceExaminer = await prisma.thesisDefenceExaminer.findFirst({
                where: { defence: { thesisId }, lecturer: { userId } }
            });

            if (!isSupervisor && !isExaminer && !isDefenceExaminer && !isMetopenLecturer) {
                return res.status(403).json({ message: "Forbidden: You are not supervising or examining this thesis" });
            }
        }
        // Admin and KaDep roles can access all thesis files — no additional check needed

        next();
    } catch (err) {
        next(err);
    }
};
