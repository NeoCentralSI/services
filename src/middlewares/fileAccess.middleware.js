import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";

/**
 * Guard for `/uploads/thesis/<thesisId>/...` (Paket B §2.4).
 *
 * The access token carries only `{ sub, email }`, so access is decided from the database
 * by `req.user.sub` (the user id, which is also the Student / Lecturer id):
 *
 * | Path                              | Allowed                                                        |
 * |-----------------------------------|----------------------------------------------------------------|
 * | `/general/...` (or no thesis id)  | any authenticated user (unchanged behaviour)                   |
 * | `/<thesisId>/...` (guidance, ...) | thesis owner; supervisors of the thesis (active or former);    |
 * |                                   | Ketua/Sekretaris Departemen, GKM, Admin (active role)          |
 * | `/<thesisId>/seminar/...`         | the above + seminar examiners + registered seminar audiences   |
 * | `/<thesisId>/defence/...`         | the above + defence examiners (kept from the old guard)        |
 * | `/<thesisId>/proposal/...`        | final proposal (Paket P): owner; ACTIVE supervisors; Koordinator|
 * |                                   | Metode Penelitian, Ketua/Sekretaris Departemen, Admin (active) |
 * | anything else                     | 403                                                            |
 *
 * Two queries run in parallel per request: the caller's privileged roles, and the thesis
 * with only the relations that concern this caller.
 */
export const THESIS_FILE_PRIVILEGED_ROLES = Object.freeze([
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.GKM,
  ROLES.ADMIN,
]);

/** Final proposal files (`/<thesisId>/proposal/...`): the research-method roles, not GKM. */
export const PROPOSAL_FILE_PRIVILEGED_ROLES = Object.freeze([
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.ADMIN,
  ROLES.KOORDINATOR_METODE_PENELITIAN,
]);

const forbidden = (res) =>
  res.status(403).json({ message: "Anda tidak memiliki akses ke berkas tugas akhir ini" });

export const checkThesisFileAccess = async (req, res, next) => {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Mounted at /uploads/thesis, so req.path is /<thesisId>/<subfolder?>/<file>
  let decoded;
  try {
    decoded = decodeURIComponent(req.path);
  } catch {
    return res.status(400).json({ message: "URL berkas tidak valid" });
  }
  // Reject "." / ".." segments before any shortcut: express.static would normalise
  // e.g. /general/../<thesisId>/... into another thesis folder.
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) {
    return forbidden(res);
  }
  const thesisId = parts[0];

  // General folder (or a bare listing) keeps the old behaviour.
  if (!thesisId || thesisId === "general") {
    return next();
  }

  const subfolder = parts.length > 2 ? parts[1] : null;
  const isSeminarFile = subfolder === "seminar";
  const isDefenceFile = subfolder === "defence";
  const isProposalFile = subfolder === "proposal";

  try {
    const [privilegedRole, thesis] = await Promise.all([
      prisma.userHasRole.findFirst({
        where: {
          userId,
          status: "active",
          role: { name: { in: isProposalFile ? PROPOSAL_FILE_PRIVILEGED_ROLES : THESIS_FILE_PRIVILEGED_ROLES } },
        },
        select: { roleId: true },
      }),
      prisma.thesis.findUnique({
        where: { id: thesisId },
        select: {
          studentId: true,
          // any relation status: former supervisors keep read access to history;
          // a final proposal is read by active supervisors only
          thesisSupervisors: {
            where: isProposalFile ? { lecturerId: userId, status: "active" } : { lecturerId: userId },
            select: { id: true },
            take: 1,
          },
          ...(isSeminarFile
            ? {
                thesisSeminars: {
                  select: {
                    examiners: { where: { lecturerId: userId }, select: { id: true }, take: 1 },
                    audiences: { where: { studentId: userId }, select: { studentId: true }, take: 1 },
                  },
                },
              }
            : {}),
          ...(isDefenceFile
            ? {
                thesisDefences: {
                  select: { examiners: { where: { lecturerId: userId }, select: { id: true }, take: 1 } },
                },
              }
            : {}),
        },
      }),
    ]);

    if (privilegedRole) return next();
    if (!thesis) return forbidden(res);

    const isOwner = thesis.studentId === userId;
    const isSupervisor = (thesis.thesisSupervisors?.length ?? 0) > 0;
    const isSeminarParticipant =
      isSeminarFile &&
      (thesis.thesisSeminars ?? []).some((s) => (s.examiners?.length ?? 0) > 0 || (s.audiences?.length ?? 0) > 0);
    const isDefenceExaminer =
      isDefenceFile && (thesis.thesisDefences ?? []).some((d) => (d.examiners?.length ?? 0) > 0);

    if (isOwner || isSupervisor || isSeminarParticipant || isDefenceExaminer) {
      return next();
    }
    return forbidden(res);
  } catch (err) {
    next(err);
  }
};
