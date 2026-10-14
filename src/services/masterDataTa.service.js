import prisma from "../config/prisma.js";
import * as masterDataTaRepository from "../repositories/masterDataTa.repository.js";
import { THESIS_STATUS, OPEN_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { THESIS_STATUS_LABELS } from "../constants/thesisLabels.js";
import {
    CREATABLE_THESIS_STATUSES,
    assertSingleOpenThesis,
    statusChangeData,
    applyTerminationSideEffects,
    changeThesisStatus,
    parseTerminationReason,
} from "./thesisLifecycle.service.js";
import {
    createSupervisorAssignments,
    replaceSupervisorAssignments,
    getCanonicalSupervisorRoles,
} from "../utils/supervisorIntegrity.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { summarizeThesisProgress } from "../helpers/thesis-progress.helper.js";

const ALL_THESIS_STATUSES = Object.values(THESIS_STATUS);

/** Legacy status names accepted from imported spreadsheets (K15 mapping). */
const LEGACY_STATUS_NAMES = {
    "diajukan": THESIS_STATUS.PROPOSAL,
    "proposal": THESIS_STATUS.PROPOSAL,
    "bimbingan": THESIS_STATUS.RESEARCH,
    "aktif": THESIS_STATUS.RESEARCH,
    "tugas akhir": THESIS_STATUS.RESEARCH,
    "bss": THESIS_STATUS.ON_LEAVE,
    "selesai": THESIS_STATUS.COMPLETED,
    "lulus": THESIS_STATUS.COMPLETED,
    "gagal": THESIS_STATUS.FAILED,
    "dibatalkan": THESIS_STATUS.FAILED,
    "drop out": THESIS_STATUS.FAILED,
};

/** Parse a spreadsheet "Status" cell into a ThesisLifecycleStatus (null when unknown/empty).
 * Accepts the enum value, its Indonesian label (§2.2b), or a legacy status name. */
export function parseThesisStatusCell(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text || text === "-") return null;
    if (ALL_THESIS_STATUSES.includes(text)) return text;
    const byLabel = Object.entries(THESIS_STATUS_LABELS).find(([, label]) => label.toLowerCase() === text);
    if (byLabel) return byLabel[0];
    return LEGACY_STATUS_NAMES[text] ?? null;
}

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

export const getAllThesesMasterData = async () => {
    const theses = await masterDataTaRepository.findAllTheses();

    // Map data to the format expected by the frontend table
    const now = new Date();
    return theses.map((thesis) => {
        const progress = summarizeThesisProgress(thesis, now);

        return {
            id: thesis.id,
            title: thesis.title,
            // Derived, read-only: activity level and supervision clock (E3).
            activityLevel: progress.activityLevel,
            supervisionClock: progress.supervisionClock,
            startDate: thesis.startDate,
            student: {
                id: thesis.student?.id,
                nim: thesis.student?.user?.identityNumber,
                name: thesis.student?.user?.fullName
            },
            topic: thesis.thesisTopic ? {
                id: thesis.thesisTopic.id,
                name: thesis.thesisTopic.name
            } : null,
            supervisors: thesis.thesisSupervisors.map(ts => ({
                lecturerId: ts.lecturerId,
                name: ts.lecturer?.user?.fullName,
                roleId: ts.roleId,
                roleName: ts.role?.name
            })),
            status: thesis.status,
            // K21: the form offers only allowed transitions (on_leave returns to statusBeforeLeave)
            statusBeforeLeave: thesis.statusBeforeLeave ?? null,
            terminationReason: thesis.terminationReason ?? null,
            terminationNote: thesis.terminationNote ?? null,
            academicYear: thesis.academicYear ? {
                id: thesis.academicYear.id,
                semester: thesis.academicYear.semester,
                year: thesis.academicYear.year
            } : null
        };
    });
};

/** Supervisor input -> [{ lecturerId, roleId }]; P1 required when `requireP1`. */
async function buildSupervisors(client, { pembimbing1, pembimbing2 }, { requireP1 }) {
    const p1 = pembimbing1 && pembimbing1 !== "none" ? pembimbing1 : null;
    const p2 = pembimbing2 && pembimbing2 !== "none" ? pembimbing2 : null;
    if (!p1 && !p2) {
        if (requireP1) throw new ValidationError("Pembimbing 1 wajib diisi.");
        return null;
    }
    if (!p1) throw new ValidationError("Pembimbing 1 wajib diisi bila Pembimbing 2 diisi.");
    if (p1 === p2) throw new ValidationError("Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda.");
    const roles = await getCanonicalSupervisorRoles(client);
    const rows = [{ lecturerId: p1, roleId: roles.pembimbing1.id }];
    if (p2) rows.push({ lecturerId: p2, roleId: roles.pembimbing2.id });
    return rows;
}

async function assertTopicExists(client, thesisTopicId) {
    if (!thesisTopicId) return;
    const topic = await client.thesisTopic.findUnique({ where: { id: thesisTopicId }, select: { id: true } });
    if (!topic) throw new ValidationError("Topik tugas akhir tidak ditemukan.");
}

/**
 * K21 create: one open thesis per student, explicit status (default research), P1 required,
 * `failed` needs a termination reason. The activity level is derived, never an input.
 */
export const createThesisMasterData = async (data, { actorUserId = null, client = prisma } = {}) => {
    const status = data.status ?? THESIS_STATUS.RESEARCH;
    if (!CREATABLE_THESIS_STATUSES.includes(status)) {
        throw new ValidationError(
            `Tugas akhir baru tidak dapat langsung berstatus "${THESIS_STATUS_LABELS[status] ?? status}". Buat dengan status "${THESIS_STATUS_LABELS.research}", lalu ubah statusnya.`
        );
    }

    const activeYear = data.academicYearId
        ? { id: data.academicYearId }
        : await client.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) {
        throw new ValidationError("Tidak ada tahun ajaran aktif di sistem.");
    }

    const startDate = data.startDate ? new Date(data.startDate) : new Date();

    const run = async (tx) => {
        if (OPEN_THESIS_STATUSES.includes(status)) {
            await assertSingleOpenThesis(tx, data.studentId);
        }
        await assertTopicExists(tx, data.thesisTopicId);
        const supervisors = await buildSupervisors(tx, data, { requireP1: true });

        const now = new Date();
        const statusData = statusChangeData(null, status, {
            actorUserId,
            terminationReason: data.terminationReason,
            terminationNote: data.terminationNote,
            now,
        });
        const thesis = await tx.thesis.create({
            data: {
                studentId: data.studentId,
                title: data.title || null,
                thesisTopicId: data.thesisTopicId || null,
                academicYearId: activeYear.id,
                startDate,
                ...statusData,
            },
        });

        await createSupervisorAssignments(tx, thesis.id, supervisors, { requireP1: true });
        // A thesis created as failed keeps its supervisors only as history (released).
        if (status === THESIS_STATUS.FAILED) {
            await applyTerminationSideEffects(tx, thesis.id, { now });
        }
        await tx.auditLog.create({
            data: {
                userId: actorUserId,
                action: AUDIT_ACTIONS.THESIS_CREATED,
                entity: ENTITY_TYPES.THESIS,
                entityId: thesis.id,
                changes: { oldValues: null, newValues: { status, studentId: data.studentId, thesisTopicId: data.thesisTopicId || null }, metadata: { source: "master-data-ta" } },
            },
        });
        return thesis;
    };
    return client === prisma ? prisma.$transaction(run) : run(client);
};

/**
 * K21 update: status follows the K15 transitions (failed / on_leave rules in
 * thesisLifecycle.service), topic and supervisors can be set, replaced supervisors become
 * "released". `startDate` stays editable: it is where the supervision clock starts.
 */
export const updateThesisMasterData = async (id, data, { actorUserId = null, client = prisma } = {}) => {
    const run = async (tx) => {
        const existing = await tx.thesis.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundError("Tugas akhir tidak ditemukan");
        }
        const closed = !OPEN_THESIS_STATUSES.includes(existing.status);
        const wantsSupervisorChange = data.pembimbing1 !== undefined || data.pembimbing2 !== undefined;
        if (closed && wantsSupervisorChange) {
            throw new ValidationError(
                `Pembimbing tugas akhir berstatus "${THESIS_STATUS_LABELS[existing.status]}" tidak dapat diubah.`
            );
        }
        if (data.thesisTopicId !== undefined) await assertTopicExists(tx, data.thesisTopicId);

        const fields = {};
        if (data.title !== undefined) fields.title = data.title || null;
        if (data.thesisTopicId !== undefined) fields.thesisTopicId = data.thesisTopicId || null;
        if (data.academicYearId !== undefined) fields.academicYearId = data.academicYearId || null;
        if (data.startDate !== undefined) fields.startDate = data.startDate ? new Date(data.startDate) : null;
        let thesis = existing;
        if (Object.keys(fields).length > 0) {
            thesis = await tx.thesis.update({ where: { id }, data: fields });
        }

        if (wantsSupervisorChange && !closed) {
            const supervisors = await buildSupervisors(tx, data, { requireP1: true });
            await replaceSupervisorAssignments(tx, id, supervisors, { requireP1: true });
        }

        if (data.status && data.status !== existing.status) {
            const changed = await changeThesisStatus(tx, thesis, data.status, {
                actorUserId,
                terminationReason: data.terminationReason,
                terminationNote: data.terminationNote,
            });
            thesis = changed.thesis;
        }
        return thesis;
    };
    return client === prisma ? prisma.$transaction(run) : run(client);
};

/** Lecturer by full name (exact, case-insensitive), else a unique partial match. */
async function findLecturerByName(name) {
    const exact = await prisma.lecturer.findMany({
        where: { user: { fullName: name } },
        select: { id: true },
        take: 2,
    });
    if (exact.length === 1) return exact[0];
    const partial = await prisma.lecturer.findMany({
        where: { user: { fullName: { contains: name } } },
        select: { id: true },
        take: 2,
    });
    if (partial.length === 1) return partial[0];
    throw new Error(partial.length === 0 ? `Dosen "${name}" tidak ditemukan` : `Nama dosen "${name}" cocok dengan lebih dari satu dosen; tulis nama lengkap`);
}

/**
 * K21 import: each row follows the same rules as add/edit (one open thesis per student,
 * K15 transitions, `failed` needs "Alasan Penghentian", P1 required for a new thesis).
 * A failing row is reported with its row number and never stops the other rows.
 * The "Aktivitas" column of an exported file is ignored: the activity level is derived.
 */
export const importThesesMasterData = async (rows, { actorUserId = null } = {}) => {
    const results = {
        success: 0,
        updated: 0,
        failed: 0,
        errors: [],
        ignoredColumns: ["Aktivitas"],
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // Excel row numbering start at 1, header is row 1

        try {
            const nim = String(row["NIM"] || "").trim();
            if (!nim) throw new Error("NIM tidak boleh kosong");

            const student = await masterDataTaRepository.findStudentByNim(nim);
            if (!student) throw new Error(`Mahasiswa dengan NIM ${nim} tidak ditemukan`);

            // The thesis to update is the student's open thesis; otherwise a new one is created.
            const existingThesis = await prisma.thesis.findFirst({
                where: { studentId: student.id, status: { in: OPEN_THESIS_STATUSES } },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            });

            // Academic Year lookup from "2024 - Ganjil" or "2024/2025 - Ganjil" format
            let academicYearId;
            if (row["Tahun Ajaran"] && row["Tahun Ajaran"] !== "-") {
                const [yearPart, semesterPart] = String(row["Tahun Ajaran"]).split(" - ").map(s => s.trim());
                const yearRange = yearPart && yearPart.includes("/") ? yearPart : (yearPart ? `${yearPart}/${parseInt(yearPart, 10) + 1}` : null);
                const semester = semesterPart && String(semesterPart).toLowerCase() === "genap" ? "genap" : "ganjil";
                const ay = yearRange ? await masterDataTaRepository.findAcademicYearByYearAndSemester(yearRange, semester) : null;
                if (!ay) throw new Error(`Tahun ajaran "${row["Tahun Ajaran"]}" tidak ditemukan`);
                academicYearId = ay.id;
            }

            let thesisTopicId;
            if (row["Topik"] && row["Topik"] !== "-") {
                const topic = await masterDataTaRepository.findTopicByName(String(row["Topik"]).trim());
                if (!topic) throw new Error(`Topik "${row["Topik"]}" tidak ditemukan`);
                thesisTopicId = topic.id;
            }

            const statusCell = row["Status"];
            const status = parseThesisStatusCell(statusCell);
            if (statusCell && String(statusCell).trim() && String(statusCell).trim() !== "-" && !status) {
                throw new Error(`Status "${statusCell}" tidak dikenal`);
            }
            const terminationReason = parseTerminationReason(row["Alasan Penghentian"]);
            if (row["Alasan Penghentian"] && String(row["Alasan Penghentian"]).trim() !== "-" && !terminationReason) {
                throw new Error(`Alasan penghentian "${row["Alasan Penghentian"]}" tidak dikenal`);
            }

            const p1Name = String(row["Pembimbing 1"] || "").trim();
            const p2Name = String(row["Pembimbing 2"] || "").trim();
            const pembimbing1 = p1Name && p1Name !== "-" ? (await findLecturerByName(p1Name)).id : undefined;
            const pembimbing2 = p2Name && p2Name !== "-" ? (await findLecturerByName(p2Name)).id : undefined;

            let startDate;
            if (row["Tanggal Mulai"] && row["Tanggal Mulai"] !== "-") {
                startDate = new Date(row["Tanggal Mulai"]);
                if (isNaN(startDate.getTime())) throw new Error(`Tanggal mulai "${row["Tanggal Mulai"]}" tidak valid`);
            }

            const title = row["Judul Tugas Akhir"] && row["Judul Tugas Akhir"] !== "-" ? String(row["Judul Tugas Akhir"]) : undefined;
            const common = {
                terminationReason,
                terminationNote: row["Catatan Penghentian"] && row["Catatan Penghentian"] !== "-" ? String(row["Catatan Penghentian"]) : undefined,
            };

            if (existingThesis) {
                await updateThesisMasterData(existingThesis.id, {
                    title,
                    thesisTopicId,
                    academicYearId,
                    startDate,
                    status: status ?? undefined,
                    ...(pembimbing1 || pembimbing2 ? { pembimbing1, pembimbing2 } : {}),
                    ...common,
                }, { actorUserId });
                results.updated++;
            } else {
                await createThesisMasterData({
                    studentId: student.id,
                    title,
                    thesisTopicId,
                    academicYearId,
                    startDate,
                    status: status ?? THESIS_STATUS.RESEARCH,
                    pembimbing1,
                    pembimbing2,
                    ...common,
                }, { actorUserId });
                results.success++;
            }
        } catch (err) {
            results.failed++;
            results.errors.push(`Baris ${rowNum}: ${err.message}`);
        }
    }

    return results;
};
