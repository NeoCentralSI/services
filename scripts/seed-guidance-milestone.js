/**
 * Sample TA guidance sessions with attachments.
 *
 * For every running TA (status `research`) in the active academic year that has an
 * active Pembimbing 1, three completed sessions are created with `phase: "research"`.
 * Each session carries a copy of the sample PDF stored on the session row
 * (uploads/thesis/<thesis_id>/guidance/<guidance_id>/…, no `documents` row) and is
 * linked to an existing milestone of the thesis when there is one.
 *
 * Idempotent: a thesis that already has a TA-phase session with an attachment is
 * skipped. Nothing is deleted.
 *
 * Usage (from app/backend): node scripts/seed-guidance-milestone.js
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { ROLES } from "../src/constants/roles.js";
import { THESIS_STATUS, THESIS_PHASE, TA_PHASE } from "../src/constants/thesisStatus.js";
import { storeGuidanceAttachment } from "../src/helpers/guidanceFile.helper.js";

const prisma = new PrismaClient();
const SAMPLE_PDF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "Sample Laporan TA.pdf");
const SESSIONS_PER_THESIS = 3;
const FIRST_SESSION = new Date("2026-02-05T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const TOPICS = [
    "Diskusi lingkup penelitian dan rumusan masalah",
    "Review studi literatur dan landasan teori",
    "Konsultasi metodologi penelitian dan desain sistem",
];

const FEEDBACKS = [
    "Rumusan masalah sudah tajam. Lanjutkan ke identifikasi variabel penelitian.",
    "Literatur review sudah cukup luas. Pastikan sitasi menggunakan format APA terbaru.",
    "Metodologi sudah tepat. Perhatikan validitas instrumen pengumpulan data.",
];

async function main() {
    console.log("🚀 Seeding contoh bimbingan TA (dengan lampiran)...");

    if (!fs.existsSync(SAMPLE_PDF)) {
        throw new Error(`PDF contoh tidak ditemukan: ${SAMPLE_PDF}`);
    }
    const sampleBuffer = fs.readFileSync(SAMPLE_PDF);

    const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!academicYear) {
        throw new Error("Tidak ada tahun ajaran aktif. Jalankan scripts/seed-master.js lebih dulu.");
    }
    console.log(`✅ Tahun ajaran aktif: ${academicYear.semester} ${academicYear.year}`);

    const theses = await prisma.thesis.findMany({
        where: { academicYearId: academicYear.id, status: THESIS_STATUS.RESEARCH },
        include: {
            student: { include: { user: true } },
            thesisSupervisors: {
                where: { status: "active", role: { name: ROLES.PEMBIMBING_1 } },
            },
            thesisMilestones: {
                where: TA_PHASE,
                orderBy: { orderIndex: "asc" },
            },
        },
        orderBy: { createdAt: "asc" },
    });
    console.log(`📊 ${theses.length} TA berstatus research ditemukan.`);

    const now = new Date();
    let created = 0;
    let skipped = 0;

    for (const thesis of theses) {
        const name = thesis.student?.user?.fullName || thesis.id;
        const supervisorId = thesis.thesisSupervisors[0]?.lecturerId;
        if (!supervisorId) {
            console.warn(`⚠️  ${name}: tidak ada Pembimbing 1 aktif, dilewati.`);
            skipped += 1;
            continue;
        }

        const alreadySeeded = await prisma.thesisGuidance.count({
            where: { thesisId: thesis.id, ...TA_PHASE, filePath: { not: null } },
        });
        if (alreadySeeded > 0) {
            console.log(`⏭️  ${name}: sudah punya sesi berlampiran, dilewati.`);
            skipped += 1;
            continue;
        }

        let createdForThesis = 0;
        for (let i = 0; i < SESSIONS_PER_THESIS; i++) {
            const requestedDate = new Date(FIRST_SESSION.getTime() + i * 12 * DAY);
            if (requestedDate > now) break;
            const approvedDate = new Date(requestedDate.getTime() + 2 * DAY);
            const completedAt = new Date(approvedDate.getTime() + 2 * 60 * 60 * 1000);

            const guidanceId = randomUUID();
            const fileColumns = await storeGuidanceAttachment({
                thesisId: thesis.id,
                guidanceId,
                file: {
                    originalname: `Laporan TA v${i + 1}.pdf`,
                    mimetype: "application/pdf",
                    size: sampleBuffer.length,
                    buffer: sampleBuffer,
                },
                now: requestedDate,
            });

            const milestone = thesis.thesisMilestones[Math.min(i, thesis.thesisMilestones.length - 1)];

            await prisma.thesisGuidance.create({
                data: {
                    id: guidanceId,
                    thesisId: thesis.id,
                    supervisorId,
                    requestedDate,
                    approvedDate,
                    duration: 60,
                    studentNotes: TOPICS[i % TOPICS.length],
                    supervisorFeedback: FEEDBACKS[i % FEEDBACKS.length],
                    sessionSummary: `Bimbingan ke-${i + 1} membahas ${TOPICS[i % TOPICS.length].toLowerCase()}. Progress terpantau lancar.`,
                    summarySubmittedAt: completedAt,
                    status: "completed",
                    completedAt,
                    phase: THESIS_PHASE.RESEARCH,
                    ...fileColumns,
                    ...(milestone ? { milestones: { create: [{ milestoneId: milestone.id }] } } : {}),
                },
            });
            createdForThesis += 1;
        }

        created += createdForThesis;
        console.log(`✅ ${name}: ${createdForThesis} sesi dibuat.`);
    }

    console.log(`\n✨ Selesai. Sesi dibuat: ${created}. TA dilewati: ${skipped}.`);
}

main()
    .catch((e) => {
        console.error("❌ Error during seeding:", e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
