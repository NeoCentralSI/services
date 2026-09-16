/**
 * Penurunan status alur SIMPTA dari kolom yang benar-benar ditulis alur proposal.
 *
 * `thesis.thesis_status_id` adalah lookup warisan modul TA penuh dan tidak pernah
 * diperbarui oleh alur SIMPTA, sehingga tidak boleh dipakai sebagai sumber label
 * pada permukaan SIMPTA (temuan SIMPTA-FUN-023). Kolom yang dipakai di sini:
 *
 * - `thesis.isProposal` + `thesis.activePromotedAt` — promosi beban aktif (canon §5.13)
 * - `research_method_scores.isFinalized` — TA-03 final (BR-21)
 * - `thesis.ta04AssignmentIssuedAt` — SK penugasan TA-04 awal (canon §5.8)
 * - `thesis_advisor_request.status` — booking TA-01/TA-02 (canon §5.2)
 *
 * Enam label user-facing dipakai untuk memampatkan belasan state backend.
 */

export const SIMPTA_THESIS_STATUS = {
  NO_ADVISOR: "Belum Ada Pembimbing",
  ADVISOR_REQUEST: "Pengajuan Pembimbing",
  AWAITING_TA04: "Menunggu TA-04",
  PROPOSAL_GUIDANCE: "Bimbingan Proposal",
  TA03_PUBLISHED: "Nilai TA-03 Terbit",
  ACTIVE_THESIS: "Aktif TA",
};

/** Urutan maju alur, dipakai untuk mengurutkan distribusi dan opsi filter. */
export const SIMPTA_THESIS_STATUS_ORDER = [
  SIMPTA_THESIS_STATUS.NO_ADVISOR,
  SIMPTA_THESIS_STATUS.ADVISOR_REQUEST,
  SIMPTA_THESIS_STATUS.AWAITING_TA04,
  SIMPTA_THESIS_STATUS.PROPOSAL_GUIDANCE,
  SIMPTA_THESIS_STATUS.TA03_PUBLISHED,
  SIMPTA_THESIS_STATUS.ACTIVE_THESIS,
];

/** Booking pembimbing sudah disetujui (termasuk nilai enum legacy). */
const BOOKED_REQUEST_STATUSES = [
  "booking_approved",
  "active_official",
  "approved",
  "override_approved",
  "assigned",
  "closed",
];

/** Pengajuan masih berjalan dan belum menghasilkan booking. */
const IN_FLIGHT_REQUEST_STATUSES = [
  "pending",
  "under_review",
  "pending_kadep",
  "revision_requested",
  "escalated",
];

/**
 * Relasi minimum yang wajib ikut diambil agar penurunan status akurat.
 * Bentuk ini aman dipakai di blok `include` Prisma (relasi saja, tanpa skalar).
 */
export const SIMPTA_THESIS_STATUS_INCLUDE = {
  researchMethodScores: {
    select: {
      supervisorScore: true,
      lecturerScore: true,
      finalScore: true,
      isFinalized: true,
      finalizedAt: true,
      coSignedAt: true,
      attendanceAutoZeroedAt: true,
    },
  },
  advisorRequests: {
    select: { status: true },
  },
};

/**
 * Versi untuk blok `select` Prisma: skalar penentu fase ditambahkan secara
 * eksplisit karena `select` tidak mengembalikan skalar secara otomatis.
 * Dipakai bersama oleh query daftar, detail, dan laporan supaya tidak ada
 * permukaan yang menurunkan status dari data yang tidak lengkap.
 */
export const SIMPTA_THESIS_STATUS_SELECT = {
  isProposal: true,
  activePromotedAt: true,
  ta04AssignmentIssuedAt: true,
  proposalStatus: true,
  ...SIMPTA_THESIS_STATUS_INCLUDE,
};

function hasRequestWithStatus(thesis, statuses) {
  return (thesis?.advisorRequests || []).some((request) => statuses.includes(request?.status));
}

function isPromoted(thesis) {
  return thesis?.isProposal === false || Boolean(thesis?.activePromotedAt);
}

function hasFinalizedTa03(thesis) {
  return (thesis?.researchMethodScores || []).some((score) => score?.isFinalized === true);
}

/**
 * Turunkan satu label status alur SIMPTA dari sebuah baris thesis.
 * Urutan pengecekan mengikuti kemajuan alur, dari fase paling akhir ke awal.
 *
 * @param {Object} thesis - baris thesis yang di-select dengan SIMPTA_THESIS_STATUS_SELECT
 * @returns {string} salah satu nilai SIMPTA_THESIS_STATUS
 */
export function deriveSimptaThesisStatus(thesis) {
  if (!thesis) return SIMPTA_THESIS_STATUS.NO_ADVISOR;
  if (isPromoted(thesis)) return SIMPTA_THESIS_STATUS.ACTIVE_THESIS;
  if (hasFinalizedTa03(thesis)) return SIMPTA_THESIS_STATUS.TA03_PUBLISHED;
  if (thesis.ta04AssignmentIssuedAt) return SIMPTA_THESIS_STATUS.PROPOSAL_GUIDANCE;
  if (hasRequestWithStatus(thesis, BOOKED_REQUEST_STATUSES)) return SIMPTA_THESIS_STATUS.AWAITING_TA04;
  if (hasRequestWithStatus(thesis, IN_FLIGHT_REQUEST_STATUSES)) return SIMPTA_THESIS_STATUS.ADVISOR_REQUEST;
  return SIMPTA_THESIS_STATUS.NO_ADVISOR;
}

/**
 * Ringkasan status penugasan TA-04 untuk permukaan monitoring read-only.
 * KaDep tetap satu-satunya yang menerbitkan batch (BR-24); ini hanya pembacaan.
 *
 * @param {Object} thesis
 * @returns {{issued: boolean, issuedAt: (Date|string|null)}}
 */
export function buildTa04Snapshot(thesis) {
  return {
    issued: Boolean(thesis?.ta04AssignmentIssuedAt),
    issuedAt: thesis?.ta04AssignmentIssuedAt || null,
  };
}

/**
 * Ringkasan nilai TA-03 untuk permukaan monitoring read-only.
 * `autoZeroed` dipisahkan dari `isFinalized` karena auto-zero presensi (BR-28)
 * juga menutup penilaian, dan pembaca laporan harus bisa membedakannya.
 *
 * @param {Object} thesis
 * @returns {Object|null} null bila belum ada baris penilaian sama sekali
 */
export function buildTa03Snapshot(thesis) {
  const score = (thesis?.researchMethodScores || [])[0];
  if (!score) return null;

  return {
    ta03a: score.supervisorScore ?? null,
    ta03b: score.lecturerScore ?? null,
    finalScore: score.finalScore ?? null,
    isFinalized: Boolean(score.isFinalized),
    finalizedAt: score.finalizedAt || null,
    coSigned: Boolean(score.coSignedAt),
    autoZeroed: Boolean(score.attendanceAutoZeroedAt),
  };
}

const NOT_PROMOTED = { isProposal: true, activePromotedAt: null };
const TA03_FINALIZED = { researchMethodScores: { some: { isFinalized: true } } };
const HAS_BOOKED_REQUEST = { advisorRequests: { some: { status: { in: BOOKED_REQUEST_STATUSES } } } };
const HAS_IN_FLIGHT_REQUEST = { advisorRequests: { some: { status: { in: IN_FLIGHT_REQUEST_STATUSES } } } };

/**
 * Fragment Prisma `where` per label. Mencerminkan persis urutan
 * `deriveSimptaThesisStatus` sehingga setiap thesis jatuh ke tepat satu label,
 * dan filter/hitung distribusi tetap dikerjakan di database (bukan di memori).
 */
const SIMPTA_THESIS_STATUS_WHERE = {
  [SIMPTA_THESIS_STATUS.ACTIVE_THESIS]: {
    OR: [{ isProposal: false }, { activePromotedAt: { not: null } }],
  },
  [SIMPTA_THESIS_STATUS.TA03_PUBLISHED]: {
    ...NOT_PROMOTED,
    ...TA03_FINALIZED,
  },
  [SIMPTA_THESIS_STATUS.PROPOSAL_GUIDANCE]: {
    ...NOT_PROMOTED,
    ta04AssignmentIssuedAt: { not: null },
    NOT: [TA03_FINALIZED],
  },
  [SIMPTA_THESIS_STATUS.AWAITING_TA04]: {
    ...NOT_PROMOTED,
    ta04AssignmentIssuedAt: null,
    ...HAS_BOOKED_REQUEST,
    NOT: [TA03_FINALIZED],
  },
  [SIMPTA_THESIS_STATUS.ADVISOR_REQUEST]: {
    ...NOT_PROMOTED,
    ta04AssignmentIssuedAt: null,
    ...HAS_IN_FLIGHT_REQUEST,
    NOT: [TA03_FINALIZED, HAS_BOOKED_REQUEST],
  },
  [SIMPTA_THESIS_STATUS.NO_ADVISOR]: {
    ...NOT_PROMOTED,
    ta04AssignmentIssuedAt: null,
    NOT: [TA03_FINALIZED, HAS_BOOKED_REQUEST, HAS_IN_FLIGHT_REQUEST],
  },
};

/**
 * @param {string} label - label user-facing dari SIMPTA_THESIS_STATUS
 * @returns {Object|null} fragment Prisma `where`, atau null bila label tidak dikenal
 */
export function buildSimptaThesisStatusWhere(label) {
  return SIMPTA_THESIS_STATUS_WHERE[label] || null;
}
