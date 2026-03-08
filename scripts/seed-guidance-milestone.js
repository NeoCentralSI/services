
import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Refined Thesis Guidance Seeding...");

    // 1. Get Academic Year "Genap 2025/2026"
    const academicYear = await prisma.academicYear.findFirst({
        where: {
            semester: "genap",
            year: "2025/2026",
        },
    });

    if (!academicYear) {
        console.error("❌ Academic Year 'Genap 2025/2026' not found!");
        return;
    }

    console.log(`✅ Targeted Academic Year: ${academicYear.id} (${academicYear.semester} ${academicYear.year})`);

    // 2. Cleanup: Delete existing guidances for these theses to allow fresh seeding
    const thesesInAY = await prisma.thesis.findMany({
        where: { academicYearId: academicYear.id },
        select: { id: true },
    });
    const thesisIds = thesesInAY.map(t => t.id);

    console.log(`🧹 Cleaning up existing guidances for ${thesisIds.length} theses...`);
    const deleted = await prisma.thesisGuidance.deleteMany({
        where: { thesisId: { in: thesisIds } },
    });
    console.log(`🗑️ Deleted ${deleted.count} existing guidance records.`);

    // 3. Get all theses for this Academic Year
    const theses = await prisma.thesis.findMany({
        where: {
            academicYearId: academicYear.id,
        },
        include: {
            student: { include: { user: true } },
            thesisSupervisors: {
                where: {
                    role: { name: "Pembimbing 1" },
                },
            },
            thesisMilestones: {
                orderBy: { orderIndex: "asc" },
            },
        },
    });

    console.log(`📊 Found ${theses.length} theses to seed.`);

    const topics = [
        "Diskusi lingkup penelitian dan rumusan masalah",
        "Review studi literatur dan landasan teori",
        "Konsultasi metodologi penelitian dan desain sistem",
        "Review progress implementasi awal dan struktur database",
        "Diskusi hasil pengujian fungsionalitas sistem",
        "Review draf Bab 1 sampai Bab 3",
        "Konsultasi analisis hasil penelitian",
        "Persiapan draf laporan akhir dan demonstrasi",
    ];

    const feedbacks = [
        "Rumusan masalah sudah tajam. Lanjutkan ke identifikasi variabel penelitian.",
        "Literatur review sudah cukup luas. Pastikan sitasi menggunakan format APA terbaru.",
        "Metodologi sudah tepat. Perhatikan validitas instrumen pengumpulan data.",
        "Progress implementasi berjalan baik. Optimalkan query database untuk performa tinggi.",
        "Hasil pengujian menunjukkan sistem stabil. Lakukan pengujian beban (load testing).",
        "Struktur penulisan sudah sesuai pedoman. Perbaiki beberapa typo di draf Bab 2.",
        "Analisis data sudah mendalam. Hubungkan hasil dengan teori yang ada di Bab 2.",
        "Draf laporan sudah mendekati final. Persiapkan slide presentasi yang efektif.",
    ];

    let createdCount = 0;
    const UPLOADS_BASE = "uploads/thesis";

    for (const thesis of theses) {
        // Check actual files in the thesis directory
        const filesDir = path.join(UPLOADS_BASE, thesis.id, "files");
        let existingFiles = [];

        if (fs.existsSync(filesDir)) {
            existingFiles = fs.readdirSync(filesDir)
                .filter(file => file.endsWith(".pdf"))
                .sort(); // Sort to have some deterministic order (v1, v2, etc.)
        }

        // Determine session count: at least 3, or the number of files if more
        const sessionCount = Math.max(3, existingFiles.length);
        const supervisorId = thesis.thesisSupervisors[0]?.lecturerId;

        if (!supervisorId) {
            console.warn(`⚠️ No Pembimbing 1 found for thesis ${thesis.id}. Skipping...`);
            continue;
        }

        const startDate = new Date("2026-02-05");
        const now = new Date();

        for (let i = 0; i < sessionCount; i++) {
            // Space sessions out every ~10-14 days
            const requestedDate = new Date(startDate.getTime() + i * 12 * 24 * 60 * 60 * 1000);
            if (requestedDate > now) break;

            const approvedDate = new Date(requestedDate.getTime() + 2 * 24 * 60 * 60 * 1000);
            const completedAt = new Date(approvedDate.getTime() + 2 * 60 * 60 * 1000);

            // Define standard names
            const nim = thesis.student.user.identityNumber;
            const sanitizedName = thesis.student.user.fullName.replace(/\s+/g, "_");
            const standardFileName = `${nim}_${sanitizedName}_LaporanTA_v${i + 1}.pdf`;
            const standardFilePath = `${UPLOADS_BASE}/${thesis.id}/files/${standardFileName}`;

            // If physical file exists but has a different name (like Sample...), rename it
            if (existingFiles[i]) {
                const oldFile = existingFiles[i];
                if (oldFile !== standardFileName) {
                    const oldPath = path.join(filesDir, oldFile);
                    const newPath = path.join(filesDir, standardFileName);
                    try {
                        fs.renameSync(oldPath, newPath);
                        console.log(`  🔄 Renamed: ${oldFile} -> ${standardFileName}`);
                    } catch (err) {
                        console.error(`  ❌ Failed renaming ${oldFile}:`, err.message);
                    }
                }
            }

            // Create a Document record first to populate file history
            const docRecord = await prisma.document.create({
                data: {
                    userId: thesis.student.user.id,
                    fileName: standardFileName,
                    filePath: standardFilePath,
                }
            });

            // Link to appropriate milestone
            const milestoneIndex = Math.min(i, thesis.thesisMilestones.length - 1);
            const milestoneId = thesis.thesisMilestones[milestoneIndex]?.id;

            const guidance = await prisma.thesisGuidance.create({
                data: {
                    thesisId: thesis.id,
                    supervisorId: supervisorId,
                    requestedDate,
                    approvedDate,
                    duration: 60,
                    documentId: docRecord.id, // Link the new document
                    documentUrl: standardFilePath,
                    studentNotes: topics[i % topics.length],
                    supervisorFeedback: feedbacks[i % feedbacks.length],
                    sessionSummary: `Bimbingan ke-${i + 1} membahas ${topics[i % topics.length].toLowerCase()}. Progress terpantau lancar.`,
                    status: "completed",
                    completedAt,
                }
            });

            if (milestoneId) {
                await prisma.thesisGuidanceMilestone.create({
                    data: {
                        guidanceId: guidance.id,
                        milestoneId: milestoneId,
                    }
                });
            }

            createdCount++;
        }

        // After seeding all guidances for this thesis, set the last document as the main thesis document
        const lastGuidance = await prisma.thesisGuidance.findFirst({
            where: { thesisId: thesis.id, documentId: { not: null } },
            orderBy: { requestedDate: "desc" },
            select: { documentId: true }
        });

        if (lastGuidance?.documentId) {
            await prisma.thesis.update({
                where: { id: thesis.id },
                data: { documentId: lastGuidance.documentId }
            });
        }

        console.log(`✅ Seeded ${sessionCount} guidances for student: ${thesis.student.user.fullName} (${existingFiles.length} files found)`);
    }

    console.log(`\n✨ REFINED SEEDING COMPLETE! Total Guidance Records Created: ${createdCount}`);
}

main()
    .catch((e) => {
        console.error("❌ Error during seeding:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
