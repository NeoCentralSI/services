import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import { sendFcmToUsers } from "../services/push.service.js";
import { createNotificationsForUsers } from "../services/notification.service.js";
import { findUsersByActiveRole } from "../repositories/thesisGuidanceEvaluation.repository.js";

const REMINDER_TYPE = "ta04_batch_finalize_reminder";

/**
 * Audit F-5.2 follow-up (canon v2.6 §5.8): nudge harian ke KaDep agar
 * memfinalisasi Formulir TA-04 awal ketika ada booking TA-01/TA-02 yang belum
 * terhubung ke dokumen batch resmi.
 *
 * Tanpa reminder ini, KaDep harus ingat sendiri klik "Finalisasi Formulir TA-04"
 * di tab Batch TA-04 Awal. Mahasiswa tidak bisa unduh SK penugasan awal sampai
 * batch difinalisasi.
 *
 * Idempotensi: reminder hanya dikirim max 1x per 24 jam per academicYearId
 * (cek notification terbaru dengan type+academicYearId).
 *
 * @returns {{ total: number, reminded: number, skipped: number, failed: number }}
 */
export async function runTa04BatchReminderJob() {
  const started = new Date();
  console.log(`📋 [ta04-batch-reminder] Job started at ${started.toISOString()}`);

  let reminded = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Cari thesis booking_approved yang belum punya dokumen batch resmi
    // (TA04_BATCH_*) dan belum ter-link ke current batch periode-nya.
    const bookingTheses = await prisma.thesis.findMany({
      where: {
        advisorRequests: { some: { status: "booking_approved" } },
        thesisSupervisors: {
          some: {
            status: "active",
            role: { name: ROLES.PEMBIMBING_1 },
          },
        },
      },
      select: {
        id: true,
        academicYearId: true,
        titleApprovalDocument: { select: { fileName: true } },
        academicYear: { select: { id: true, year: true, semester: true } },
      },
    });

    // Filter: dokumen non-batch atau belum ada dokumen sama sekali.
    const missingDocTheses = bookingTheses.filter((t) => {
      const fileName = t.titleApprovalDocument?.fileName;
      if (!fileName) return true;
      return !String(fileName).startsWith("TA04_BATCH_");
    });

    // Cek current batch per academicYear untuk pastikan belum ter-link.
    const academicYearIds = [...new Set(missingDocTheses.map((t) => t.academicYearId).filter(Boolean))];
    if (academicYearIds.length === 0) {
      console.log(`✅ [ta04-batch-reminder] Tidak ada booking tanpa batch dokumen. Job selesai.`);
      return { total: 0, reminded: 0, skipped: 0, failed: 0 };
    }

    const currentBatches = await prisma.ta04BatchMember.findMany({
      where: {
        batch: {
          academicYearId: { in: academicYearIds },
          status: "current",
        },
      },
      select: {
        thesisId: true,
        batch: { select: { id: true, document: { select: { fileName: true } } } },
      },
    });
    const linkedThesisIds = new Set(currentBatches.map((m) => m.thesisId));

    // Aggregate per academicYear: jumlah booking yang belum ter-link batch.
    const perYearPending = new Map();
    for (const t of missingDocTheses) {
      if (!t.academicYearId || linkedThesisIds.has(t.id)) continue;
      const entry = perYearPending.get(t.academicYearId) ?? {
        academicYearId: t.academicYearId,
        academicYear: t.academicYear,
        thesisCount: 0,
      };
      entry.thesisCount += 1;
      perYearPending.set(t.academicYearId, entry);
    }

    if (perYearPending.size === 0) {
      console.log(`✅ [ta04-batch-reminder] Semua booking sudah ter-link batch. Job selesai.`);
      return { total: bookingTheses.length, reminded: 0, skipped: 0, failed: 0 };
    }

    // Cari KaDep user(s) aktif.
    const kadepUsers = await findUsersByActiveRole(ROLES.KETUA_DEPARTEMEN);
    const kadepUserIds = kadepUsers.map((u) => u.id).filter(Boolean);
    if (kadepUserIds.length === 0) {
      console.warn(`⚠️  [ta04-batch-reminder] Tidak ada user KaDep aktif. Skip reminder.`);
      return { total: bookingTheses.length, reminded: 0, skipped: perYearPending.size, failed: 0 };
    }

    // Cek reminder terakhir per academicYear (idempotensi 24 jam).
    const recentReminders = await prisma.notification.findMany({
      where: {
        userId: { in: kadepUserIds },
        type: REMINDER_TYPE,
        createdAt: { gte: new Date(started.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { data: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const recentlyRemindedYearIds = new Set(
      recentReminders
        .map((n) => n.data?.academicYearId)
        .filter(Boolean),
    );

    for (const [academicYearId, entry] of perYearPending) {
      if (recentlyRemindedYearIds.has(academicYearId)) {
        skipped += 1;
        continue;
      }

      const semesterPretty = entry.academicYear
        ? `${entry.academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${entry.academicYear.year ?? ""}`.trim()
        : "periode ini";

      const title = "Formulir TA-04 Perlu Difinalisasi";
      const message = `Ada ${entry.thesisCount} mahasiswa dengan booking TA-01/TA-02 yang belum masuk Formulir TA-04 awal periode ${semesterPretty}. Buka tab Batch TA-04 Awal → Finalisasi TA-04 Awal.`;
      const data = {
        type: REMINDER_TYPE,
        academicYearId,
        thesisCount: entry.thesisCount,
        route: "/kelola/tugas-akhir/kadep/pengesahan-judul",
      };

      try {
        await createNotificationsForUsers(kadepUserIds, {
          title,
          message,
          type: REMINDER_TYPE,
          data,
        });
        await sendFcmToUsers(kadepUserIds, {
          title,
          body: message,
          data,
          dataOnly: true,
        });
        reminded += 1;
      } catch (err) {
        failed += 1;
        console.error(`❌ [ta04-batch-reminder] Gagal kirim reminder untuk academicYear ${academicYearId}:`, err?.message || err);
      }
    }

    const finished = new Date();
    console.log(
      `✅ [ta04-batch-reminder] Job finished at ${finished.toISOString()} — totalBooking: ${bookingTheses.length}, reminded: ${reminded}, skipped: ${skipped}, failed: ${failed}`,
    );
    return { total: bookingTheses.length, reminded, skipped, failed };
  } catch (err) {
    console.error(`❌ [ta04-batch-reminder] Job error:`, err?.message || err);
    return { total: 0, reminded, skipped, failed: failed + 1 };
  }
}
