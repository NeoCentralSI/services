import prisma from "../../config/prisma.js";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

const PARTICIPANT_STATUS_PRIORITY = {
    registered: 0,
    under_review: 1,
    approved: 2,
    rejected: 3,
    finalized: 4,
};

export const getAdminYudisiumEvents = async () => {
    const events = await prisma.yudisium.findMany({
        orderBy: [{ createdAt: "desc" }],
        select: {
            id: true,
            name: true,
            status: true,
            registrationOpenDate: true,
            registrationCloseDate: true,
            eventDate: true,
            createdAt: true,
            _count: {
                select: { participants: true },
            },
        },
    });

    return events.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        registrationOpenDate: e.registrationOpenDate,
        registrationCloseDate: e.registrationCloseDate,
        eventDate: e.eventDate,
        createdAt: e.createdAt,
        participantCount: e._count.participants,
    }));
};

export const getAdminYudisiumParticipants = async (yudisiumId) => {
    const yudisium = await prisma.yudisium.findUnique({
        where: { id: yudisiumId },
        select: { id: true, name: true, status: true },
    });

    if (!yudisium) {
        throw new NotFoundError("Periode yudisium tidak ditemukan");
    }

    const activeRequirements = await prisma.yudisiumRequirement.findMany({
        where: { isActive: true },
        select: { id: true },
    });
    const totalRequirements = activeRequirements.length;

    const participants = await prisma.yudisiumParticipant.findMany({
        where: { yudisiumId },
        orderBy: { registeredAt: "asc" },
        select: {
            id: true,
            status: true,
            registeredAt: true,
            appointedAt: true,
            notes: true,
            thesis: {
                select: {
                    id: true,
                    title: true,
                    student: {
                        select: {
                            user: {
                                select: {
                                    fullName: true,
                                    identityNumber: true,
                                },
                            },
                        },
                    },
                },
            },
            yudisiumParticipantRequirements: {
                select: {
                    yudisiumRequirementId: true,
                    status: true,
                },
            },
        },
    });

    const mapped = participants.map((p) => {
        const approvedCount = p.yudisiumParticipantRequirements.filter(
            (r) => r.status === "approved"
        ).length;
        const submittedCount = p.yudisiumParticipantRequirements.filter(
            (r) => r.status === "submitted"
        ).length;
        const declinedCount = p.yudisiumParticipantRequirements.filter(
            (r) => r.status === "declined"
        ).length;

        return {
            id: p.id,
            status: p.status,
            registeredAt: p.registeredAt,
            appointedAt: p.appointedAt,
            notes: p.notes,
            studentName: p.thesis?.student?.user?.fullName || "-",
            studentNim: p.thesis?.student?.user?.identityNumber || "-",
            thesisTitle: p.thesis?.title || "-",
            thesisId: p.thesis?.id || null,
            documentSummary: {
                total: totalRequirements,
                submitted: submittedCount,
                approved: approvedCount,
                declined: declinedCount,
            },
        };
    });

    mapped.sort((a, b) => {
        const pa = PARTICIPANT_STATUS_PRIORITY[a.status] ?? 99;
        const pb = PARTICIPANT_STATUS_PRIORITY[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        return dateA - dateB;
    });

    return { yudisium, participants: mapped };
};

export const getAdminYudisiumParticipantDetail = async (participantId) => {
    const participant = await prisma.yudisiumParticipant.findUnique({
        where: { id: participantId },
        select: {
            id: true,
            status: true,
            registeredAt: true,
            appointedAt: true,
            notes: true,
            yudisium: {
                select: { id: true, name: true, status: true },
            },
            thesis: {
                select: {
                    id: true,
                    title: true,
                    student: {
                        select: {
                            user: {
                                select: {
                                    fullName: true,
                                    identityNumber: true,
                                },
                            },
                        },
                    },
                    thesisSupervisors: {
                        select: {
                            lecturer: {
                                select: {
                                    user: { select: { fullName: true } },
                                },
                            },
                            role: { select: { name: true } },
                        },
                    },
                },
            },
            yudisiumParticipantRequirements: {
                select: {
                    yudisiumRequirementId: true,
                    status: true,
                    submittedAt: true,
                    verifiedAt: true,
                    notes: true,
                    document: {
                        select: { id: true, fileName: true, filePath: true },
                    },
                    requirement: {
                        select: { id: true, name: true, description: true, order: true },
                    },
                    verifier: {
                        select: { fullName: true },
                    },
                },
                orderBy: { requirement: { order: "asc" } },
            },
        },
    });

    if (!participant) {
        throw new NotFoundError("Peserta yudisium tidak ditemukan");
    }

    const allRequirements = await prisma.yudisiumRequirement.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, description: true, order: true },
    });

    const uploadedMap = new Map(
        participant.yudisiumParticipantRequirements.map((r) => [r.yudisiumRequirementId, r])
    );

    const documents = allRequirements.map((req) => {
        const uploaded = uploadedMap.get(req.id);
        return {
            requirementId: req.id,
            requirementName: req.name,
            description: req.description,
            order: req.order,
            status: uploaded?.status ?? null,
            submittedAt: uploaded?.submittedAt ?? null,
            verifiedAt: uploaded?.verifiedAt ?? null,
            notes: uploaded?.notes ?? null,
            verifiedBy: uploaded?.verifier?.fullName ?? null,
            document: uploaded?.document
                ? { id: uploaded.document.id, fileName: uploaded.document.fileName, filePath: uploaded.document.filePath }
                : null,
        };
    });

    const supervisors = (participant.thesis?.thesisSupervisors || []).map((ts) => ({
        name: ts.lecturer?.user?.fullName || "-",
        role: ts.role?.name || "-",
    }));

    return {
        id: participant.id,
        status: participant.status,
        registeredAt: participant.registeredAt,
        appointedAt: participant.appointedAt,
        notes: participant.notes,
        yudisium: participant.yudisium,
        studentName: participant.thesis?.student?.user?.fullName || "-",
        studentNim: participant.thesis?.student?.user?.identityNumber || "-",
        thesisTitle: participant.thesis?.title || "-",
        supervisors,
        documents,
    };
};

export const validateYudisiumDocument = async (participantId, requirementId, { action, notes, userId }) => {
    if (!["approve", "decline"].includes(action)) {
        throw new ValidationError('Action harus "approve" atau "decline"');
    }

    const participant = await prisma.yudisiumParticipant.findUnique({
        where: { id: participantId },
        select: { id: true, status: true },
    });

    if (!participant) {
        throw new NotFoundError("Peserta yudisium tidak ditemukan");
    }

    if (participant.status !== "registered") {
        throw new ValidationError(
            "Validasi dokumen hanya dapat dilakukan saat peserta berstatus 'registered'"
        );
    }

    const docRecord = await prisma.yudisiumParticipantRequirement.findUnique({
        where: {
            yudisiumParticipantId_yudisiumRequirementId: {
                yudisiumParticipantId: participantId,
                yudisiumRequirementId: requirementId,
            },
        },
    });

    if (!docRecord) {
        throw new NotFoundError("Dokumen persyaratan tidak ditemukan untuk divalidasi");
    }

    const newStatus = action === "approve" ? "approved" : "declined";

    await prisma.yudisiumParticipantRequirement.update({
        where: {
            yudisiumParticipantId_yudisiumRequirementId: {
                yudisiumParticipantId: participantId,
                yudisiumRequirementId: requirementId,
            },
        },
        data: {
            status: newStatus,
            notes: notes || null,
            verifiedBy: userId,
            verifiedAt: new Date(),
        },
    });

    // Auto-transition: if all docs approved → move participant to under_review
    let participantTransitioned = false;
    if (action === "approve") {
        const activeRequirements = await prisma.yudisiumRequirement.findMany({
            where: { isActive: true },
            select: { id: true },
        });
        const expectedCount = activeRequirements.length;

        const allDocs = await prisma.yudisiumParticipantRequirement.findMany({
            where: { yudisiumParticipantId: participantId },
            select: { yudisiumRequirementId: true, status: true },
        });

        const approvedCount = allDocs.filter((d) => {
            if (d.yudisiumRequirementId === requirementId) return true;
            return d.status === "approved";
        }).length;

        if (approvedCount >= expectedCount) {
            await prisma.yudisiumParticipant.update({
                where: { id: participantId },
                data: { status: "under_review" },
            });
            participantTransitioned = true;
        }
    }

    return {
        requirementId,
        status: newStatus,
        participantTransitioned,
        newParticipantStatus: participantTransitioned ? "under_review" : participant.status,
    };
};
