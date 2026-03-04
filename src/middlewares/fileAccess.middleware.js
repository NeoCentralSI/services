import prisma from "../config/prisma.js";

export const checkThesisFileAccess = async (req, res, next) => {
    const userId = req.user?.sub;
    const role = req.user?.role;

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
        if (role === "MAHASISWA") {
            const thesis = await prisma.thesis.findFirst({ where: { id: thesisId, studentId: userId } });
            if (!thesis) {
                return res.status(403).json({ message: "Forbidden: You don't have access to this thesis file" });
            }
        } else if (role && role.startsWith("DOSEN_")) {
            // Check if lecturer is supervisor or examiner
            const isSupervisor = await prisma.thesisSupervisors.findFirst({
                where: { thesisId, lecturer: { userId } }
            });
            const isExaminer = await prisma.thesisSeminarExaminer.findFirst({
                where: { seminar: { thesisId }, lecturer: { userId } }
            });
            const isDefenceExaminer = await prisma.thesisDefenceExaminer.findFirst({
                where: { defence: { thesisId }, lecturer: { userId } }
            });

            if (!isSupervisor && !isExaminer && !isDefenceExaminer) {
                return res.status(403).json({ message: "Forbidden: You are not supervising or examining this thesis" });
            }
        }
        // Admins (KOORDINATOR_TA, dll) can access freely

        next();
    } catch (err) {
        next(err);
    }
};
