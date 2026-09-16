import { getSyncStatus, getAllCachedStudents } from "../services/sia.store.js";
import { runSiaSync } from "../services/sia.sync.job.js";
import { fetchStudentsFull } from "../services/sia.client.js";
import {
  backfillPeriodSnapshots,
  getPeriodSnapshotCoverage,
} from "../services/studentPeriodSnapshot.service.js";
import { getMetopenSiaOperations } from "../services/metopenOperations.service.js";
import { releaseWaitingKrsBookingByAdmin } from "../services/metopen.service.js";
import { ENV } from "../config/env.js";

export async function triggerSiaSync(req, res, next) {
  try {
    const summary = await runSiaSync();
    res.json({ success: true, message: "SIA sync triggered", summary });
  } catch (err) {
    const message = err?.message || String(err);
    // Surface a UAT-friendly hint when the external SIA host is down.
    if (/fetch failed|ECONNREFUSED|timed out|SIA fetch failed/i.test(message)) {
      err.message =
        `${message}. Service SIA eksternal tidak terjangkau. Untuk UAT/lokal set SIA_MOCK=true di services/.env lalu restart backend.`;
      err.statusCode = err.statusCode || 503;
    }
    next(err);
  }
}

export async function siaSyncStatus(req, res, next) {
  try {
    const status = await getSyncStatus();
    // Status sinkronisasi ikut melaporkan kelengkapan snapshot periode operasional
    // supaya Admin tidak perlu menunggu laporan Koordinator untuk tahu roster kosong.
    let periodSnapshots = null;
    try {
      periodSnapshots = await getPeriodSnapshotCoverage();
    } catch (coverageErr) {
      console.warn(
        "⚠️  Gagal membaca kelengkapan snapshot periode:",
        coverageErr?.message ?? coverageErr,
      );
    }
    res.json({ success: true, data: { ...status, periodSnapshots } });
  } catch (err) {
    next(err);
  }
}

export async function periodSnapshotCoverage(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId || null;
    const data = await getPeriodSnapshotCoverage(academicYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function triggerPeriodSnapshotBackfill(req, res, next) {
  try {
    const {
      academicYearId = null,
      apply = false,
      includeThesisCourse = false,
    } = req.validated ?? {};
    const data = await backfillPeriodSnapshots(academicYearId, {
      apply,
      includeThesisCourse,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Full SIA roster. Admin-only. Students must use GET /metopen/eligibility
 * plus their own `authUser.student` fields — never this dump (KC-20260814-03).
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

    // If Redis is empty (not yet synced) or errored, try SIA directly (mock or real)
    if (!data || data.length === 0) {
      console.log("ℹ️  Redis cache empty, reading from SIA source directly...");
      try {
        data = await fetchStudentsFull(1);
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

export async function getMetopenOperations(req, res, next) {
  try {
    const data = await getMetopenSiaOperations();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function releaseWaitingKrs(req, res, next) {
  try {
    const requestId = req.params.requestId;
    const data = await releaseWaitingKrsBookingByAdmin(requestId, req.user?.sub ?? null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
