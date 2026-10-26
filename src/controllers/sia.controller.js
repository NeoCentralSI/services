import { getSyncStatus, getAllCachedStudents } from "../services/sia.store.js";
import { runSiaSync } from "../services/sia.sync.job.js";
import { fetchAcademicRecords } from "../services/sia.client.js";
import { getPeriodFlagCoverage } from "../services/research-method/eligibility.service.js";
import { assertSiaConfigured, isSiaConfigured } from "../helpers/sia-availability.helper.js";

export async function triggerSiaSync(req, res, next) {
  try {
    // Refused with "Sinkronisasi SIA belum tersedia." while SIA_BASE_URL is empty.
    assertSiaConfigured();
    const summary = await runSiaSync();
    res.json({ success: true, message: "Sinkronisasi SIA selesai", summary });
  } catch (err) {
    const message = err?.message || String(err);
    // A hint when SIA cannot be reached.
    if (/fetch failed|ECONNREFUSED|timed out|SIA fetch failed/i.test(message)) {
      err.message =
        `${message}. SIA tidak dapat dihubungi. Untuk uji lokal jalankan dummy-SIA atau set SIA_MOCK=true, lalu mulai ulang backend.`;
      err.statusCode = err.statusCode || 503;
    }
    next(err);
  }
}

export async function siaSyncStatus(req, res, next) {
  try {
    const status = await getSyncStatus();
    // Status sinkronisasi ikut melaporkan berapa mahasiswa yang sudah punya penanda semester
    // berjalan (mengambil Metode Penelitian / Tugas Akhir).
    let periodSnapshots = null;
    try {
      periodSnapshots = await getPeriodFlagCoverage();
    } catch (coverageErr) {
      console.warn(
        "⚠️  Gagal membaca kelengkapan snapshot periode:",
        coverageErr?.message ?? coverageErr,
      );
    }
    // `configured`: false while SIA_BASE_URL is empty; the page disables every SIA read.
    res.json({ success: true, data: { ...status, periodSnapshots, configured: isSiaConfigured() } });
  } catch (err) {
    next(err);
  }
}

export async function periodFlagCoverage(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId || null;
    const data = await getPeriodFlagCoverage(academicYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Full SIA roster. Admin-only. Students read their own flags through the proposal
 * endpoints, never this dump (KC-20260814-03).
 */
export async function getCachedStudents(req, res, next) {
  try {
    let data = [];

    // Try Redis first
    try {
      data = await getAllCachedStudents();
    } catch (redisErr) {
      console.warn("⚠️  Redis unavailable, falling back to SIA source:", redisErr.message);
    }

    // If Redis is empty (not yet synced) or errored, try SIA directly (mock or real), unless SIA is
    // not configured.
    if ((!data || data.length === 0) && isSiaConfigured()) {
      console.log("ℹ️  Redis cache empty, reading from SIA source directly...");
      try {
        data = (await fetchAcademicRecords(1)).data;
      } catch (siaErr) {
        console.warn("⚠️  SIA fetch also failed:", siaErr.message);
        data = [];
      }
    }

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}
