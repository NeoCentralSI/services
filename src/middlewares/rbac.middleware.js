import prisma from "../config/prisma.js";
import { normalize, ADMIN_ROLES, DEPARTMENT_ROLES } from "../constants/roles.js";

function createError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function includesRole(roleNames = [], expected = []) {
  const normalizedActual = new Set(roleNames.map((roleName) => normalize(roleName)));
  return expected.some((roleName) => normalizedActual.has(normalize(roleName)));
}

async function resolveUserRoles(userId) {
  const assignments = await prisma.userHasRole.findMany({
    where: { userId, status: "active" },
    select: {
      roleId: true,
      role: { select: { name: true } },
    },
  });

  return assignments.map((assignment) => ({
    roleId: assignment.roleId,
    name: assignment.role?.name || "",
  }));
}

export async function loadUserRoles(req, _res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) throw createError("Unauthorized", 401);

    const roles = await resolveUserRoles(userId);
    req.userRoleAssignments = roles;
    req.userRoles = roles.map((role) => role.name).filter(Boolean);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...requiredRoles) {
  return async function requireRolesMiddleware(req, _res, next) {
    try {
      const userId = req.user?.sub;
      if (!userId) throw createError("Unauthorized", 401);

      if (!Array.isArray(req.userRoles)) {
        const roles = await resolveUserRoles(userId);
        req.userRoleAssignments = roles;
        req.userRoles = roles.map((role) => role.name).filter(Boolean);
      }

      if (requiredRoles.length === 0 || includesRole(req.userRoles, requiredRoles)) {
        return next();
      }

      throw createError("Forbidden: insufficient role", 403);
    } catch (error) {
      next(error);
    }
  };
}

export function documentAccessGuard() {
  return async function documentAccessMiddleware(req, _res, next) {
    try {
      const userId = req.user?.sub;
      if (!userId) throw createError("Unauthorized", 401);

      if (!Array.isArray(req.userRoles)) {
        const roles = await resolveUserRoles(userId);
        req.userRoleAssignments = roles;
        req.userRoles = roles.map((role) => role.name).filter(Boolean);
      }

      const documentId = req.params?.id;
      if (!documentId) throw createError("Document ID is required", 400);

      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          userId: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
          updatedAt: true,
          documentType: { select: { id: true, name: true } },
          thesis: {
            select: {
              id: true,
              student: { select: { user: { select: { id: true } } } },
              thesisSupervisors: {
                select: { lecturer: { select: { user: { select: { id: true } } } } },
              },
            },
          },
          thesisFinalDocument: {
            select: {
              id: true,
              student: { select: { user: { select: { id: true } } } },
              thesisSupervisors: {
                select: { lecturer: { select: { user: { select: { id: true } } } } },
              },
            },
          },
          thesisProposalDocument: {
            select: {
              id: true,
              student: { select: { user: { select: { id: true } } } },
              thesisSupervisors: {
                select: { lecturer: { select: { user: { select: { id: true } } } } },
              },
            },
          },
          thesisProposalVersionDocs: {
            select: {
              thesis: {
                select: {
                  id: true,
                  student: { select: { user: { select: { id: true } } } },
                  thesisSupervisors: {
                    select: { lecturer: { select: { user: { select: { id: true } } } } },
                  },
                },
              },
            },
          },
          thesisTitleApprovalDocs: {
            select: {
              id: true,
              student: { select: { user: { select: { id: true } } } },
              thesisSupervisors: {
                select: { lecturer: { select: { user: { select: { id: true } } } } },
              },
            },
          },
          thesisGuidances: {
            select: {
              id: true,
              supervisor: { select: { user: { select: { id: true } } } },
              thesis: {
                select: {
                  id: true,
                  student: { select: { user: { select: { id: true } } } },
                  thesisSupervisors: {
                    select: { lecturer: { select: { user: { select: { id: true } } } } },
                  },
                },
              },
            },
          },
        },
      });

      if (!document) throw createError("Dokumen tidak ditemukan", 404);

      const elevatedRoles = [...ADMIN_ROLES, ...DEPARTMENT_ROLES];
      const isElevatedUser = includesRole(req.userRoles, elevatedRoles);
      const isDirectOwner = document.userId === userId;

      const thesisRelations = [
        ...(document.thesis || []),
        ...(document.thesisFinalDocument || []),
        ...(document.thesisProposalDocument || []),
        ...((document.thesisProposalVersionDocs || [])
          .map((version) => version.thesis)
          .filter(Boolean)),
        ...(document.thesisTitleApprovalDocs || []),
        ...((document.thesisGuidances || []).map((guidance) => guidance.thesis).filter(Boolean)),
      ];

      const relatedStudentIds = new Set(
        thesisRelations
          .map((thesis) => thesis?.student?.user?.id)
          .filter(Boolean)
      );

      const relatedLecturerIds = new Set(
        [
          ...thesisRelations.flatMap((thesis) =>
            (thesis?.thesisSupervisors || []).map(
              (supervisor) => supervisor?.lecturer?.user?.id
            )
          ),
          ...(document.thesisGuidances || []).map(
            (guidance) => guidance?.supervisor?.user?.id
          ),
        ].filter(Boolean)
      );

      const isRelatedToDocument =
        relatedStudentIds.has(userId) || relatedLecturerIds.has(userId);

      if (!isElevatedUser && !isDirectOwner && !isRelatedToDocument) {
        throw createError("Anda tidak memiliki akses ke dokumen ini", 403);
      }

      req.resourceAccess = {
        ...(req.resourceAccess || {}),
        document,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default {
  loadUserRoles,
  requireRoles,
  documentAccessGuard,
};
