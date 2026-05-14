import express from "express";

const router = express.Router();

router.all(/.*/, (req, res) => {
  res.status(410).json({
    success: false,
    message:
      "Fitur tugas/milestone Metopen sudah dihapus dari scope aktif SIMPTA. Gunakan versi proposal, penilaian TA-03A/TA-03B, dan alur TA-04.",
    path: req.originalUrl,
  });
});

export default router;
