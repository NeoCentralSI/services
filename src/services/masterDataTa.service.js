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
        const siaBase = process.env.SIA_BASE_URL || "http://localhost:4000";
        const response = await fetch(`${siaBase}/sync-ta`, {
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

export const importThesesMasterData = async (rows) => {
    const results = {
        success: 0,
        updated: 0,
        failed: 0,
        errors: []
    };

    // Pre-cache roles
    const [utamaRole, pendampingRole] = await Promise.all([
        prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } }),
        prisma.userRole.findFirst({ where: { name: "Pembimbing 2" } })
    ]);

    if (!utamaRole) throw new Error("Role 'Pembimbing 1' tidak ditemukan.");

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // Excel row numbering start at 1, header is row 1

        try {
            const nim = String(row["NIM"] || "").trim();
            if (!nim) throw new Error("NIM tidak boleh kosong");

            // Lookups
            const student = await masterDataTaRepository.findStudentByNim(nim);
            if (!student) throw new Error(`Mahasiswa dengan NIM ${nim} tidak ditemukan`);

            const existingThesis = await masterDataTaRepository.findThesisByStudentId(student.id);

            // Academic Year lookup from "2024 - Ganjil" format
            let academicYearId = null;
            if (row["Tahun Ajaran"]) {
                const [year, semester] = String(row["Tahun Ajaran"]).split(" - ").map(s => s.trim());
                const ay = await masterDataTaRepository.findAcademicYearByYearAndSemester(year, semester);
                if (ay) academicYearId = ay.id;
            }

            // Topic lookup
            let topicId = null;
            if (row["Topik"] && row["Topik"] !== "-") {
                const topic = await masterDataTaRepository.findTopicByName(row["Topik"]);
                if (topic) topicId = topic.id;
            }

            // Status lookup
            let statusId = null;
            if (row["Status"] && row["Status"] !== "-") {
                const status = await masterDataTaRepository.findThesisStatusByName(row["Status"]);
                if (status) statusId = status.id;
            }

            // Supervisors lookup
            const supervisors = [];
            const p1Name = String(row["Pembimbing 1"] || "").trim();
            const p2Name = String(row["Pembimbing 2"] || "").trim();

            if (p1Name && p1Name !== "-") {
                const l1 = await prisma.lecturer.findFirst({
                    where: { user: { fullName: { contains: p1Name } } }
                });
                if (l1) supervisors.push({ lecturerId: l1.id, roleId: utamaRole.id });
            }

            if (p2Name && p2Name !== "-" && pendampingRole) {
                const l2 = await prisma.lecturer.findFirst({
                    where: { user: { fullName: { contains: p2Name } } }
                });
                if (l2) supervisors.push({ lecturerId: l2.id, roleId: pendampingRole.id });
            }

            // Parsing Dates
            let startDate = null;
            if (row["Tanggal Mulai"] && row["Tanggal Mulai"] !== "-") {
                // xlsx-parsed date might be serial number or string
                startDate = new Date(row["Tanggal Mulai"]);
                if (isNaN(startDate.getTime())) startDate = null;
            }

            const payload = {
                title: row["Judul Tugas Akhir"] !== "-" ? row["Judul Tugas Akhir"] : null,
                thesisTopicId: topicId,
                thesisStatusId: statusId,
                academicYearId: academicYearId,
                startDate: startDate || (existingThesis ? existingThesis.startDate : new Date()),
                rating: ["ONGOING", "SLOW", "AT_RISK", "FAILED", "CANCELLED"].includes(row["Rating"])
                    ? row["Rating"]
                    : (existingThesis ? existingThesis.rating : "ONGOING"),
                supervisors: supervisors.length > 0 ? supervisors : undefined
            };

            if (existingThesis) {
                await masterDataTaRepository.updateThesis(existingThesis.id, payload);
                results.updated++;
            } else {
                payload.studentId = student.id;
                // For new records, set 1 year deadline
                const deadline = new Date(payload.startDate);
                deadline.setFullYear(deadline.getFullYear() + 1);
                payload.deadlineDate = deadline;

                await masterDataTaRepository.createThesis(payload);
                results.success++;
            }
        } catch (err) {
            results.failed++;
            results.errors.push(`Baris ${rowNum}: ${err.message}`);
        }
    }

    return results;
};
