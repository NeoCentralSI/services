import prisma from "../config/prisma.js";
import * as masterDataTaRepository from "../repositories/masterDataTa.repository.js";

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
    return theses.map((thesis) => ({
        id: thesis.id,
        title: thesis.title,
        rating: thesis.rating,
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
        status: thesis.thesisStatus?.name || "Belum Ada Status",
        thesisStatusId: thesis.thesisStatusId || "none",
        academicYear: thesis.academicYear ? {
            id: thesis.academicYear.id,
            semester: thesis.academicYear.semester,
            year: thesis.academicYear.year
        } : null
    }));
};

export const getAllThesisStatuses = async () => {
    return await prisma.thesisStatus.findMany({
        orderBy: { id: "asc" }
    });
};

export const createThesisMasterData = async (data) => {
    // 1. Check if student has active thesis (ONGOING, SLOW, AT_RISK)
    const activeThesis = await prisma.thesis.findFirst({
        where: {
            studentId: data.studentId,
            rating: { in: ["ONGOING", "SLOW", "AT_RISK"] }
        }
    });

    if (activeThesis) {
        throw new ValidationError("Mahasiswa masih memiliki Tugas Akhir yang aktif. Hanya dapat menambahkan revisi untuk status FAILED / CANCELLED.");
    }

    // 2. Get active academic year
    const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true }
    });

    if (!activeYear) {
        throw new ValidationError("Tidak ada tahun ajaran aktif di sistem.");
    }

    // 3. Set auto dates
    const startDate = new Date();
    const deadlineDate = new Date();
    deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);

    // 4. Map Pembimbing
    const utamaRole = await prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } });
    const pendampingRole = await prisma.userRole.findFirst({ where: { name: "Pembimbing 2" } });

    if (!utamaRole) {
        throw new Error("Role 'Pembimbing 1' tidak ditemukan di sistem.");
    }

    const supervisors = [
        { lecturerId: data.pembimbing1, roleId: utamaRole.id }
    ];

    if (data.pembimbing2) {
        supervisors.push({
            lecturerId: data.pembimbing2,
            roleId: pendampingRole ? pendampingRole.id : utamaRole.id
        });
    }

    const bimbinganStatus = await prisma.thesisStatus.findFirst({
        where: { name: { contains: "Bimbingan" } }
    });

    const payload = {
        studentId: data.studentId,
        title: data.title || null,
        thesisTopicId: data.thesisTopicId || null,
        academicYearId: activeYear.id,
        thesisStatusId: bimbinganStatus ? bimbinganStatus.id : null,
        startDate,
        deadlineDate,
        supervisors
    };

    return await masterDataTaRepository.createThesis(payload);
};

export const updateThesisMasterData = async (id, data) => {
    const existing = await masterDataTaRepository.findThesisById(id);
    if (!existing) {
        throw new NotFoundError("Thesis not found");
    }

    if (data.pembimbing1) {
        const utamaRole = await prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } });
        const pendampingRole = await prisma.userRole.findFirst({ where: { name: "Pembimbing 2" } });

        if (!utamaRole) {
            throw new Error("Role 'Pembimbing 1' tidak ditemukan di sistem.");
        }

        data.supervisors = [
            { lecturerId: data.pembimbing1, roleId: utamaRole.id }
        ];

        if (data.pembimbing2 && data.pembimbing2 !== "none") {
            data.supervisors.push({
                lecturerId: data.pembimbing2,
                roleId: pendampingRole ? pendampingRole.id : utamaRole.id
            });
        }
    }

    if (data.thesisStatusId === "none" || !data.thesisStatusId) {
        delete data.thesisStatusId;
    }
    delete data.status; // Cleanup legacy field if present

    return await masterDataTaRepository.updateThesis(id, data);
};

export const syncSia = async () => {
    const theses = await masterDataTaRepository.findAllTheses();

    // Format JSON needed for SIA Snapshot
    const syncData = theses.map((thesis) => ({
        id: thesis.id,
        judul: thesis.title || "Belum Ada Judul",
        mahasiswa: {
            nim: thesis.student?.user?.identityNumber,
            nama: thesis.student?.user?.fullName
        },
        pembimbing: thesis.thesisSupervisors.map(ts => ({
            nama: ts.lecturer?.user?.fullName,
            peran: ts.role?.name
        }))
    }));

    try {
        const response = await fetch("http://localhost:4000/sync-ta", {
            method: "POST",
            body: JSON.stringify({ data: syncData }),
            headers: {
                "x-api-token": process.env.SIA_API_TOKEN || "dev-sia-token",
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            let errBody;
            try {
                errBody = await response.json();
            } catch (e) {
                errBody = { message: response.statusText };
            }
            throw new Error(errBody.message || "Request failed");
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error("Gagal melakukan sinkronisasi dengan SIA: " + error.message);
    }
};
