import express from "express";

// ==================== DFD Level 1 Process-based Routes ====================
// 1. Pendaftaran (Registration, Proposals, Letters, Companies, Holidays, Templates)
import pendaftaranRouter from "./insternship/pendaftaran.route.js";
// 2. Penunjukan Dosen Pembimbing (Supervisor Assignment)
import penunjukanPembimbingRouter from "./insternship/penunjukan-pembimbing.route.js";
// 3. Pelaksanaan (Logbook, Reports, Documents)
import pelaksanaanRouter from "./insternship/pelaksanaan.route.js";
// 4. Bimbingan (Guidance - Student & Lecturer)
import bimbinganRouter from "./insternship/bimbingan.route.js";
// 5. Seminar (Seminar Registration & Management)
import seminarRouter from "./insternship/seminar.route.js";
// 6. Penilaian (Assessment - Lecturer, Field, CPMK)
import penilaianRouter from "./insternship/penilaian.route.js";
// 7. Monitoring (Overview, Internship List, Document Verification)
import monitoringRouter from "./insternship/monitoring.route.js";
// 8. Verifikasi Keaslian Surat (Public Letter Verification)
import verifikasiSuratRouter from "./insternship/verifikasi-surat.route.js";

const router = express.Router();

router.use(pendaftaranRouter);
router.use(penunjukanPembimbingRouter);
router.use(pelaksanaanRouter);
router.use(bimbinganRouter);
router.use(seminarRouter);
router.use(penilaianRouter);
router.use(monitoringRouter);
router.use(verifikasiSuratRouter);

export default router;
